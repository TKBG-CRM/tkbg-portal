import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { mergeRegistrationFiles } from "@/lib/registration-files";
import { assemblePurchasers } from "@/lib/registration-purchasers";
import {
  linkRegistrationPartners,
  partnerContactColumns,
} from "@/lib/registration-partners";
import { STAGE_CONFIG } from "@/lib/stages";
import { composeRegistrationNotification } from "@/lib/registration-notification";

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
    state,
    postcode,
    additionalPurchasers = [],
    idDocumentPaths = [],
    paymentRemittancePath = null,
    password,
    // Optional broker / conveyancer the client supplied — turned into CRM
    // contacts and linked onto the project below so staff don't re-enter them.
    broker = null,
    conveyancer = null,
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

  // Registration and payment are decoupled: the link is often sent so the
  // client can register and THEN pay their initial deposit (the portal now
  // shows them the bank details). Treat the deposit as paid only when the
  // client actually attached a payment remittance/receipt — otherwise we must
  // not claim they've paid or jump the project past the deposit stage.
  const depositPaid = mergedRemittancePaths.length > 0;

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

  // Persist any broker/conveyancer the client entered onto the client contact
  // itself — ALWAYS, even when no project exists yet — so the details are never
  // lost, show up on the contact, and carry across to a project on conversion.
  // (Project-level linking still happens below when a project exists.)
  const partnerCols = partnerContactColumns(broker, conveyancer);

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
      ...partnerCols,
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
    .select("id, name, sales_rep_id, stage, stage_requirements_met, broker_id, conveyancer_id")
    .eq("client_id", contact.id)
    .limit(1);

  const project = projects?.[0] || null;

  if (project) {
    // Mirror purchaser + contact details onto the project so the
    // "Initial Deposit Received" stage requirements (and the Contract
    // Request form pre-fill) have real values without the sales rep
    // needing to re-type them.
    const composedCurrentAddress = [
      address_line1,
      suburb,
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

    // Create/reuse the broker + conveyancer contacts the client optionally
    // supplied and link them onto this project (filling gaps only — never
    // overwriting a partner the sales team already set). Best-effort: a failure
    // here must never block the client's registration.
    try {
      await linkRegistrationPartners(admin, {
        projectId: project.id,
        salesRepId: (project as any).sales_rep_id ?? null,
        existingBrokerId: (project as any).broker_id ?? null,
        existingConveyancerId: (project as any).conveyancer_id ?? null,
        broker,
        conveyancer,
      });
    } catch (err) {
      console.error(
        "[register/submit] failed to link broker/conveyancer",
        err,
        { contact_id: contact.id, project_id: project.id }
      );
    }

    // Auto-advance the project to "Contract Request Received" ONLY when the
    // client actually attached payment evidence. Registration alone no longer
    // implies payment — clients frequently register first and pay afterwards —
    // so a registration without a remittance leaves the stage untouched and
    // the deposit stays visibly outstanding for the rep to chase. When a
    // remittance IS attached, they've confirmed details + paid + uploaded ID,
    // so the rep's next move is the contract request. We only nudge forward
    // (never backward); stage ordering is sourced from the canonical
    // STAGE_CONFIG so every stage is accounted for.
    const currentStage = (project as any).stage as string | null;
    const currentOrder = currentStage
      ? STAGE_CONFIG[currentStage]?.order ?? 0
      : 0;
    const targetOrder = STAGE_CONFIG.contract_request_received.order;
    if (depositPaid && currentOrder < targetOrder) {
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
    depositPaid,
  }).catch((err) => console.error("[register/submit] sales rep notify failed", err));

  // Fire the CRM "New Sale" webhook so the team gets the loud cross-channel
  // alert (critical Command Centre banner + branded email + SMS + 12h call
  // task). Fire-and-forget: this is best-effort and must never block or fail
  // the client's success screen, so it's wrapped and only logged on error.
  await notifyCrmClientSignedUp(contact.id, project?.id ?? null);

  return NextResponse.json({ success: true });
}

async function notifySalesRepOfRegistration(
  admin: SupabaseClient,
  ctx: {
    contactId: string;
    clientName: string;
    projectName: string | null;
    salesRepId: string | null;
    /** Whether the client attached payment evidence during registration. */
    depositPaid: boolean;
  }
): Promise<void> {
  // Portal registration means the client submitted their details + ID; it does
  // NOT necessarily mean they've paid (they often register first, then pay).
  // The notification reflects which case this is so the rep knows whether to
  // chase the deposit. Sales rep AND every admin/director are notified. The
  // in-app notification is best-effort; a failure doesn't cascade.
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

  // In-app notifications for every recipient — wording depends on whether the
  // client attached payment evidence.
  const { title: notificationTitle, message: notificationMessage } =
    composeRegistrationNotification({
      clientName: ctx.clientName,
      projectName: ctx.projectName,
      depositPaid: ctx.depositPaid,
    });

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

/**
 * Fire the CRM internal "New Sale" webhook. The CRM owns the loud,
 * cross-channel dispatch (critical Command Centre banner, branded email from
 * the rep's Gmail, alert SMS, and a 12h call task) — subsystems that live in
 * the CRM monorepo, not here. We just tell it a client signed up.
 *
 * Best-effort by design: a missing secret or any network/HTTP error is logged
 * and swallowed so the client's success screen is never blocked or failed.
 */
async function notifyCrmClientSignedUp(
  contactId: string,
  projectId: string | null
): Promise<void> {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[register/submit] INTERNAL_WEBHOOK_SECRET not set — skipping CRM client-signed-up webhook"
    );
    return;
  }
  const crmUrl = (
    process.env.NEXT_PUBLIC_CRM_URL || "https://crm.tkbg.com.au"
  ).replace(/\/$/, "");
  try {
    const res = await fetch(`${crmUrl}/api/internal/client-signed-up`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contact_id: contactId,
        project_id: projectId,
        signed_up_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        "[register/submit] CRM client-signed-up webhook returned non-OK",
        res.status,
        detail
      );
    }
  } catch (err) {
    console.error("[register/submit] CRM client-signed-up webhook failed", err);
  }
}
