/**
 * POST /api/select/confirm — the single write behind the facade & colour
 * selection page. Public by design (allowlisted in middleware): the one time
 * token IS the credential, validated here with the service role.
 *
 * Idempotent: confirming an already completed request returns ok without
 * rewriting anything, so a double tap or refresh can never flip a selection.
 *
 * On a fresh confirm it:
 *   1. writes the picks + completed status onto selection_requests,
 *   2. writes the chosen NAMES onto the project (facade,
 *      external_colour_scheme, internal_colour_scheme) — never the stage,
 *   3. logs the activity on the project,
 *   4. creates a next business day task for the sales rep,
 *   5. pings the CRM webhook (rep notification + email) best effort.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  selectionOpenState,
  validateSelectionChoice,
  describeSelection,
  nextBusinessDay,
  type SelectionRequestRow,
} from "@/lib/selections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const token = body && typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }
  const choice = {
    facade_id: typeof body.facade_id === "string" ? body.facade_id : null,
    external_id: typeof body.external_id === "string" ? body.external_id : null,
    internal_id: typeof body.internal_id === "string" ? body.internal_id : null,
  };

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: request } = await admin
    .from("selection_requests")
    .select(
      "id, project_id, status, include_facades, include_external_colours, include_internal_colours, custom_message, facade_option_ids, external_colour_ids, internal_colour_ids, selected_facade_id, selected_external_id, selected_internal_id, completed_at, expires_at, viewed_at"
    )
    .eq("token", token)
    .maybeSingle();
  if (!request) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }
  const r = request as unknown as SelectionRequestRow;

  const state = selectionOpenState(r, new Date());
  if (state === "completed") {
    // Idempotent: a repeat confirm never rewrites the original picks.
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }
  if (state === "closed") {
    return NextResponse.json(
      { error: "This selection link has expired. Your consultant can send a fresh one." },
      { status: 410 }
    );
  }

  const valid = validateSelectionChoice(r, choice);
  if (!valid.ok) {
    return NextResponse.json({ error: valid.error }, { status: 400 });
  }

  // Resolve chosen names for the project fields + activity wording.
  const [facadeName, externalName, internalName] = await Promise.all([
    optionName(admin, "facade_options", choice.facade_id),
    optionName(admin, "colour_scheme_options", choice.external_id),
    optionName(admin, "colour_scheme_options", choice.internal_id),
  ]);

  const now = new Date();
  // Guarded update: only an open request completes, so two racing confirms
  // cannot both write (the second matches zero rows).
  const { data: updated, error: updErr } = await admin
    .from("selection_requests")
    .update({
      status: "completed",
      completed_at: now.toISOString(),
      selected_facade_id: choice.facade_id,
      selected_external_id: choice.external_id,
      selected_internal_id: choice.internal_id,
    })
    .eq("id", r.id)
    .in("status", ["sent", "viewed"])
    .select("id");
  if (updErr) {
    return NextResponse.json({ error: "Could not save your selection." }, { status: 500 });
  }
  if (!updated?.length) {
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  // 2. Project fields — names, never the stage.
  const projectPatch: Record<string, string> = {};
  if (facadeName) projectPatch.facade = facadeName;
  if (externalName) projectPatch.external_colour_scheme = externalName;
  if (internalName) projectPatch.internal_colour_scheme = internalName;
  if (Object.keys(projectPatch).length) {
    await admin.from("projects").update(projectPatch).eq("id", r.project_id);
  }

  const { data: project } = await admin
    .from("projects")
    .select("id, name, client_id, sales_rep_id")
    .eq("id", r.project_id)
    .maybeSingle();

  const summary = describeSelection({
    facade: facadeName,
    external: externalName,
    internal: internalName,
  });

  // 3. Activity (system entry, no user).
  await admin.from("activities").insert({
    project_id: r.project_id,
    contact_id: project?.client_id ?? null,
    user_id: null,
    type: "note",
    title: summary,
    description: `Confirmed by the client through the selection portal.`,
    metadata: { source: "facade_selection", selection_request_id: r.id },
  });

  // 4. Rep task, due next business day (best effort).
  if (project?.sales_rep_id) {
    try {
      await admin.from("tasks").insert({
        title: `Facade selection received — ${project.name ?? "project"}`,
        description: `${summary}. Review the selection and confirm the next steps with the client.`,
        project_id: r.project_id,
        contact_id: project.client_id ?? null,
        assigned_to: project.sales_rep_id,
        due_date: nextBusinessDay(now),
        priority: "high",
        status: "pending",
        tags: ["selection"],
      });
    } catch {
      // Never block the client's confirmation on task bookkeeping.
    }
  }

  // 5. CRM side effects (in app notification + rep email) — best effort.
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (secret) {
    const crmBase = (process.env.NEXT_PUBLIC_CRM_URL || "https://crm.tkbg.com.au").replace(/\/$/, "");
    try {
      await fetch(`${crmBase}/api/internal/selection-completed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ selection_request_id: r.id }),
      });
    } catch (e) {
      console.error("[select/confirm] CRM webhook failed:", e);
    }
  }

  return NextResponse.json({ ok: true });
}

async function optionName(
  admin: SupabaseClient,
  table: "facade_options" | "colour_scheme_options",
  id: string | null
): Promise<string | null> {
  if (!id) return null;
  const { data } = await admin.from(table).select("name").eq("id", id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}
