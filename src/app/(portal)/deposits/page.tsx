"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Landmark,
} from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { PORTAL_PROJECT_COLUMNS } from "@/lib/portal-columns";

const fmt = (n: any) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : `$${Number(n).toLocaleString("en-AU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;

const statusConfig: Record<
  string,
  { icon: any; color: string; bg: string }
> = {
  paid: {
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-50 border-green-200",
  },
  pending: {
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
  },
  overdue: {
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
  },
};

type Allocation = "land" | "build" | "split";

function computeAllocationSplit(
  initial: number | null,
  land: number | null,
  build: number | null,
  allocation: Allocation
): { land: number; build: number } {
  const i = initial ?? 0;
  if (i <= 0) return { land: 0, build: 0 };
  if (allocation === "land") return { land: i, build: 0 };
  if (allocation === "build") return { land: 0, build: i };
  const l = land ?? 0;
  const b = build ?? 0;
  if (l + b <= 0) return { land: i / 2, build: i / 2 };
  return { land: (i * l) / (l + b), build: (i * b) / (l + b) };
}

export default function PortalDeposits() {
  const supabase = createClient();
  const [contactId, setContactId] = useState<string | null>(null);
  const [projectIds, setProjectIds] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("linked_user_id", user.id)
        .single();
      if (!contact) return;
      setContactId(contact.id);
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("client_id", contact.id);
      setProjectIds((projects || []).map((p: any) => p.id));
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["portal-deposit-projects", contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select(PORTAL_PROJECT_COLUMNS)
        .eq("client_id", contactId);
      return data || [];
    },
    enabled: !!contactId,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["portal-plans", projectIds],
    queryFn: async () => {
      if (!projectIds.length) return [];
      const { data } = await supabase
        .from("deposit_payment_plans")
        .select("*")
        .in("project_id", projectIds);
      return data || [];
    },
    enabled: projectIds.length > 0,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["portal-payments", plans],
    queryFn: async () => {
      if (!plans.length) return [];
      const planIds = plans.map((p: any) => p.id);
      const { data } = await supabase
        .from("deposit_plan_payments")
        .select("*")
        .in("plan_id", planIds)
        .order("instalment_number");
      return data || [];
    },
    enabled: plans.length > 0,
  });

  if (projectsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const planByProjectId = new Map<string, any>();
  for (const p of plans as any[]) {
    if (p.project_id) planByProjectId.set(p.project_id, p);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-black tracking-tight">
        Deposits
      </h1>

      {(projects as any[]).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-neutral-400">
            <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No deposit details yet</p>
            <p className="text-sm mt-1">
              Your sales rep will set these up once your project is in
              contract.
            </p>
          </CardContent>
        </Card>
      ) : (
        (projects as any[]).map((project) => {
          const plan = planByProjectId.get(project.id);
          const projectPayments = (payments as any[]).filter(
            (p) => plan && p.plan_id === plan.id
          );
          return (
            <ProjectDepositsCard
              key={project.id}
              project={project}
              plan={plan}
              payments={projectPayments}
            />
          );
        })
      )}
    </div>
  );
}

function ProjectDepositsCard({
  project,
  plan,
  payments,
}: {
  project: any;
  plan: any | null;
  payments: any[];
}) {
  const initialAmt =
    project.initial_deposit_amount == null
      ? null
      : Number(project.initial_deposit_amount);
  const landAmt =
    project.land_deposit_amount == null
      ? null
      : Number(project.land_deposit_amount);
  const buildAmt =
    project.build_deposit_amount == null
      ? null
      : Number(project.build_deposit_amount);
  const totalAmt =
    project.total_deposit_amount == null
      ? null
      : Number(project.total_deposit_amount);
  const alloc = (project.initial_deposit_allocation as Allocation) || "split";
  const split = computeAllocationSplit(initialAmt, landAmt, buildAmt, alloc);
  const landBalance = project.land_deposit_paid_at
    ? 0
    : Math.max(0, (landAmt ?? 0) - split.land);
  const buildBalance = project.build_deposit_paid_at
    ? 0
    : Math.max(0, (buildAmt ?? 0) - split.build);
  const totalOwing = landBalance + buildBalance;
  const allocLabel =
    alloc === "land"
      ? "Allocated to Land Deposit"
      : alloc === "build"
      ? "Allocated to Build Deposit"
      : "Split across Land + Build";
  const toLandDev = project.initial_deposit_to_land_developer;
  const toTkbg = project.initial_deposit_to_tkbg;
  const hasDestSplit =
    (toLandDev != null && Number(toLandDev) > 0) ||
    (toTkbg != null && Number(toTkbg) > 0);

  return (
    <Card className="border border-neutral-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-black flex items-center gap-2">
          <Landmark className="h-4 w-4 text-[#957B60]" />
          {project.name || "Project"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Initial Deposit Received block — same shape as the CRM
            project page so reps and clients see matching figures. */}
        <div className="rounded-md border border-[#957B60]/30 bg-[#957B60]/5 p-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#957B60]">
              Initial Deposit Received
            </p>
            {project.initial_deposit_paid_at && (
              <span className="text-[10px] text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {format(
                  new Date(project.initial_deposit_paid_at),
                  "d MMM yyyy"
                )}
              </span>
            )}
          </div>
          <p className="text-base font-semibold text-black">
            {fmt(initialAmt)}
          </p>
          <p className="text-xs text-neutral-600">{allocLabel}</p>
          {(initialAmt ?? 0) > 0 && alloc === "split" && (
            <p className="text-[11px] text-neutral-500">
              {fmt(split.land)} → Land · {fmt(split.build)} → Build
            </p>
          )}
          {hasDestSplit && (
            <p className="text-[11px] text-neutral-500 pt-1 border-t border-[#957B60]/15 mt-1">
              {fmt(toLandDev)} → Land Developer · {fmt(toTkbg)} held in TKRE Trust
            </p>
          )}
        </div>

        {/* Per-leg breakdown — what's owed, what's already credited
            from the initial deposit, and what's still outstanding. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <DepositLeg
            label="Land Deposit"
            amount={landAmt}
            balance={landBalance}
            credit={split.land}
            paidAt={project.land_deposit_paid_at}
          />
          <DepositLeg
            label="Build Deposit"
            amount={buildAmt}
            balance={buildBalance}
            credit={split.build}
            paidAt={project.build_deposit_paid_at}
          />
          <div className="p-3 rounded-lg bg-[#957B60]/5">
            <p className="text-xs text-[#957B60]">Total Deposit Owing</p>
            <p className="font-semibold text-[#957B60]">{fmt(totalOwing)}</p>
            {(totalAmt ?? 0) > 0 && (
              <p className="text-[11px] text-neutral-500 mt-0.5">
                of {fmt(totalAmt)} total
              </p>
            )}
          </div>
        </div>

        {/* Payment Plan — only shown when one exists for this project.
            Hidden entirely otherwise so clients aren't confused into
            thinking there's a plan they don't have. */}
        {plan && (
          <div className="pt-2 border-t border-neutral-100 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#957B60]" />
              <p className="text-sm font-medium text-black">Payment Plan</p>
              {plan.status && (
                <Badge
                  variant="secondary"
                  className="text-[10px] capitalize bg-neutral-100 text-neutral-600"
                >
                  {plan.status.replace(/_/g, " ")}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-neutral-400">Total</p>
                <p className="font-semibold text-neutral-700">
                  {fmt(plan.total_deposit_amount)}
                </p>
              </div>
              <div>
                <p className="text-neutral-400">Monthly</p>
                <p className="font-semibold text-neutral-700">
                  {fmt(plan.monthly_instalment)}
                </p>
              </div>
              <div>
                <p className="text-neutral-400">Paid</p>
                <p className="font-semibold text-green-700">
                  {fmt(plan.amount_paid)}
                </p>
              </div>
              <div>
                <p className="text-neutral-400">Months</p>
                <p className="font-semibold text-neutral-700">
                  {plan.number_of_months ?? "—"}
                </p>
              </div>
            </div>

            {plan.total_deposit_amount > 0 && (
              <Progress
                value={
                  ((Number(plan.amount_paid) || 0) /
                    Number(plan.total_deposit_amount)) *
                  100
                }
                className="h-2"
              />
            )}

            {payments.length > 0 && (
              <div className="space-y-2">
                {payments.map((payment) => {
                  const isPaidStatus = payment.status === "paid";
                  const isOverdue =
                    !isPaidStatus &&
                    payment.due_date &&
                    isPast(new Date(payment.due_date)) &&
                    !isToday(new Date(payment.due_date));
                  const effective = isOverdue
                    ? "overdue"
                    : payment.status || "pending";
                  const config = statusConfig[effective] || statusConfig.pending;
                  const Icon = config.icon;
                  return (
                    <div
                      key={payment.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border",
                        config.bg
                      )}
                    >
                      <Icon
                        className={cn("h-4 w-4 shrink-0", config.color)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-800">
                          Instalment {payment.instalment_number}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-neutral-500">
                          {payment.due_date && (
                            <span>
                              Due:{" "}
                              {format(
                                new Date(payment.due_date),
                                "d MMM yyyy"
                              )}
                            </span>
                          )}
                          {isPaidStatus && payment.paid_date && (
                            <span className="text-green-600">
                              Paid:{" "}
                              {format(
                                new Date(payment.paid_date),
                                "d MMM yyyy"
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-neutral-800">
                          {fmt(payment.amount)}
                        </p>
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px] mt-1", config.color)}
                        >
                          {effective}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DepositLeg({
  label,
  amount,
  balance,
  credit,
  paidAt,
}: {
  label: string;
  amount: number | null;
  balance: number;
  credit: number;
  paidAt: string | null | undefined;
}) {
  const isPaid = !!paidAt;
  return (
    <div className="p-3 rounded-lg bg-neutral-50 space-y-0.5">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="font-semibold text-neutral-700">{fmt(amount)}</p>
      {isPaid ? (
        <p className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Received {format(new Date(paidAt!), "d MMM yyyy")}
        </p>
      ) : (
        <>
          {credit > 0 && (
            <p className="text-[10px] text-[#957B60]">
              {fmt(credit)} credited from initial
            </p>
          )}
          {(amount ?? 0) > 0 && (
            <p className="text-[11px] text-neutral-500">
              Balance owing: {fmt(balance)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
