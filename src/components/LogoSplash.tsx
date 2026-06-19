"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Brand intro splash that plays the Turnkey reel end-card over a black
// overlay before revealing the page beneath it.
//
// Behaviour:
//  - Plays muted/autoplay/playsinline (no controls) on a fresh document
//    load or reload only — never on back/forward restores or client-side
//    route changes (those keep the original navigation entry's type).
//  - Fades out over ~600ms when the video ends, on click/tap, on Esc,
//    or via a 7s failsafe (covers blocked autoplay / data-saver / a
//    missing video file, where `onEnded` never fires).
//  - Renders nothing for users who prefer reduced motion.
//  - Degrades gracefully: if the video errors (e.g. the asset hasn't
//    been added yet) it dismisses immediately, so the page just shows.

const FADE_MS = 600;
const FAILSAFE_MS = 7000;

type Phase = "hidden" | "playing" | "fading";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Only replay on a genuine document load / reload. Back-forward cache
// restores and SPA navigations must not retrigger the splash.
function isFreshDocumentLoad(): boolean {
  if (
    typeof performance === "undefined" ||
    typeof performance.getEntriesByType !== "function"
  ) {
    return true; // can't tell — fail open and show it
  }
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (!nav) return true;
  return nav.type === "navigate" || nav.type === "reload";
}

export default function LogoSplash() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const overlayRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    setPhase((p) => (p === "playing" ? "fading" : p));
  }, []);

  // Decide once, on mount, whether this load should play the splash.
  useEffect(() => {
    if (prefersReducedMotion() || !isFreshDocumentLoad()) return;
    setPhase("playing");
  }, []);

  // While playing: arm the failsafe timeout and listen for Esc.
  useEffect(() => {
    if (phase !== "playing") return;
    const failsafe = window.setTimeout(dismiss, FAILSAFE_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    // Move focus to the overlay so keyboard users can dismiss with Esc/Enter.
    overlayRef.current?.focus();
    return () => {
      window.clearTimeout(failsafe);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase, dismiss]);

  // After the fade completes, fully unmount the overlay.
  useEffect(() => {
    if (phase !== "fading") return;
    const t = window.setTimeout(() => setPhase("hidden"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-label="Brand introduction"
      tabIndex={-1}
      onClick={dismiss}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          dismiss();
        }
      }}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black outline-none transition-opacity duration-[600ms] ease-out ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Decorative — the reel is purely brand flourish. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        aria-hidden="true"
        autoPlay
        muted
        playsInline
        preload="metadata"
        poster="/turnkey-logo-intro-poster.jpg"
        onEnded={dismiss}
        onError={dismiss}
        className="h-full w-full object-contain"
      >
        <source src="/turnkey-logo-intro.webm" type="video/webm" />
        <source src="/turnkey-logo-intro.mp4" type="video/mp4" />
      </video>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        aria-label="Skip brand introduction"
        className="absolute bottom-6 right-6 rounded-full border border-white/30 px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-white/70 opacity-0 transition-opacity duration-200 hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        Skip
      </button>
    </div>
  );
}
