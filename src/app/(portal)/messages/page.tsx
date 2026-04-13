"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Send, User, ArrowLeft } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function PortalMessages() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [salesRepName, setSalesRepName] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: contact } = await supabase.from("contacts").select("id").eq("linked_user_id", user.id).single();
      if (!contact) return;
      setContactId(contact.id);
      const { data: projects } = await supabase.from("projects").select("id, sales_rep_id").eq("client_id", contact.id);
      if (projects?.length) {
        setProjectIds(projects.map((p: any) => p.id));
        const repId = projects[0].sales_rep_id;
        if (repId) {
          const { data: rep } = await supabase.from("user_profiles").select("display_name, email").eq("id", repId).single();
          setSalesRepName(rep?.display_name || rep?.email || "Your Sales Rep");
        }
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ["portal-emails", contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data } = await supabase.from("email_log").select("*").eq("contact_id", contactId).order("sent_at", { ascending: false });
      return data || [];
    },
    enabled: !!contactId,
  });

  // Group by thread
  const threads = (() => {
    const map: Record<string, any[]> = {};
    emails.forEach((e: any) => {
      const key = e.thread_id || e.id;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return Object.entries(map)
      .map(([threadId, msgs]) => ({
        threadId,
        messages: msgs.sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()),
        latest: msgs.reduce((a, b) => (new Date(a.sent_at) > new Date(b.sent_at) ? a : b)),
        subject: msgs[0].subject || "(No subject)",
      }))
      .sort((a, b) => new Date(b.latest.sent_at).getTime() - new Date(a.latest.sent_at).getTime());
  })();

  const activeThread = threads.find((t) => t.threadId === selectedThread);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeThread?.messages.length]);

  const handleSend = async () => {
    if (!newMessage.trim() || !contactId || !userId) return;
    setSending(true);
    try {
      await supabase.from("email_log").insert({
        user_id: userId,
        contact_id: contactId,
        project_id: projectIds[0] || null,
        direction: "outbound",
        subject: "Client Portal Enquiry",
        body_preview: newMessage.trim().substring(0, 500),
        from_address: null,
        to_addresses: [],
        sent_at: new Date().toISOString(),
        thread_id: selectedThread || null,
      });
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["portal-emails"] });
    } catch (err) {
      console.error("Send failed:", err);
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-black tracking-tight">Messages</h1>
        {salesRepName && <p className="text-sm text-neutral-500 mt-1">Your sales rep: {salesRepName}</p>}
      </div>

      {selectedThread && activeThread ? (
        /* Thread view */
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSelectedThread(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <CardTitle className="text-base font-medium">{activeThread.subject}</CardTitle>
                <p className="text-xs text-neutral-400">{activeThread.messages.length} messages</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={scrollRef} className="space-y-4 max-h-[400px] overflow-y-auto mb-4">
              {activeThread.messages.map((msg: any) => {
                const isOutbound = msg.direction === "outbound" && msg.user_id === userId;
                return (
                  <div key={msg.id} className={cn("flex gap-3", isOutbound && "flex-row-reverse")}>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className={cn("text-xs", isOutbound ? "bg-black text-white" : "bg-[#957B60]/10 text-[#957B60]")}>
                        {isOutbound ? "Me" : "SR"}
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn(
                      "max-w-[80%] rounded-xl px-4 py-3",
                      isOutbound ? "bg-black text-white" : "bg-neutral-100 text-neutral-800"
                    )}>
                      <p className="text-sm whitespace-pre-wrap">{msg.body_preview}</p>
                      <p className={cn("text-[10px] mt-2", isOutbound ? "text-white/50" : "text-neutral-400")}>
                        {format(new Date(msg.sent_at), "d MMM, h:mm a")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <Separator className="mb-4" />
            <div className="flex gap-2">
              <Textarea
                placeholder="Type your message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="min-h-[60px] resize-none"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              />
              <Button className="bg-[#957B60] hover:bg-[#7a6550] text-white shrink-0 self-end" onClick={handleSend} disabled={!newMessage.trim() || sending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Thread list */
        <>
          {threads.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-neutral-400">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No messages yet</p>
                <p className="text-sm mt-1">Send an enquiry to your sales rep below</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {threads.map((thread) => (
                <Card key={thread.threadId} className="border border-neutral-200 hover:border-neutral-300 transition-colors cursor-pointer" onClick={() => setSelectedThread(thread.threadId)}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-[#957B60]/10 text-[#957B60] text-sm">
                        {thread.latest.direction === "inbound" ? "SR" : "Me"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-neutral-800 truncate">{thread.subject}</p>
                      <p className="text-xs text-neutral-500 truncate mt-0.5">{thread.latest.body_preview}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-neutral-400">{formatDistanceToNow(new Date(thread.latest.sent_at), { addSuffix: true })}</p>
                      <Badge variant="secondary" className="text-[10px] mt-1">{thread.messages.length}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Quick enquiry */}
          <Card className="border border-neutral-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium text-black">Send an Enquiry</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Type your question or message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
                <Button className="bg-[#957B60] hover:bg-[#7a6550] text-white shrink-0 self-end" onClick={handleSend} disabled={!newMessage.trim() || sending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
