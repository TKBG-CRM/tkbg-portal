"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, MapPin, Home, Calendar, DollarSign, CheckCircle2, Circle,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { getProgressPercentage, getAllStagesOrdered, STAGE_CONFIG } from "@/lib/stages";
import {
  PORTAL_PROJECT_COLUMNS,
  scrubCommission,
  CLIENT_VISIBLE_STAGES,
  CLIENT_STAGE_TITLES,
  clientFacingStageLabel,
} from "@/lib/portal-columns";
import { computeDepositPaid } from "@/lib/deposits";
import { SectionLabel } from "@/components/PortalHeading";

const fmt = (n: any) => (n == null ? "\u2014" : `$${Number(n).toLocaleString("en-AU")}`);

export default function PortalProjectDetail() {
  const params = useParams();
  const projectId = params.id as string;
  const supabase = createClient();
  // RLS on projects already scopes the select to the signed-in
  // client's projects — no need to resolve contactId here just to
  // gate the query.

  const { data: project, isLoading } = useQuery({
    queryKey: ["portal-project", projectId],
    // Cast to any: passing a comma-separated select string drops the
    // Supabase row-type inference (it returns GenericStringError). The
    // rest of this file already treats project as a loose record.
    queryFn: async (): Promise<any> => {
      const { data } = await supabase
        .from("projects")
        .select(PORTAL_PROJECT_COLUMNS)
        .eq("id", projectId)
        .single();
      return scrubCommission(data);
    },
    enabled: !!projectId,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["portal-contacts"],
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("id, first_name, last_name, company_name, contact_type");
      return data || [];
    },
  });

  // Activity timeline removed from the portal — clients no longer see
  // the running activity log. Notifications carry the relevant events.

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-neutral-500">Project not found</p>
        <Link href="/"><Button variant="outline" className="mt-4">Back to Dashboard</Button></Link>
      </div>
    );
  }

  const contactMap = contacts.reduce((a: any, c: any) => { a[c.id] = c; return a; }, {});
  const builder = project.builder_id ? contactMap[project.builder_id] : null;
  const broker = project.broker_id ? contactMap[project.broker_id] : null;
  const currentOrder = STAGE_CONFIG[project.stage]?.order || 0;
  // Only show client-friendly milestone stages on the portal timeline.
  // Internal workflow stages (Enquiry Made, Contact Attempted, Gift
  // Hamper Sent, Product Review Requested, Contract Checked, etc.)
  // stay in the CRM but never surface to the client.
  const allStages = getAllStagesOrdered()
    .filter((s) => !s.isTerminal && !s.isOptional)
    .filter((s) => CLIENT_VISIBLE_STAGES.has(s.id))
    .map((s) => ({ ...s, label: CLIENT_STAGE_TITLES[s.id] || s.label }));

  // Header badge: friendly label for the most recent CLIENT-VISIBLE
  // milestone reached. Internal stages (Gift Hamper Sent, etc.)
  // never surface in the badge.
  const headerStageLabel = clientFacingStageLabel(
    project.stage,
    currentOrder,
    (id) => STAGE_CONFIG[id]?.order || 0
  );

  // The client has paid their initial deposit once it's recorded on the
  // project (an amount/paid-at is set) OR the CRM has advanced the project to
  // the deposit stage (e.g. when the onboarding email goes out). Either way
  // the "Initial deposit received" milestone should read as done — clients
  // shouldn't log in to find it un-ticked when they've already paid.
  const initialDepositReceived =
    !!project.initial_deposit_paid_at ||
    (Number(project.initial_deposit_amount) || 0) > 0;
  const isStageReached = (s: { id: string; order: number }) =>
    s.order <= currentOrder ||
    (s.id === "initial_deposit_received" && initialDepositReceived);

  // Re-derive a client-facing percentage based on visible milestones
  // only — feels more meaningful than the raw 1-of-46 progression.
  const visibleCount = allStages.length;
  const reachedCount = allStages.filter(isStageReached).length;
  const progress =
    visibleCount > 0
      ? Math.round((reachedCount / visibleCount) * 100)
      : getProgressPercentage(project.stage);

  const totalDeposit = Number(project.total_deposit_amount) || 0;
  // "Paid" reflects deposits actually received on the project (initial
  // deposit credited across the land/build legs), matching the Deposits
  // page — not just payment-plan instalments, which left this at $0 when
  // an initial deposit had been received without a plan.
  const totalPaid = computeDepositPaid(project);

  const keyDates = [
    { label: "Finance Expiry", date: project.finance_expiry_date, icon: DollarSign },
    { label: "Land Hold Expiry", date: project.land_hold_expiry_date, icon: Calendar },
    { label: "Settlement", date: project.settlement_date, icon: Calendar },
    { label: "Contract Deadline", date: project.contract_deadline, icon: Calendar },
    { label: "Handover", date: project.handover_date, icon: Home },
    { label: "Est. Land Title", date: project.estimated_land_title_date, icon: MapPin },
  ].filter((d) => d.date);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0">
          <SectionLabel>Your Project</SectionLabel>
          <h1 className="text-xl sm:text-2xl font-heading uppercase tracking-[0.16em] text-black leading-tight">{project.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="bg-brand-gold/10 text-brand-gold border-0">{headerStageLabel}</Badge>
            <span className="text-xs text-neutral-400">{progress}% complete</span>
          </div>
        </div>
      </div>

      {/* Stage Timeline */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading uppercase tracking-[0.2em] text-black">Build Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={progress} className="h-2 mb-4" />
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {allStages.slice(0, 20).map((stage) => {
              const isCompleted =
                stage.order < currentOrder ||
                (stage.id === "initial_deposit_received" &&
                  (initialDepositReceived || stage.order <= currentOrder));
              const isCurrent = stage.id === project.stage && !isCompleted;
              return (
                <div key={stage.id} className="flex items-center gap-3">
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : isCurrent ? (
                    <div className="w-4 h-4 rounded-full border-2 border-brand-gold bg-brand-gold/20 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-neutral-300 shrink-0" />
                  )}
                  <span className={cn(
                    "text-sm",
                    isCompleted && "text-neutral-400",
                    isCurrent && "font-semibold text-brand-gold",
                    !isCompleted && !isCurrent && "text-neutral-400"
                  )}>
                    {stage.label}
                  </span>
                  {isCurrent && <Badge className="bg-brand-gold text-white text-[10px] ml-auto">Current</Badge>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Property Details */}
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-heading uppercase tracking-[0.2em] text-black">Property Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.land_address && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50">
                <MapPin className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-neutral-400">Land Address</p>
                  <p className="text-sm font-medium text-neutral-700">{project.land_address}</p>
                  {(project.land_suburb || project.land_state) && (
                    <p className="text-xs text-neutral-500">{[project.land_suburb, project.land_state, project.land_postcode].filter(Boolean).join(", ")}</p>
                  )}
                </div>
              </div>
            )}
            {project.house_design && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50">
                <Home className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-neutral-400">House Design</p>
                  <p className="text-sm font-medium text-neutral-700">{project.house_design}</p>
                  {project.facade && <p className="text-xs text-neutral-500">Facade: {project.facade}</p>}
                </div>
              </div>
            )}
            {builder && (
              <div className="p-3 rounded-lg bg-neutral-50 text-sm">
                <p className="text-xs text-neutral-400">Builder</p>
                <p className="font-medium text-neutral-700">{builder.company_name || `${builder.first_name} ${builder.last_name}`}</p>
              </div>
            )}
            {broker && (
              <div className="p-3 rounded-lg bg-neutral-50 text-sm">
                <p className="text-xs text-neutral-400">Mortgage Broker</p>
                <p className="font-medium text-neutral-700">{broker.company_name || `${broker.first_name} ${broker.last_name}`}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Key Dates */}
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-heading uppercase tracking-[0.2em] text-black">Key Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {keyDates.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">No dates set yet</p>
            ) : (
              keyDates.map((d) => {
                const Icon = d.icon;
                const days = differenceInDays(new Date(d.date), new Date());
                const isPast = days < 0;
                const isUpcoming = days >= 0 && days <= 14;
                return (
                  <div key={d.label} className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border",
                    isPast ? "bg-red-50 border-red-200" : isUpcoming ? "bg-brand-gold/5 border-brand-gold/20" : "bg-neutral-50 border-neutral-100"
                  )}>
                    <Icon className={cn("h-4 w-4 shrink-0", isPast ? "text-red-500" : isUpcoming ? "text-brand-gold" : "text-neutral-400")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-neutral-400">{d.label}</p>
                      <p className="text-sm font-medium text-neutral-700">{format(new Date(d.date), "d MMMM yyyy")}</p>
                    </div>
                    <span className={cn(
                      "text-xs font-semibold",
                      isPast ? "text-red-500" : isUpcoming ? "text-brand-gold" : "text-neutral-400"
                    )}>
                      {isPast ? `${Math.abs(days)}d ago` : days === 0 ? "Today" : `${days}d`}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deposit Progress */}
      {totalDeposit > 0 && (
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-heading uppercase tracking-[0.2em] text-black flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-brand-gold" />
                Deposit Progress
              </CardTitle>
              <Link href="/deposits">
                <Button variant="outline" size="sm" className="text-xs">View Details</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-neutral-500">Paid: {fmt(totalPaid)}</span>
              <span className="font-medium text-neutral-700">Total: {fmt(totalDeposit)}</span>
            </div>
            <Progress value={totalDeposit > 0 ? (totalPaid / totalDeposit) * 100 : 0} className="h-3" />
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline removed — clients receive notifications
          for relevant events instead of seeing the running log. */}
    </div>
  );
}
