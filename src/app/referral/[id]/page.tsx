import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, DollarSign, StickyNote, Check } from "lucide-react";
import { getReferralLeadDetail } from "@/lib/referral/get-referral-bundle";
import {
  buildMilestoneTimeline,
  type ReferralMilestone,
} from "@/lib/referral/referral-status";

export const dynamic = "force-dynamic";

function fmtMoney(n: number): string {
  return `$${Math.round(n || 0).toLocaleString("en-AU")}`;
}

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "dd MMM yyyy");
}

const TONE_BADGE: Record<ReferralMilestone["tone"], string> = {
  neutral: "bg-neutral-100 text-neutral-600 border-neutral-200",
  gold: "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
  green: "bg-green-100 text-green-700 border-green-200",
  red: "bg-red-50 text-red-600 border-red-200",
};

const COMMISSION_BADGE: Record<string, { className: string; label: string }> = {
  pending: { className: "bg-amber-100 text-amber-700 border-amber-200", label: "Pending" },
  due: { className: "bg-blue-100 text-blue-700 border-blue-200", label: "Due" },
  paid: { className: "bg-green-100 text-green-700 border-green-200", label: "Paid" },
  cancelled: { className: "bg-neutral-100 text-neutral-500 border-neutral-200", label: "Cancelled" },
};

function PortalHeader() {
  return (
    <>
      <div className="bg-black px-4 py-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/TURNKEY_WORDMARK_WHITE.svg"
          alt="Turnkey Building Group"
          className="h-6 sm:h-7 w-auto mx-auto"
        />
      </div>
      <div className="h-[2px] bg-brand-gold" />
    </>
  );
}

export default async function ReferralLeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const detail = await getReferralLeadDetail(params.id);

  // Not theirs, doesn't exist, or no session → 404 rather than leak existence.
  if (!detail) {
    notFound();
  }

  const { lead, note, commissions } = detail;
  const timeline = buildMilestoneTimeline(lead.milestone);
  const referredOn = fmtDate(lead.referredOn);
  const notProceeding = lead.milestone.step === 0;

  return (
    <div className="min-h-screen bg-[#f7f5f2] font-body">
      <PortalHeader />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/referral"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-brand-gold mb-6"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to referrals
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-gold">
              Referred Lead
            </p>
            <h1 className="text-2xl font-semibold text-black mt-1 truncate font-heading">
              {lead.clientName || lead.projectName || "Referred Lead"}
            </h1>
            {referredOn && (
              <p className="text-sm text-neutral-500 mt-1">Referred {referredOn}</p>
            )}
          </div>
          <span
            className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              TONE_BADGE[lead.milestone.tone]
            }`}
          >
            {lead.milestone.label}
          </span>
        </div>

        {/* Progress timeline */}
        <section className="bg-white border border-neutral-200 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-black mb-4">Progress</h2>
          {notProceeding ? (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
              This referral is not proceeding.
            </div>
          ) : (
            <ol className="space-y-3">
              {timeline.map((s) => (
                <li key={s.step} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      s.state === "done"
                        ? "bg-green-500 text-white"
                        : s.state === "current"
                        ? "bg-brand-gold text-white"
                        : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : s.step}
                  </span>
                  <span
                    className={`text-sm ${
                      s.state === "upcoming"
                        ? "text-neutral-400"
                        : "text-black font-medium"
                    }`}
                  >
                    {s.label}
                  </span>
                  {s.state === "current" && (
                    <span className="text-[10px] uppercase tracking-wider text-brand-gold">
                      Current
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Note from Turnkey */}
        {note && (
          <section className="bg-white border border-neutral-200 rounded-lg p-5 mb-6">
            <h2 className="text-sm font-semibold text-black mb-2 flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-brand-gold" />
              Note from Turnkey
            </h2>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{note}</p>
          </section>
        )}

        {/* Commissions for this lead */}
        <section>
          <h2 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-brand-gold" />
            Commissions
          </h2>
          {commissions.length === 0 ? (
            <div className="border border-dashed border-neutral-300 rounded-lg p-8 text-center">
              <p className="text-sm text-neutral-500">
                No commission has been recorded for this referral yet.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {commissions.map((c) => {
                const badge = COMMISSION_BADGE[c.status] || COMMISSION_BADGE.pending;
                const paidOn = fmtDate(c.paidDate);
                const dueOn = fmtDate(c.dueDate);
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-4 bg-white border border-neutral-200 rounded-lg p-4"
                  >
                    <p className="text-xs text-neutral-400">
                      {c.status === "paid" && paidOn
                        ? `Paid ${paidOn}`
                        : dueOn
                        ? `Due ${dueOn}`
                        : "Awaiting payment"}
                    </p>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-semibold text-black">{fmtMoney(c.amount)}</span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
