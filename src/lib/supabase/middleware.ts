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
  // The self-registration API endpoints (token lookup + submit) are public by
  // design — they validate the one-time registration token themselves with the
  // service role. They MUST be reachable without a session, otherwise the auth
  // middleware 307-redirects them to /login: the GET lookup then receives HTML
  // instead of JSON, and the POST submit (307 preserves the method) lands on
  // /login → 405 → "Submission failed". Everything else under /api stays gated.
  const isRegisterApi = request.nextUrl.pathname.startsWith("/api/register/");
  // The branded password-reset trigger (POST /api/auth/forgot-password) is
  // public by design — it mints the recovery token with the service role itself
  // and always returns a generic 200 (never revealing whether an account
  // exists). Like /api/register/*, it MUST bypass the auth gate, otherwise the
  // unauthenticated POST 307-redirects to /login (and 307 preserves the method,
  // so it lands on /login → 405 and no reset email is ever sent).
  const isAuthApi = request.nextUrl.pathname.startsWith("/api/auth/");

  if (
    !user &&
    !isLoginPage &&
    !isAuthCallback &&
    !isAdminPreview &&
    !isResetPassword &&
    !isRegister &&
    !isRegisterApi &&
    !isAuthApi
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
