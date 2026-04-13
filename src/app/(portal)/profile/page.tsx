"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, Save, Mail, Phone, MapPin, Calendar, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

export default function PortalProfile() {
  const supabase = createClient();
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    email: "",
    phone: "",
    address_line1: "",
    suburb: "",
    state: "",
    postcode: "",
  });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("contacts").select("*").eq("linked_user_id", user.id).single();
      if (data) {
        setContact(data);
        setForm({
          email: data.email || "",
          phone: data.phone || "",
          address_line1: data.address_line1 || "",
          suburb: data.suburb || "",
          state: data.state || "",
          postcode: data.postcode || "",
        });
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!contact) return;
    setSaving(true);
    setSaved(false);
    await supabase.from("contacts").update({
      email: form.email || null,
      phone: form.phone || null,
      address_line1: form.address_line1 || null,
      suburb: form.suburb || null,
      state: form.state || null,
      postcode: form.postcode || null,
      updated_at: new Date().toISOString(),
    }).eq("id", contact.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!contact) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-neutral-400">
          <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Profile not found</p>
          <p className="text-sm mt-1">Please contact your sales rep to link your account.</p>
        </CardContent>
      </Card>
    );
  }

  const initials = `${contact.first_name?.[0] || ""}${contact.last_name?.[0] || ""}`.toUpperCase();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-black tracking-tight">My Profile</h1>

      {/* Identity card */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-white shadow-md">
              <AvatarFallback className="bg-[#957B60]/10 text-[#957B60] text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-semibold text-black">
                {contact.first_name} {contact.last_name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="secondary" className="bg-black/10 text-black">
                  {contact.contact_type?.replace("_", " ")}
                </Badge>
                {contact.buyer_type && (
                  <Badge variant="outline">{contact.buyer_type.replace("_", " ")}</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable fields */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium text-black">Contact Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-neutral-400" /> Email</Label>
              <Input value={form.email} onChange={(e) => update("email", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-neutral-400" /> Phone</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} className="mt-1" />
            </div>
          </div>

          <Separator />

          <div>
            <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-neutral-400" /> Street Address</Label>
            <Input value={form.address_line1} onChange={(e) => update("address_line1", e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Suburb</Label>
              <Input value={form.suburb} onChange={(e) => update("suburb", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => update("state", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Postcode</Label>
              <Input value={form.postcode} onChange={(e) => update("postcode", e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button className="bg-[#957B60] hover:bg-[#7a6550] text-white gap-2" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Read-only info */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium text-black">Account Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {contact.source && (
            <div>
              <p className="text-xs text-neutral-400">Source</p>
              <Badge variant="outline" className="mt-1">{contact.source.replace("_", " ")}</Badge>
            </div>
          )}
          <div>
            <p className="text-xs text-neutral-400">Member Since</p>
            <p className="text-sm text-neutral-600 flex items-center gap-1.5 mt-1">
              <Calendar className="h-3.5 w-3.5 text-neutral-400" />
              {format(new Date(contact.created_at), "d MMMM yyyy")}
            </p>
          </div>
          {contact.tags?.length > 0 && (
            <div>
              <p className="text-xs text-neutral-400 mb-1.5">Tags</p>
              <div className="flex flex-wrap gap-1">
                {contact.tags.map((tag: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
