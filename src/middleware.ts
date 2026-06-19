import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Exclude static assets — including the intro reel (mp4/webm) and its
  // poster — so the auth middleware doesn't 307-redirect them for
  // unauthenticated visitors (the splash plays before sign-in).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)"],
};
