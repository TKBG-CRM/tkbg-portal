"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, MapPin, Home, Calendar, DollarSign, Activity, CheckCircle2, Clock, Circle,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { getStageLabel, getProgressPercentage, getAllStagesOrdered, STAGE_CONFIG } from "@/lib/stages";

const fmt = (n: any) => (n == null ? "\u2014" : `$${Number(n).toLocaleString("en-AU")}`);

export default function PortalProjectDetail() {
  const params = useParams();
  const projectId = params.id as string;
  const supabase = createClient();
  const [contactId, setContactId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: c } = await supabase.from("contacts").select("id").eq("linked_user_id", user.id).single();
      if (c) setContactId(c.id);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: project, isLoading } = useQuery({
    queryKey: ["portal-project", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").eq("id", projectId).single();
      return data;
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

  const { data: activities = [] } = useQuery({
    queryKey: ["portal-project-activities", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("activities").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!projectId,
  });

  const { data: depositPlans = [] } = useQuery({
    queryKey: ["portal-deposit-plans", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("deposit_payment_plans").select("*").eq("project_id", projectId);
      return data || [];
    },
    enabled: !!projectId,
  });

  const { data: depositPayments = [] } = useQuery({
    queryKey: ["portal-deposit-payments", projectId],
    queryFn: async () => {
      if (!depositPlans.length) return [];
      const planIds = depositPlans.map((p: any) => p.id);
      const { data } = await supabase.from("deposit_plan_payments").select("*").in("plan_id", planIds).order("instalment_number");
      return data || [];
    },
    enabled: depositPlans.length > 0,
  });

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
  const progress = getProgressPercentage(project.stage);
  const allStages = getAllStagesOrdered().filter((s) => !s.isTerminal && !s.isOptional);
  const currentOrder = STAGE_CONFIG[project.stage]?.order || 0;

  const totalDeposit = Number(project.total_deposit_amount) || 0;
  const paidPayments = depositPayments.filter((p: any) => p.status === "paid");
  const totalPaid = paidPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);

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
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-black tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className="bg-[#957B60]/10 text-[#957B60] border-0">{getStageLabel(project.stage)}</Badge>
            <span className="text-xs text-neutral-400">{progress}% complete</span>
          </div>
        </div>
      </div>

      {/* Stage Timeline */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-black">Build Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={progress} className="h-2 mb-4" />
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {allStages.slice(0, 20).map((stage) => {
              const isCompleted = stage.order < currentOrder;
              const isCurrent = stage.id === project.stage;
              return (
                <div key={stage.id} className="flex items-center gap-3">
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : isCurrent ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[#957B60] bg-[#957B60]/20 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-neutral-300 shrink-0" />
                  )}
                  <span className={cn(
                    "text-sm",
                    isCompleted && "text-neutral-400",
                    isCurrent && "font-semibold text-[#957B60]",
                    !isCompleted && !isCurrent && "text-neutral-400"
                  )}>
                    {stage.label}
                  </span>
                  {isCurrent && <Badge className="bg-[#957B60] text-white text-[10px] ml-auto">Current</Badge>}
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
            <CardTitle className="text-base font-medium text-black">Property Details</CardTitle>
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
            <CardTitle className="text-base font-medium text-black">Key Dates</CardTitle>
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
                    isPast ? "bg-red-50 border-red-200" : isUpcoming ? "bg-[#957B60]/5 border-[#957B60]/20" : "bg-neutral-50 border-neutral-100"
                  )}>
                    <Icon className={cn("h-4 w-4 shrink-0", isPast ? "text-red-500" : isUpcoming ? "text-[#957B60]" : "text-neutral-400")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-neutral-400">{d.label}</p>
                      <p className="text-sm font-medium text-neutral-700">{format(new Date(d.date), "d MMMM yyyy")}</p>
                    </div>
                    <span className={cn(
                      "text-xs font-semibold",
                      isPast ? "text-red-500" : isUpcoming ? "text-[#957B60]" : "text-neutral-400"
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
              <CardTitle className="text-base font-medium text-black flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-[#957B60]" />
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

      {/* Activity */}
      {activities.length > 0 && (
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-black flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#957B60]" />
              Activity Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activities.map((a: any) => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-[#957B60] mt-1.5" />
                    <div className="w-px flex-1 bg-neutral-200 mt-1" />
                  </div>
                  <div className="pb-4">
                    <p className="font-medium text-neutral-800">{a.title}</p>
                    {a.description && <p className="text-neutral-500 text-xs mt-0.5">{a.description}</p>}
                    <p className="text-xs text-neutral-400 mt-1">{format(new Date(a.created_at), "d MMM yyyy 'at' h:mm a")}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
