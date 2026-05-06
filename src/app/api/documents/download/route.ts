import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

/**
 * GET /api/documents/download?id=<document_id>
 *
 * The `documents` bucket is private. The `file_url` column was populated
 * via getPublicUrl(), which 403s when fetched directly. This endpoint
 * looks up the document, signs a short-lived URL via service role, and
 * redirects to it.
 *
 * Authorisation: the user's session client SELECTs the row first — RLS
 * on `documents` already scopes which docs they can see. Once the row
 * is returned, we use the service-role client to actually sign the URL
 * (Supabase storage RLS would otherwise return "Bucket not found" for
 * portal clients who aren't the storage object's owner).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  // Authorisation gate via RLS on the documents table.
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, name, file_url")
    .eq("id", id)
    .maybeSingle();
  if (error || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const path = extractStoragePath(doc.file_url);
  if (!path) {
    return NextResponse.json(
      { error: "Document path could not be resolved" },
      { status: 500 }
    );
  }

  const admin = createServiceRoleClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signed, error: signErr } = await admin.storage
    .from("documents")
    .createSignedUrl(path, 300);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message || "Could not sign URL" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}

function extractStoragePath(fileUrl: string | null): string | null {
  if (!fileUrl) return null;
  const m = fileUrl.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/documents\/([^?]+)/
  );
  if (m?.[1]) return decodeURIComponent(m[1]);
  if (!fileUrl.startsWith("http")) return fileUrl;
  return null;
}
