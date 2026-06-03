import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { mergeRegistrationFiles } from "@/lib/registration-files";
import { assemblePurchasers } from "@/lib/registration-purchasers";
import { STAGE_CONFIG } from "@/lib/stages";

/**
 * POST /api/register/submit
 * Body: {
 *   token: string,
 *   first_name?: string,                // primary purchaser, split name parts
 *   middle_name?: string,
 *   last_name?: string,
 *   full_legal_name?: string,           // legacy fallback if split parts absent
 *   email?: string,
 *   mobile?: string,
 *   address_line1?: string,
 *   suburb?: string,
 *   state?: string,
 *   postcode?: string,
 *   additionalPurchasers: { first_name?, middle_name?, last_name?, full_legal_name?, email, mobile, idDocumentPaths?: string[] }[],
 *   idDocumentPaths: string[],          // the PRIMARY purchaser's ID documents
 *   paymentRemittancePath?: string | null,
 * }
 *
 * Validates the registration token, updates the contact, marks the token
 * consumed, and flags project requirements. Runs with the service role so
 * anon clients can complete registration without broad RLS changes.
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const body = await req.json();
  const {
    token,
    first_name,
    middle_name,
    last_name,
    full_legal_name,
    email,
    mobile,
    address_line1,
    suburb,
    city,
    state,
    postcode,
    additionalPurchasers = [],
    idDocumentPaths = [],
    paymentRemittancePath = null,
    password,
  } = body ?? {};

  // A resolvable primary name is required — either the split parts (first +
  // last) or the legacy single field.
  const hasSplitName =
    String(first_name || "").trim().length > 0 &&
    String(last_name || "").trim().length > 0;
  const hasLegacyName = String(full_legal_name || "").trim().length > 0;
  if (!token || (!hasSplitName && !hasLegacyName)) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: contact, error: lookupErr } = await admin
    .from("contacts")
    .select("id, email, is_registered, registration_token_used_at")
    .eq("registration_token", token)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!contact) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (contact.is_registered || contact.registration_token_used_at) {
    return NextResponse.json(
      { error: "This registration link has already been used." },
      { status: 410 }
    );
  }

  // Only include paths that sit under the registration prefix for this token.
  // Prevents a client from submitting arbitrary paths from other clients' folders.
  const safePrefix = `registration/${token}/`;

  // Build the purchaser list with each purchaser's OWN ID documents attached,
  // plus a flat list of every ID path (primary first) for the legacy column.
  const { purchasers, flatIdPaths: safeIdPaths } = assemblePurchasers({
    primary: {
      first_name,
      middle_name,
      last_name,
      full_legal_name,
      email: email ?? null,
      mobile: mobile ?? null,
      idDocumentPaths,
    },
    additional: additionalPurchasers,
    safePrefix,
  });

  // Canonical primary name, composed from the split parts (or the legacy
  // fallback) by assemblePurchasers. Used for the project mirror, document
  // labels and the sales-rep notification below.
  const primaryFullName = purchasers[0]?.full_legal_name || "";

  const safeRemittance =
    typeof paymentRemittancePath === "string" && paymentRemittancePath.startsWith(safePrefix)
      ? paymentRemittancePath
      : null;

  // Sweep the token's storage folder so completion is self-healing: if an
  // earlier attempt uploaded files but never finalised (tab closed, POST
  // failed), those files are stranded in storage with no documents row.
  // Listing the folder lets us link everything the client actually
  // uploaded — not just the paths echoed back in this request body.
  // Best-effort: a listing failure must never block registration.
  let folderPaths: string[] = [];
  try {
    const { data: listed } = await admin.storage
      .from("documents")
      .list(`registration/${token}`, { limit: 1000 });
    folderPaths = (listed ?? [])
      // Supabase returns a placeholder row for empty folders; skip it.
      .filter((o) => o.name && o.name !== ".emptyFolderPlaceholder")
      .map((o) => `${safePrefix}${o.name}`);
  } catch (err) {
    console.error("[register/submit] could not list registration folder", err);
  }

  const { idPaths: mergedIdPaths, remittancePaths: mergedRemittancePaths } =
    mergeRegistrationFiles(safeIdPaths, safeRemittance, folderPaths);

  // The folder sweep can surface ID files that weren't attributed to any
  // purchaser in the request body (e.g. a stranded upload from an earlier
  // attempt). They aren't tied to a specific purchaser, so attribute them to
  // the primary so they still create document rows and satisfy the stage
  // requirement — and so every merged path belongs to exactly one purchaser.
  const attributed = new Set<string>(
    purchasers.flatMap((p) => p.id_document_urls)
  );
  const unattributedIds = mergedIdPaths.filter((p) => !attributed.has(p));
  if (unattributedIds.length > 0) {
    purchasers[0].id_document_urls = [
      ...purchasers[0].id_document_urls,
      ...unattributedIds,
    ];
  }

  // Resolve the login email: prefer what the client typed in the form, fall
  // back to the email staff entered when they sent the invite.
  const loginEmail: string | null =
    (typeof email === "string" && email.trim()) || contact.email || null;
  if (!loginEmail) {
    return NextResponse.json(
      { error: "An email address is required to create your portal account." },
      { status: 400 }
    );
  }

  // Create (or update-in-place) the Supabase auth user so the client can log
  // in with email + password immediately. If a user already exists on that
  // email — e.g. from a prior magic-link attempt — rotate their password.
  let authUserId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: loginEmail,
    password,
    email_confirm: true,
    user_metadata: { contact_id: contact.id, source: "client_portal_registration" },
  });

  if (createErr) {
    const existingMsg = String(createErr.message || "").toLowerCase();
    const isDuplicate =
      existingMsg.includes("already") ||
      existingMsg.includes("registered") ||
      existingMsg.includes("exists");
    if (!isDuplicate) {
      return NextResponse.json(
        { error: `Could not create portal account: ${createErr.message}` },
        { status: 500 }
      );
    }

    // Find the existing user and rotate their password.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find(
      (u) => (u.email ?? "").toLowerCase() === loginEmail.toLowerCase()
    );
    if (!existing) {
      return NextResponse.json(
        { error: "An account already exists for this email but could not be updated." },
        { status: 500 }
      );
    }
    const { error: updateAuthErr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (updateAuthErr) {
      return NextResponse.json(
        { error: `Could not set password: ${updateAuthErr.message}` },
        { status: 500 }
      );
    }
    authUserId = existing.id;
  } else {
    authUserId = created.user?.id ?? null;
  }

  const { error: updErr } = await admin
    .from("contacts")
    .update({
      first_name: purchasers[0]?.first_name || undefined,
      middle_name: purchasers[0]?.middle_name ?? undefined,
      last_name: purchasers[0]?.last_name || undefined,
      phone: mobile || undefined,
      address_line1: address_line1 || undefined,
      suburb: suburb || undefined,
      state: state || undefined,
      postcode: postcode || undefined,
      email: loginEmail,
      is_registered: true,
      registration_token_used_at: new Date().toISOString(),
      purchasers,
      id_document_urls: mergedIdPaths,
      linked_user_id: authUserId,
    })
    .eq("id", contact.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Mirror the purchaser details + completion flags onto the contact's project,
  // if one exists. Staff workflow depends on these requirement flags to unlock
  // the next project stage.
  const { data: projects } = await admin
    .from("projects")
    .select("id, name, sales_rep_id, stage, stage_requirements_met")
    .eq("client_id", contact.id)
    .limit(1);

  const project = projects?.[0] || null;

  if (project) {
    // Mirror purchaser + contact details onto the project so the
    // "Initial Deposit Received" stage requirements (and the Contract
    // Request form pre-fill) have real values without the sales rep
    // needing to re-type them.
    // City sits between suburb and state in Australian addresses (e.g.
    // "Lot 58 Whitworth Drive, Berwick, Melbourne VIC 3806"). If the
    // client filled it, include it; otherwise the composed line stays
    // the old 4-part shape.
    const composedCurrentAddress = [
      address_line1,
      suburb,
      city,
      state,
      postcode,
    ]
      .filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim())
      .join(", ");

    await admin
      .from("projects")
      .update({
        client_full_name: primaryFullName,
        client_full_legal_name: primaryFullName,
        client_email: loginEmail,
        client_phone: mobile || undefined,
        client_mobile: mobile || undefined,
        client_current_address: composedCurrentAddress || undefined,
        client_address: composedCurrentAddress || undefined,
        stage_requirements_met: {
          ...((project as any).stage_requirements_met || {}),
          client_id_attached: mergedIdPaths.length > 0,
          purchaser_details_collected: true,
          payment_remittance_attached: mergedRemittancePaths.length > 0,
        },
      })
      .eq("id", project.id);

    // Insert rows into the documents table for any files the client just
    // uploaded. These satisfy the stage-requirement document checks
    // (client_id / confirmation_of_transfer) without any extra action
    // from the sales rep.
    // Each ID is now uploaded against a specific purchaser, so label it by
    // that purchaser's name — "Purchaser 1 ID — <name>", "Purchaser 2 ID —
    // <name>", etc. — instead of guessing by upload order.
    const primaryName = purchasers[0]?.full_legal_name || primaryFullName;

    const rowsToInsert: Array<Record<string, unknown>> = [];
    purchasers.forEach((p, i) => {
      const purchaserName = p.full_legal_name || primaryName;
      for (const path of p.id_document_urls) {
        const publicUrl = admin.storage.from("documents").getPublicUrl(path).data.publicUrl;
        rowsToInsert.push({
          name: `Purchaser ${i + 1} ID — ${purchaserName}`,
          file_url: publicUrl,
          file_type: path.split(".").pop() || "jpg",
          project_id: project.id,
          contact_id: contact.id,
          category: "client_id",
          version: 1,
        });
      }
    });
    for (const path of mergedRemittancePaths) {
      const publicUrl = admin.storage.from("documents").getPublicUrl(path).data.publicUrl;
      rowsToInsert.push({
        name: `Payment Confirmation — ${primaryName}`,
        file_url: publicUrl,
        file_type: path.split(".").pop() || "pdf",
        project_id: project.id,
        contact_id: contact.id,
        category: "confirmation_of_transfer",
        version: 1,
      });
    }
    if (rowsToInsert.length > 0) {
      const { error: docsErr } = await admin.from("documents").insert(rowsToInsert);
      if (docsErr) {
        // Never fail the registration over this — but log it loudly so
        // we can catch broken flows in production instead of the staff
        // noticing empty document slots later.
        console.error(
          "[register/submit] failed to insert attachment documents rows",
          docsErr,
          { rows: rowsToInsert.length, contact_id: contact.id, project_id: project.id }
        );
      }
    }

    // Auto-advance the project to "Contract Request Received" when the
    // client completes portal registration. By this point they've
    // confirmed details, paid the initial deposit and uploaded ID +
    // payment confirmation — the rep's next move is to start the
    // contract request, so move them straight there. We only nudge
    // forward (never backward) to keep us safe against reps already
    // mid-way through the contract pipeline. Stage ordering is sourced
    // from the canonical STAGE_CONFIG so every stage is accounted for —
    // a previous hand-maintained map omitted most stages, which made
    // any project at an unlisted (often later) stage resolve to 0 and
    // get dragged *backward* to Contract Request Received.
    const currentStage = (project as any).stage as string | null;
    const currentOrder = currentStage
      ? STAGE_CONFIG[currentStage]?.order ?? 0
      : 0;
    const targetOrder = STAGE_CONFIG.contract_request_received.order;
    if (currentOrder < targetOrder) {
      const nowIso = new Date().toISOString();
      await admin
        .from("projects")
        .update({
          stage: "contract_request_received",
          stage_entered_date: nowIso,
        })
        .eq("id", project.id);
      // Audit row so the project's history reflects the auto-advance
      // (the DB log_stage_change trigger also picks this up, but an
      // explicit description here makes it obvious in the timeline
      // why the jump happened).
      await admin.from("activities").insert({
        project_id: project.id,
        type: "stage_change",
        title: "Stage auto-advanced to Contract Request Received",
        description:
          "Stage advanced automatically after the client completed portal registration.",
        metadata: {
          new_stage: "contract_request_received",
          old_stage: currentStage,
          source: "portal_registration",
        },
      });
    }
  }

  // Notify the project's sales rep (and admins/directors) in-app that the
  // client has registered. Best-effort: any failure here is logged but
  // doesn't fail the client's registration.
  await notifySalesRepOfRegistration(admin, {
    contactId: contact.id,
    clientName: primaryFullName,
    projectName: project?.name ?? null,
    salesRepId: project?.sales_rep_id ?? null,
  }).catch((err) => console.error("[register/submit] sales rep notify failed", err));

  return NextResponse.json({ success: true });
}

async function notifySalesRepOfRegistration(
  admin: SupabaseClient,
  ctx: {
    contactId: string;
    clientName: string;
    projectName: string | null;
    salesRepId: string | null;
  }
): Promise<void> {
  // Portal registration implies the client has paid their initial deposit
  // and submitted their details — sales rep AND every admin/director need
  // to know. The in-app notification is best-effort; a failure doesn't
  // cascade.
  //
  // NOTE: The CRM monorepo also sends a branded email here via the sales
  // rep's Gmail. That subsystem (per-user Gmail OAuth + email templates)
  // does not live in the portal repo, so this port intentionally raises
  // the in-app notification only. Staff still get the branded email from
  // the CRM side of the system.

  // Resolve the sales rep. Fall back to the contact's sales_rep_id if the
  // project doesn't have one set yet.
  let salesRepId = ctx.salesRepId;
  if (!salesRepId) {
    const { data: c } = await admin
      .from("contacts")
      .select("sales_rep_id")
      .eq("id", ctx.contactId)
      .maybeSingle();
    salesRepId = c?.sales_rep_id ?? null;
  }

  const { data: rep } = salesRepId
    ? await admin
        .from("user_profiles")
        .select("id, email, display_name")
        .eq("id", salesRepId)
        .maybeSingle()
    : { data: null as any };

  // Collect every admin / director to notify alongside the sales rep.
  const { data: admins } = await admin
    .from("user_profiles")
    .select("id, email, display_name, role")
    .in("role", ["admin", "director"]);

  // Unique recipients — skip duplicates (e.g. if the sales rep IS an admin).
  const recipientsMap = new Map<string, { id: string }>();
  if (rep?.id) {
    recipientsMap.set(rep.id, { id: rep.id });
  }
  for (const a of admins ?? []) {
    if (!a?.id) continue;
    if (recipientsMap.has(a.id)) continue;
    recipientsMap.set(a.id, { id: a.id });
  }

  if (recipientsMap.size === 0) return;

  // In-app notifications for every recipient.
  const notificationTitle = `${ctx.clientName || "Client"} registered and paid initial deposit`;
  const notificationMessage =
    `${ctx.clientName || "Client"} has completed their portal registration` +
    `${ctx.projectName ? ` for ${ctx.projectName}` : ""}. ` +
    `Initial deposit has been paid and purchaser details + ID + payment confirmation are on the contact record.`;

  await admin.from("notifications").insert(
    Array.from(recipientsMap.values()).map((r) => ({
      user_id: r.id,
      type: "client_registered",
      title: notificationTitle,
      message: notificationMessage,
      entity_type: "contact",
      entity_id: ctx.contactId,
    }))
  );
}
