import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === "/login";
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth/callback");
  const isAdminPreview = request.nextUrl.pathname === "/admin-preview";
  // Reset-password must be reachable without an authenticated session
  // — the user lands there from the password-recovery email before
  // the supabase JS client has had a chance to exchange the URL
  // params for a session. The page itself handles the recovery handoff.
  const isResetPassword = request.nextUrl.pathname === "/reset-password";
  const isRegister = request.nextUrl.pathname === "/register";

  if (
    !user &&
    !isLoginPage &&
    !isAuthCallback &&
    !isAdminPreview &&
    !isResetPassword &&
    !isRegister
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Don't bounce a logged-in user away from /login if they're in a
  // password-recovery flow — they need to land on /reset-password
  // even though they technically have a session.
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
