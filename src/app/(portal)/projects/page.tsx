"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { MapPin, Home, ArrowRight, FolderKanban } from "lucide-react";
import { getStageLabel, getProgressPercentage } from "@/lib/stages";

export default function PortalProjects() {
  const supabase = createClient();
  const [contactId, setContactId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("linked_user_id", user.id)
        .single();
      if (contact) setContactId(contact.id);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["portal-projects-list", contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data } = await supabase
        .from("projects")
        .select("*")
        .eq("client_id", contactId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!contactId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-black tracking-tight">My Projects</h1>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-neutral-400">
            <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No projects yet</p>
            <p className="text-sm mt-1">Your sales rep will set up your project once you&apos;re onboarded.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {projects.map((project: any) => {
            const progress = getProgressPercentage(project.stage);
            const stageLabel = getStageLabel(project.stage);
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="border border-neutral-200 hover:border-[#957B60]/40 hover:shadow-md transition-all cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-semibold text-black truncate">
                            {project.name || project.project_name || "Unnamed Project"}
                          </h2>
                          <Badge className="bg-[#957B60]/10 text-[#957B60] border-0 text-xs shrink-0">
                            {stageLabel}
                          </Badge>
                        </div>

                        {project.land_address && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-sm text-neutral-500">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{project.land_address}</span>
                          </div>
                        )}

                        {project.house_design && (
                          <div className="flex items-center gap-1.5 mt-1 text-sm text-neutral-500">
                            <Home className="h-3.5 w-3.5 shrink-0" />
                            <span>{project.house_design}</span>
                            {project.facade && <span className="text-neutral-400">— {project.facade}</span>}
                          </div>
                        )}

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                            <span>Build progress</span>
                            <span className="font-semibold text-[#957B60]">{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                      </div>

                      <ArrowRight className="h-5 w-5 text-neutral-300 shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
