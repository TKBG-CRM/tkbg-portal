"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { DollarSign, Calendar, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";

const fmt = (n: any) => (n == null ? "\u2014" : `$${Number(n).toLocaleString("en-AU")}`);

const statusConfig: Record<string, { icon: any; color: string; bg: string }> = {
  paid: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 border-green-200" },
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  overdue: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

export default function PortalDeposits() {
  const supabase = createClient();
  const [contactId, setContactId] = useState<string | null>(null);
  const [projectIds, setProjectIds] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: contact } = await supabase.from("contacts").select("id").eq("linked_user_id", user.id).single();
      if (!contact) return;
      setContactId(contact.id);
      const { data: projects } = await supabase.from("projects").select("id").eq("client_id", contact.id);
      setProjectIds((projects || []).map((p: any) => p.id));
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["portal-deposit-projects", contactId],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").eq("client_id", contactId);
      return data || [];
    },
    enabled: !!contactId,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["portal-plans", projectIds],
    queryFn: async () => {
      if (!projectIds.length) return [];
      const { data } = await supabase.from("deposit_payment_plans").select("*").in("project_id", projectIds);
      return data || [];
    },
    enabled: projectIds.length > 0,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["portal-payments", plans],
    queryFn: async () => {
      if (!plans.length) return [];
      const planIds = plans.map((p: any) => p.id);
      const { data } = await supabase.from("deposit_plan_payments").select("*").in("plan_id", planIds).order("instalment_number");
      return data || [];
    },
    enabled: plans.length > 0,
  });

  if (projectsLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  // Calculate totals from projects
  const totalRequired = projects.reduce((s: number, p: any) => s + (Number(p.total_deposit_amount) || 0), 0);
  const paidPayments = payments.filter((p: any) => p.status === "paid");
  const totalPaid = paidPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  const remaining = totalRequired - totalPaid;
  const progressPct = totalRequired > 0 ? Math.round((totalPaid / totalRequired) * 100) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-black tracking-tight">Deposits</h1>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-neutral-200">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">Total Required</p>
            <p className="text-2xl font-bold text-black">{fmt(totalRequired)}</p>
          </CardContent>
        </Card>
        <Card className="border border-green-200 bg-green-50/50">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-green-600 uppercase tracking-wide mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-green-700">{fmt(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="border border-neutral-200">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">Remaining</p>
            <p className="text-2xl font-bold text-neutral-700">{fmt(remaining)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardContent className="py-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-neutral-500">Payment Progress</span>
            <span className="font-semibold text-[#957B60]">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-3" />
        </CardContent>
      </Card>

      {/* Project deposit breakdown */}
      {projects.map((project: any) => (
        <Card key={project.id} className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-black">{project.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-neutral-50">
                <p className="text-xs text-neutral-400">Land Deposit</p>
                <p className="font-semibold text-neutral-700">{fmt(project.land_deposit_amount)}</p>
              </div>
              <div className="p-3 rounded-lg bg-neutral-50">
                <p className="text-xs text-neutral-400">Build Deposit</p>
                <p className="font-semibold text-neutral-700">{fmt(project.build_deposit_amount)}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#957B60]/5">
                <p className="text-xs text-[#957B60]">Total Deposit</p>
                <p className="font-semibold text-[#957B60]">{fmt(project.total_deposit_amount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Payment schedule */}
      {payments.length > 0 && (
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-black flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#957B60]" />
              Payment Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {payments.map((payment: any) => {
                const isPaidStatus = payment.status === "paid";
                const isOverdue = !isPaidStatus && payment.due_date && isPast(new Date(payment.due_date)) && !isToday(new Date(payment.due_date));
                const effectiveStatus = isOverdue ? "overdue" : payment.status || "pending";
                const config = statusConfig[effectiveStatus] || statusConfig.pending;
                const Icon = config.icon;

                return (
                  <div key={payment.id} className={cn("flex items-center gap-4 p-4 rounded-xl border", config.bg)}>
                    <Icon className={cn("h-5 w-5 shrink-0", config.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800">
                        Instalment {payment.instalment_number}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-neutral-500">
                        {payment.due_date && (
                          <span>Due: {format(new Date(payment.due_date), "d MMM yyyy")}</span>
                        )}
                        {isPaidStatus && payment.paid_date && (
                          <span className="text-green-600">Paid: {format(new Date(payment.paid_date), "d MMM yyyy")}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-neutral-800">{fmt(payment.amount)}</p>
                      <Badge variant="secondary" className={cn("text-[10px] mt-1", config.color)}>
                        {effectiveStatus}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {payments.length === 0 && plans.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-neutral-400">
            <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No payment plan set up yet</p>
            <p className="text-sm mt-1">Your sales rep will configure your deposit payment schedule.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
