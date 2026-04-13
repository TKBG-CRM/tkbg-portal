"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Home, Calendar, MapPin, ArrowRight, Bell, Activity, FolderKanban } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { getStageLabel, getProgressPercentage, STAGE_CONFIG } from "@/lib/stages";

export default function PortalDashboard() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [contactId, setContactId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("linked_user_id", user.id)
        .single();
      if (contact) {
        setContactId(contact.id);
        setClientName(`${contact.first_name} ${contact.last_name}`);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["portal-projects", contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .eq("client_id", contactId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!contactId,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["portal-activities", contactId],
    queryFn: async () => {
      if (!projects.length) return [];
      const ids = projects.map((p: any) => p.id);
      const { data } = await supabase
        .from("activities")
        .select("*")
        .in("project_id", ids)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: projects.length > 0,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["portal-notifications", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      return count || 0;
    },
    enabled: !!userId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!contactId) return;
    const channel = supabase
      .channel("portal-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `client_id=eq.${contactId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["portal-projects", contactId] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, () => {
        queryClient.invalidateQueries({ queryKey: ["portal-activities", contactId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  if (isLoading || !contactId) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black tracking-tight">
            Welcome back, {clientName.split(" ")[0]}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Here&apos;s the latest on your build journey</p>
        </div>
        {unreadCount > 0 && (
          <Badge className="bg-[#957B60] text-white gap-1">
            <Bell className="h-3 w-3" /> {unreadCount} new
          </Badge>
        )}
      </div>

      {/* Projects */}
      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-neutral-400">
            <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No projects yet</p>
            <p className="text-sm mt-1">Your sales rep will set up your project soon.</p>
          </CardContent>
        </Card>
      ) : (
        projects.map((project: any) => {
          const progress = getProgressPercentage(project.stage);
          const stageLabel = getStageLabel(project.stage);
          const nextStages = STAGE_CONFIG[project.stage]?.nextStages || [];
          const nextStageLabel = nextStages.length > 0 ? getStageLabel(nextStages[0]) : null;

          return (
            <Card key={project.id} className="border border-neutral-200 shadow-sm overflow-hidden">
              <div className="h-1 bg-neutral-100">
                <div className="h-full bg-[#957B60] transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-medium text-black">{project.name}</CardTitle>
                  <Badge variant="outline" className={cn(
                    project.status === "active" && "border-[#957B60]/30 text-[#957B60]",
                    project.status === "completed" && "border-green-300 text-green-700",
                  )}>
                    {project.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-[#957B60]/10 text-[#957B60] border-0">{stageLabel}</Badge>
                  <span className="text-xs text-neutral-400">{progress}% complete</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Property info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {project.land_address && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                      <span className="text-neutral-600">{project.land_address}</span>
                    </div>
                  )}
                  {project.house_design && (
                    <div className="flex items-start gap-2 text-sm">
                      <Home className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                      <span className="text-neutral-600">{project.house_design}</span>
                    </div>
                  )}
                </div>

                {/* Key dates */}
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: "Settlement", date: project.settlement_date },
                    { label: "Handover", date: project.handover_date },
                    { label: "Land Title", date: project.estimated_land_title_date },
                  ]
                    .filter((d) => d.date)
                    .map((d) => {
                      const days = differenceInDays(new Date(d.date), new Date());
                      const isUpcoming = days >= 0 && days <= 14;
                      return (
                        <div key={d.label} className={cn(
                          "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border",
                          isUpcoming ? "bg-[#957B60]/5 border-[#957B60]/20 text-[#957B60]" : "bg-neutral-50 border-neutral-200 text-neutral-500"
                        )}>
                          <Calendar className="h-3 w-3" />
                          {d.label}: {format(new Date(d.date), "d MMM yyyy")}
                          {isUpcoming && days >= 0 && <span className="font-semibold ml-1">({days}d)</span>}
                        </div>
                      );
                    })}
                </div>

                {/* Next step */}
                {nextStageLabel && (
                  <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-100">
                    <p className="text-xs text-neutral-400 uppercase tracking-wider mb-1">Next Step</p>
                    <p className="text-sm font-medium text-black">{nextStageLabel}</p>
                  </div>
                )}

                <Link href={`/projects/${project.id}`}>
                  <Button variant="outline" size="sm" className="gap-1.5 text-[#957B60] border-[#957B60]/30 hover:bg-[#957B60]/5">
                    View Full Details <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Recent Activity */}
      {activities.length > 0 && (
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-black flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#957B60]" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activities.map((a: any) => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-[#957B60] mt-1.5 flex-none" />
                  <div>
                    <p className="font-medium text-neutral-800">{a.title}</p>
                    {a.description && <p className="text-neutral-500 text-xs mt-0.5">{a.description}</p>}
                    <p className="text-xs text-neutral-400 mt-1">
                      {format(new Date(a.created_at), "d MMM yyyy 'at' h:mm a")}
                    </p>
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
