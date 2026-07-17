import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import {
  Users,
  DollarSign,
  TrendingUp,
  Handshake,
  ChevronRight,
  StickyNote,
} from "lucide-react";
import {
  getReferralBundle,
  type PartnerCommission,
} from "@/lib/referral/get-referral-bundle";
import {
  milestoneProgressPct,
  type ReferralMilestone,
} from "@/lib/referral/referral-status";
import { memberSummaries } from "@/lib/referral/team";
import { emailDomain } from "@/lib/referral/team-signup";
import AddTeamMemberForm from "@/components/referral/AddTeamMemberForm";

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

const TONE_BAR: Record<ReferralMilestone["tone"], string> = {
  neutral: "bg-neutral-400",
  gold: "bg-brand-gold",
  green: "bg-green-500",
  red: "bg-red-400",
};

const COMMISSION_BADGE: Record<string, { className: string; label: string }> = {
  pending: { className: "bg-amber-100 text-amber-700 border-amber-200", label: "Pending" },
  due: { className: "bg-blue-100 text-blue-700 border-blue-200", label: "Due" },
  paid: { className: "bg-green-100 text-green-700 border-green-200", label: "Paid" },
  cancelled: { className: "bg-neutral-100 text-neutral-500 border-neutral-200", label: "Cancelled" },
};

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <div className="flex items-center gap-2 text-neutral-400 mb-1.5">
        <Icon className="h-4 w-4" />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-semibold text-black">{value}</p>
    </div>
  );
}

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

export default async function ReferralPortalPage() {
  const { partner, team, canAddTeam, leads, commissions, totals } =
    await getReferralBundle();

  // No partner resolved for this session → bounce to the referral login.
  if (!partner) {
    redirect("/referral/login");
  }

  const partnerName = partner.contact_name || partner.name || "Referral Partner";
  // Organisation owner: this partner has team members reporting to them, so
  // the bundle covers the whole team and each lead carries who referred it.
  const isOrgView = team.length > 0;
  const members = isOrgView
    ? memberSummaries(leads, commissions, partner, team)
    : [];
  const orgName = partner.name || partnerName;

  return (
    <div className="min-h-screen bg-[#f7f5f2] font-body">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-brand-gold">
            {isOrgView ? "Referral Partner — Organisation" : "Referral Partner"}
          </p>
          <h1 className="text-2xl font-semibold text-black mt-1 font-heading">
            {isOrgView ? orgName : partnerName}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {isOrgView
              ? `Showing referrals for you and ${team.length} team member${
                  team.length === 1 ? "" : "s"
                }.`
              : totals.leadCount === 0
              ? "No referred leads are showing yet."
              : `Tracking ${totals.leadCount} referred lead${
                  totals.leadCount === 1 ? "" : "s"
                }.`}
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard icon={Users} label="Referred" value={String(totals.leadCount)} />
          <StatCard icon={TrendingUp} label="Converted" value={String(totals.convertedCount)} />
          <StatCard icon={DollarSign} label="Pending" value={fmtMoney(totals.pending)} />
          <StatCard icon={DollarSign} label="Paid" value={fmtMoney(totals.paid)} />
        </div>

        {/* Per-member breakdown — organisation owners only. Partners with a
            business email domain can build their team themselves. */}
        {(isOrgView || canAddTeam) && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-gold" />
              Your Team
            </h2>
            {isOrgView && (
            <div className="bg-white border border-neutral-200 rounded-lg divide-y divide-neutral-100">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
                >
                  <p className="font-medium text-black text-sm min-w-0 truncate">
                    {m.label}
                    {m.isOwner && (
                      <span className="ml-2 inline-flex items-center rounded-full border border-brand-gold/20 bg-brand-gold/10 px-2 py-0.5 text-[10px] font-medium text-brand-gold align-middle">
                        Owner
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-neutral-500 shrink-0">
                    <span>
                      {m.leadCount} referred · {m.convertedCount} converted
                    </span>
                    <span className="text-neutral-400">
                      Pending {fmtMoney(m.pending)}
                    </span>
                    <span className="font-medium text-green-700">
                      Paid {fmtMoney(m.paid)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            )}
            {!isOrgView && (
              <p className="text-xs text-neutral-500">
                Work with a team? Add your colleagues and their referrals will
                roll up here for you, while each of them only ever sees their
                own.
              </p>
            )}
            {canAddTeam && (
              <AddTeamMemberForm ownerDomain={emailDomain(partner.email) || ""} />
            )}
          </section>
        )}

        {/* Referred leads */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
            <Handshake className="h-4 w-4 text-brand-gold" />
            {isOrgView ? "All Referrals" : "Your Referrals"}
          </h2>

          {leads.length === 0 ? (
            <div className="border border-dashed border-neutral-300 rounded-lg p-10 text-center">
              <Users className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">
                When Turnkey tags a lead as referred by you, it will appear here
                with its current progress.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {leads.map((lead) => {
                const pct = milestoneProgressPct(lead.milestone.step);
                const referredOn = fmtDate(lead.referredOn);
                return (
                  <li key={lead.id}>
                    <Link
                      href={`/referral/${lead.id}`}
                      className="block bg-white border border-neutral-200 rounded-lg p-4 hover:border-brand-gold hover:shadow-sm transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-black truncate">
                            {lead.clientName || lead.projectName || "Referred Lead"}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                            {referredOn && (
                              <span className="text-xs text-neutral-400">
                                Referred {referredOn}
                              </span>
                            )}
                            {lead.hasNote && (
                              <span className="inline-flex items-center gap-1 text-xs text-brand-gold">
                                <StickyNote className="h-3 w-3" />
                                Note
                              </span>
                            )}
                            {isOrgView && lead.referredBy && (
                              <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                                <Users className="h-3 w-3 text-neutral-400" />
                                {lead.referredBy}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              TONE_BADGE[lead.milestone.tone]
                            }`}
                          >
                            {lead.milestone.label}
                          </span>
                          <ChevronRight className="h-4 w-4 text-neutral-300" />
                        </div>
                      </div>

                      {lead.milestone.step > 0 && (
                        <div className="mt-3">
                          <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${TONE_BAR[lead.milestone.tone]}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Commissions */}
        <section>
          <h2 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-brand-gold" />
            Referral Commissions
          </h2>

          {commissions.length === 0 ? (
            <div className="border border-dashed border-neutral-300 rounded-lg p-10 text-center">
              <DollarSign className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">
                Commissions will appear here once a referred lead progresses and
                Turnkey records the amount due to you.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {commissions.map((c: PartnerCommission) => {
                const badge = COMMISSION_BADGE[c.status] || COMMISSION_BADGE.pending;
                const paidOn = fmtDate(c.paidDate);
                const dueOn = fmtDate(c.dueDate);
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-4 bg-white border border-neutral-200 rounded-lg p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-black truncate">
                        {c.clientName || c.projectName || "Referral"}
                      </p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {c.status === "paid" && paidOn
                          ? `Paid ${paidOn}`
                          : dueOn
                          ? `Due ${dueOn}`
                          : "Awaiting payment"}
                        {isOrgView && c.referredBy ? ` · ${c.referredBy}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-semibold text-black">
                        {fmtMoney(c.amount)}
                      </span>
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
