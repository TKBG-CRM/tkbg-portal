/**
 * POST /api/select/visualise — AI colour visualiser behind the facade
 * selection page. Public by design (allowlisted with /api/select/*): the one
 * time selection token is the credential.
 *
 * Body: { token, facade_id, scheme_id? , custom? }  (scheme_id from
 * SCHEME_PRESETS, or a custom colour description — one of the two.)
 *
 * Guard rails, in order:
 *   - token must belong to an OPEN request, and facade_id must be one of the
 *     facades offered on THAT request (no other image is reachable);
 *   - a hard cap of MAX_VISUALISATIONS generations per request, counted
 *     atomically server side (paid API on a public page);
 *   - the result is returned inline (data URL) and never stored — it is a
 *     visualisation aid, not an asset.
 *
 * Uses Google's Gemini image model over plain HTTPS (GEMINI_API_KEY env, no
 * SDK). Returns 503 when the key is not configured — the portal page hides
 * the feature in that case.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { selectionOpenState, optionImageUrl, type SelectionRequestRow } from "@/lib/selections";
import {
  MAX_VISUALISATIONS,
  visualisationsRemaining,
  presetById,
  buildVisualiserPrompt,
  customSchemeDescription,
} from "@/lib/visualiser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GEMINI_MODEL = process.env.VISUALISER_MODEL || "gemini-2.5-flash-image";
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!geminiKey) {
    return NextResponse.json(
      { error: "The colour visualiser is not available right now." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const token = body && typeof body.token === "string" ? body.token.trim() : "";
  const facadeId = body && typeof body.facade_id === "string" ? body.facade_id : "";
  if (!/^[a-f0-9]{32,128}$/i.test(token) || !facadeId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Resolve the scheme: preset id or custom description.
  let schemeDescription: string | null = null;
  if (body && typeof body.scheme_id === "string") {
    schemeDescription = presetById(body.scheme_id)?.description ?? null;
  }
  if (!schemeDescription && body && typeof body.custom === "string") {
    schemeDescription = customSchemeDescription(body.custom);
  }
  if (!schemeDescription) {
    return NextResponse.json(
      { error: "Choose a colour scheme or describe one first." },
      { status: 400 }
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: request } = await admin
    .from("selection_requests")
    .select(
      "id, project_id, status, include_facades, include_external_colours, include_internal_colours, custom_message, facade_option_ids, external_colour_ids, internal_colour_ids, selected_facade_id, selected_external_id, selected_internal_id, completed_at, expires_at, viewed_at, ai_visualiser_count"
    )
    .eq("token", token)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  const r = request as unknown as SelectionRequestRow & { ai_visualiser_count: number };

  if (selectionOpenState(r, new Date()) !== "open") {
    return NextResponse.json({ error: "This selection link has closed." }, { status: 410 });
  }
  if (!r.facade_option_ids.includes(facadeId)) {
    return NextResponse.json({ error: "That facade is not part of this selection." }, { status: 400 });
  }
  if (visualisationsRemaining(r.ai_visualiser_count ?? 0) <= 0) {
    return NextResponse.json(
      { error: "You have used all the visualisations for this selection. Your consultant can help with more colour options." },
      { status: 429 }
    );
  }

  // Claim a generation atomically BEFORE the paid call: the guarded update
  // only wins while under the cap, so parallel requests cannot overrun it.
  const { data: claimed } = await admin
    .from("selection_requests")
    .update({ ai_visualiser_count: (r.ai_visualiser_count ?? 0) + 1 })
    .eq("id", r.id)
    .eq("ai_visualiser_count", r.ai_visualiser_count ?? 0)
    .lt("ai_visualiser_count", MAX_VISUALISATIONS)
    .select("ai_visualiser_count");
  if (!claimed?.length) {
    return NextResponse.json(
      { error: "Please wait for the current visualisation to finish." },
      { status: 429 }
    );
  }
  const usedCount = claimed[0].ai_visualiser_count as number;

  const fail = async (message: string, status = 502) => {
    // Refund the claimed generation — the client got nothing for it.
    await admin
      .from("selection_requests")
      .update({ ai_visualiser_count: usedCount - 1 })
      .eq("id", r.id)
      .eq("ai_visualiser_count", usedCount);
    return NextResponse.json({ error: message }, { status });
  };

  // Fetch the facade image server side (Drive CDN or storage public URL).
  const { data: facade } = await admin
    .from("facade_options")
    .select("image_path, name")
    .eq("id", facadeId)
    .maybeSingle();
  const imageUrl = optionImageUrl(facade?.image_path ?? null, url, 1600);
  if (!imageUrl) return fail("The facade image is unavailable.", 404);

  let sourceBase64: string;
  let sourceMime: string;
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`image fetch ${imgRes.status}`);
    sourceMime = imgRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.byteLength > MAX_SOURCE_BYTES) throw new Error("image too large");
    sourceBase64 = buf.toString("base64");
  } catch {
    return fail("Could not load the facade image. Please try again.");
  }

  // Gemini image edit over REST — no SDK.
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: sourceMime, data: sourceBase64 } },
                { text: buildVisualiserPrompt(schemeDescription) },
              ],
            },
          ],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      }
    );
    if (!res.ok) {
      const errBody = await res.text();
      console.error("[visualise] Gemini error", res.status, errBody.slice(0, 500));
      return fail(explainGeminiError(res.status, errBody));
    }
    const json = await res.json();
    const parts: Array<Record<string, any>> =
      json?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
    const data = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;
    const mime =
      imagePart?.inlineData?.mimeType ?? imagePart?.inline_data?.mime_type ?? "image/png";
    if (!data) {
      console.error("[visualise] Gemini returned no image part");
      return fail("The visualiser did not return an image. Please try again.");
    }
    return NextResponse.json({
      ok: true,
      image: `data:${mime};base64,${data}`,
      remaining: visualisationsRemaining(usedCount),
    });
  } catch (e) {
    console.error("[visualise] request failed", e);
    return fail("The visualiser is having trouble right now. Please try again.");
  }
}

/**
 * Turns a Gemini API failure into a message specific enough to act on —
 * during rollout the person reading it is TKBG staff testing the feature,
 * and "could not process" hides everything that matters.
 */
function explainGeminiError(status: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body);
    detail = String(parsed?.error?.message ?? "").slice(0, 160);
  } catch {
    detail = body.slice(0, 120);
  }
  if (status === 400 && /api key not valid/i.test(detail)) {
    return "The visualiser API key is not valid. Check GEMINI_API_KEY in the portal's Vercel settings.";
  }
  if (status === 403) {
    return `The visualiser API key is blocked or restricted (${detail || "permission denied"}).`;
  }
  if (status === 404) {
    return "The image model is not available on this API key. Check the key was created in Google AI Studio.";
  }
  if (status === 429) {
    return "The visualiser has hit its rate limit. Wait a minute and try again.";
  }
  return `The visualiser could not process that image (Gemini ${status}${detail ? `: ${detail}` : ""}).`;
}
