import { cn } from "@/lib/utils";

/**
 * Branded page-heading primitives for the authenticated portal. They
 * mirror the login/register aesthetic (gold uppercase tag + Helvetica
 * heading on cream) and the branded email template so the inside of the
 * portal reads as the same brand as the front door.
 */

/** Small uppercase gold section tag, e.g. "· DASHBOARD ·". */
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[10px] uppercase tracking-[0.3em] text-brand-gold font-body font-medium mb-2",
        className
      )}
    >
      · {children} ·
    </p>
  );
}

/**
 * Standard page header: gold section tag, an uppercase letter-spaced
 * title (Helvetica heading face), an optional subtitle, and an optional
 * right-aligned action slot (e.g. an "Upload" button).
 */
export function PageHeading({
  label,
  title,
  subtitle,
  action,
}: {
  label: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div className="min-w-0">
        <SectionLabel>{label}</SectionLabel>
        <h1 className="text-2xl sm:text-[28px] font-heading uppercase tracking-[0.18em] text-black leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-neutral-500 mt-2 font-body">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
