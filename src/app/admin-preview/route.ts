import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", request.url));
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  if (!serviceRoleKey) {
    return NextResponse.redirect(new URL("/login?error=server_error", request.url));
  }

  // Admin client for DB queries and auth operations
  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Validate the preview token
  const { data: previewToken, error: tokenError } = await admin
    .from("admin_preview_tokens")
    .select("id, contact_id, contacts(first_name, last_name, linked_user_id)")
    .eq("token", token)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (tokenError || !previewToken) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", request.url));
  }

  // 2. Mark token as used (one-time use)
  await admin
    .from("admin_preview_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", previewToken.id);

  const contact = previewToken.contacts as any;
  if (!contact?.linked_user_id) {
    return NextResponse.redirect(new URL("/login?error=no_portal_account", request.url));
  }

  // 3. Get the user's email via admin auth
  const { data: { user: portalUser }, error: userError } = await admin.auth.admin.getUserById(
    contact.linked_user_id
  );

  if (userError || !portalUser?.email) {
    return NextResponse.redirect(new URL("/login?error=no_portal_account", request.url));
  }

  const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || portalUser.email;

  // 4. Generate a magic link to get a signed token we can exchange server-side
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: portalUser.email,
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.redirect(new URL("/login?error=link_failed", request.url));
  }

  // 5. Exchange the hashed token for a real session server-side.
  //    Capture cookies the Supabase client wants to set.
  const cookiesToSet: Array<{ name: string; value: string; options: any }> = [];

  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(incoming) {
          cookiesToSet.push(...incoming);
        },
      },
    }
  );

  const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (sessionError || !sessionData.session) {
    return NextResponse.redirect(new URL("/login?error=session_failed", request.url));
  }

  // 6. Build redirect response, set session cookies + banner cookie
  const response = NextResponse.redirect(new URL("/", request.url));

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  response.cookies.set("ap_banner", contactName, {
    path: "/",
    maxAge: 86400,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });

  return response;
}
