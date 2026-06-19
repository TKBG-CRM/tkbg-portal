"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

// Load the splash client-side only and lazily, so the page's own markup
// (the login form, header, etc.) ships and paints first — the splash
// then mounts on top as an overlay. ssr:false keeps the video player out
// of the server-rendered HTML; Suspense guards the dynamic boundary.
const LogoSplash = dynamic(() => import("./LogoSplash"), { ssr: false });

export function SplashGate() {
  return (
    <Suspense fallback={null}>
      <LogoSplash />
    </Suspense>
  );
}
