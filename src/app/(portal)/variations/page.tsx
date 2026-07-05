"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, Plus, Clock, Loader2 } from "lucide-react";
import { PageHeading } from "@/components/PortalHeading";

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

const CATEGORY_LABELS: Record<string, string> = {
  structural: "Structural",
  electrical: "Electrical",
  plumbing: "Plumbing",
  kitchen: "Kitchen",
  flooring: "Flooring",
  external: "External",
  upgrade: "Upgrade",
  other: "Other",
};
const CATEGORIES = Object.keys(CATEGORY_LABELS);

interface VItem {
  id: string;
  item_name: string;
  description: string | null;
  category: string;
  price: number | null;
  status: string;
}

export default function PortalVariationsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [item, setItem] = useState("");
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
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
      const { data: projs } = await supabase
        .from("projects")
        .select("id, name")
        .or(`client_id.eq.${contact.id},co_client_ids.cs.{${contact.id}}`)
        .order("created_at", { ascending: false });
      const list = (projs ?? []) as { id: string; name: string }[];
      setProjects(list);
      setProjectId((prev) => prev ?? list[0]?.id ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-variations", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const [{ data: rows }, locked, round] = await Promise.all([
        supabase
          .from("project_variations")
          .select("id, item_name, description, category, price, status")
          .eq("project_id", projectId)
          .eq("portal_visible", true)
          .order("created_at", { ascending: true }),
        supabase.rpc("variation_register_locked", { p_project_id: projectId }),
        supabase.rpc("variation_current_round", { p_project_id: projectId }),
      ]);
      const canRequest = !locked.data && (round.data ?? 0) < 3;
      return { items: (rows ?? []) as VItem[], canRequest };
    },
  });

  const items = data?.items ?? [];
  const canRequest = data?.canRequest ?? false;
  const quoted = items.filter((i) => i.status === "quoted");
  const approved = items.filter((i) => i.status === "confirmed");
  const declined = items.filter((i) => i.status === "rejected");
  const approvedTotal = approved.reduce((s, i) => s + (i.price ?? 0), 0);

  const decideMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approve" | "decline" }) => {
      const { error } = await supabase.rpc("portal_set_variation_decision", {
        p_variation_id: id,
        p_decision: decision,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal-variations"] }),
    onError: (e: any) => setFeedback({ ok: false, text: e?.message || "Something went wrong" }),
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("portal_create_variation_request", {
        p_project_id: projectId,
        p_item_name: item.trim(),
        p_description: description.trim() || null,
        p_category: category,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setFeedback({ ok: true, text: "Request sent to your consultant." });
      setItem("");
      setDescription("");
      setCategory("other");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["portal-variations"] });
    },
    onError: (e: any) =>
      setFeedback({ ok: false, text: e?.message || "Please contact your consultant" }),
  });

  return (
    <div className="space-y-6">
      <PageHeading
        label="Variations"
        title="Variations"
        subtitle="Review and approve changes to your home, and request new ones"
        action={
          projects.length > 1 && projectId ? (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {feedback && (
        <div
          className={
            feedback.ok
              ? "rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700"
              : "rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
          }
        >
          {feedback.text}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          {/* Awaiting approval */}
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-brand-gold">
              Awaiting your approval
            </h2>
            {quoted.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-neutral-500">
                  Nothing needs your approval right now.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {quoted.map((i) => (
                  <Card key={i.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-heading text-base font-semibold text-black">
                            {i.item_name}
                          </div>
                          <div className="text-xs uppercase tracking-wider text-neutral-400">
                            {CATEGORY_LABELS[i.category] || i.category}
                          </div>
                          {i.description && (
                            <p className="mt-1 text-sm text-neutral-600">{i.description}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right font-heading text-lg font-bold text-black">
                          {i.price != null ? AUD.format(i.price) : "TBC"}
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => decideMutation.mutate({ id: i.id, decision: "approve" })}
                          disabled={decideMutation.isPending}
                          className="flex-1 bg-brand-gold text-white hover:bg-brand-gold-dark"
                        >
                          <Check className="mr-1 h-4 w-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decideMutation.mutate({ id: i.id, decision: "decline" })}
                          disabled={decideMutation.isPending}
                          className="flex-1"
                        >
                          <X className="mr-1 h-4 w-4" /> Decline
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Approved */}
          {approved.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-wider text-brand-gold">
                  Approved
                </h2>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">Total</div>
                  <div className="font-heading text-lg font-bold text-black">
                    {AUD.format(approvedTotal)}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {approved.map((i) => (
                  <Card key={i.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <span className="flex items-center gap-2 font-medium text-black">
                        <Check className="h-4 w-4 text-green-600" /> {i.item_name}
                      </span>
                      <span className="font-medium tabular-nums">
                        {i.price != null ? AUD.format(i.price) : "—"}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Declined */}
          {declined.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
                Declined
              </h2>
              <div className="space-y-2">
                {declined.map((i) => (
                  <Card key={i.id} className="bg-neutral-50">
                    <CardContent className="flex items-center justify-between p-4 text-neutral-500">
                      <span className="flex items-center gap-2">
                        <X className="h-4 w-4" /> {i.item_name}
                      </span>
                      <span className="text-sm tabular-nums">
                        {i.price != null ? AUD.format(i.price) : "—"}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Request a change */}
          <section className="rounded-lg border border-brand-gold/40 bg-brand-gold/5 p-4">
            <h2 className="font-heading text-base font-semibold text-black">Request a change</h2>
            {!canRequest ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-neutral-600">
                <Clock className="h-4 w-4 text-brand-gold" />
                To request a further change, please contact your consultant.
              </p>
            ) : !showForm ? (
              <>
                <p className="mt-1 text-sm text-neutral-600">
                  Something you&apos;d like to add or change in your home? Send it to your
                  consultant and they&apos;ll confirm pricing with the builder.
                </p>
                <Button
                  className="mt-3 bg-brand-gold text-white hover:bg-brand-gold-dark"
                  onClick={() => setShowForm(true)}
                >
                  <Plus className="mr-1 h-4 w-4" /> Request a change
                </Button>
              </>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <Label className="text-xs">What would you like to change or add?</Label>
                  <Input
                    value={item}
                    onChange={(e) => setItem(e.target.value)}
                    placeholder="e.g. Add a rear deck"
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Any details (optional)</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tell us a little more…"
                    className="mt-1 bg-white"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => requestMutation.mutate()}
                    disabled={!item.trim() || requestMutation.isPending}
                    className="bg-brand-gold text-white hover:bg-brand-gold-dark"
                  >
                    {requestMutation.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : null}
                    Send request
                  </Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
