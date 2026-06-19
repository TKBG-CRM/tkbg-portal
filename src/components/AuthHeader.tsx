/**
 * Shared branded header for the unauthenticated auth pages (login,
 * reset-password). Renders the black bar with the TURNKEY wordmark and
 * the gold accent line underneath.
 *
 * The wordmark is intentionally large and given generous breathing room
 * so it reads as the primary brand mark. The "Client Portal" page label
 * is deliberately NOT part of this block — pages render it as a small
 * gold tag above their heading on the cream background instead.
 */
export function AuthHeader() {
  return (
    <>
      {/* Black header bar — matches portal header + branded email template */}
      <div className="bg-black px-4 py-12 sm:py-16 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/TURNKEY_WORDMARK_WHITE.svg"
          alt="Turnkey Building Group"
          className="h-8 sm:h-10 md:h-12 w-auto mx-auto"
        />
      </div>

      {/* Gold accent line */}
      <div className="h-[2px] bg-brand-gold" />
    </>
  );
}

/**
 * Small uppercase gold tag used as the page label on the cream
 * background, sitting just above the page heading (e.g. "Welcome back").
 * Replaces the old "Client Portal" caption that lived inside the header.
 */
export function AuthPageLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.3em] text-brand-gold font-body font-medium mb-3">
      · {children} ·
    </p>
  );
}
