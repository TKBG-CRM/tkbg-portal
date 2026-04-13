"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, ArrowRight, Check, Loader2, Upload, X, Plus, User, Home, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STEPS = ["Purchaser Details", "Current Address", "Supporting Documents"];

function RegistrationForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    full_legal_name: "",
    email: "",
    mobile: "",
    address_line1: "",
    suburb: "",
    state: "",
    postcode: "",
  });
  const [additionalPurchasers, setAdditionalPurchasers] = useState<
    { full_legal_name: string; email: string; mobile: string }[]
  >([]);
  const [paymentRemittance, setPaymentRemittance] = useState<File | null>(null);
  const [idDocuments, setIdDocuments] = useState<File[]>([]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase.from("contacts").select("*").eq("id", token).single();
      if (data) {
        setContact(data);
        setForm((prev) => ({
          ...prev,
          full_legal_name: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
          email: data.email || "",
          mobile: data.phone || "",
          address_line1: data.address_line1 || "",
          suburb: data.suburb || "",
          state: data.state || "",
          postcode: data.postcode || "",
        }));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const upd = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const addPurchaser = () =>
    setAdditionalPurchasers((p) => [...p, { full_legal_name: "", email: "", mobile: "" }]);

  const updatePurchaser = (idx: number, field: string, value: string) =>
    setAdditionalPurchasers((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );

  const removePurchaser = (idx: number) =>
    setAdditionalPurchasers((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError("");

    try {
      const uploadedIdUrls: string[] = [];

      if (paymentRemittance) {
        const filePath = `registration/${token}/${Date.now()}_payment_${paymentRemittance.name}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(filePath, paymentRemittance);
        if (upErr) console.error("Payment upload error:", upErr);
      }

      for (const file of idDocuments) {
        const filePath = `registration/${token}/${Date.now()}_id_${file.name}`;
        const { data, error: upErr } = await supabase.storage.from("documents").upload(filePath, file);
        if (!upErr && data) {
          const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(data.path);
          uploadedIdUrls.push(publicUrl);
        }
      }

      const purchasers = [
        { full_legal_name: form.full_legal_name, email: form.email, mobile: form.mobile, primary: true },
        ...additionalPurchasers.filter((p) => p.full_legal_name),
      ];

      await supabase
        .from("contacts")
        .update({
          phone: form.mobile || undefined,
          address_line1: form.address_line1 || undefined,
          suburb: form.suburb || undefined,
          state: form.state || undefined,
          postcode: form.postcode || undefined,
          is_registered: true,
          purchasers,
          id_document_urls: uploadedIdUrls.length > 0 ? uploadedIdUrls : undefined,
        })
        .eq("id", token);

      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("client_id", token)
        .limit(1);

      if (projects && projects.length > 0) {
        await supabase
          .from("projects")
          .update({
            client_full_legal_name: form.full_legal_name,
            stage_requirements_met: {
              client_id_attached: true,
              purchaser_details_collected: true,
              payment_remittance_attached: !!paymentRemittance,
            },
          })
          .eq("id", projects[0].id);
      }

      setDone(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f3f0] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#957B60]" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f5f3f0] flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <h2 className="text-lg font-semibold text-black mb-2">Invalid Link</h2>
            <p className="text-sm text-neutral-500">
              This registration link is invalid or has expired. Please contact your sales representative.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#f5f3f0] flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-black mb-2">Registration Complete!</h2>
            <p className="text-sm text-neutral-500">
              Thank you for completing your registration. You&apos;ll receive access to your client portal shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f3f0]">
      <div className="bg-black text-center py-6 px-4">
        <span className="text-xl font-bold text-white tracking-wider">TURNKEY</span>
        <span className="text-xl font-bold text-[#957B60] tracking-wider ml-2">BUILDING GROUP</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-black">Client Registration</h1>
          <p className="text-sm text-neutral-500 mt-1">Step {step + 1} of {STEPS.length}</p>
        </div>

        <div className="flex gap-1 mb-8 max-w-md mx-auto">
          {STEPS.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-1.5 w-full rounded-full transition-colors ${
                i <= step ? "bg-[#957B60]" : "bg-neutral-300"
              }`} />
              <span className={`text-[10px] ${i <= step ? "text-[#957B60] font-medium" : "text-neutral-400"}`}>
                {s}
              </span>
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="p-6">
            {step === 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5 text-[#957B60]" />
                  <h2 className="font-semibold text-black">Purchaser Details</h2>
                </div>
                <div>
                  <Label>Full Legal Name *</Label>
                  <Input value={form.full_legal_name} onChange={(e) => upd("full_legal_name", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} /></div>
                  <div><Label>Mobile *</Label><Input value={form.mobile} onChange={(e) => upd("mobile", e.target.value)} /></div>
                </div>

                {additionalPurchasers.length > 0 && (
                  <div className="border-t pt-4 mt-4 space-y-4">
                    <h3 className="text-sm font-medium text-neutral-700">Additional Purchasers</h3>
                    {additionalPurchasers.map((p, i) => (
                      <div key={i} className="border rounded-lg p-3 space-y-3 bg-neutral-50 relative">
                        <button
                          className="absolute top-2 right-2 text-neutral-400 hover:text-red-500"
                          onClick={() => removePurchaser(i)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div><Label>Full Legal Name</Label><Input value={p.full_legal_name} onChange={(e) => updatePurchaser(i, "full_legal_name", e.target.value)} /></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label>Email</Label><Input type="email" value={p.email} onChange={(e) => updatePurchaser(i, "email", e.target.value)} /></div>
                          <div><Label>Mobile</Label><Input value={p.mobile} onChange={(e) => updatePurchaser(i, "mobile", e.target.value)} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Button variant="outline" size="sm" onClick={addPurchaser} className="mt-2">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Additional Purchaser
                </Button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Home className="h-5 w-5 text-[#957B60]" />
                  <h2 className="font-semibold text-black">Current Address</h2>
                </div>
                <div><Label>Street Address *</Label><Input value={form.address_line1} onChange={(e) => upd("address_line1", e.target.value)} /></div>
                <div className="grid grid-cols-3 gap-4">
                  <div><Label>Suburb *</Label><Input value={form.suburb} onChange={(e) => upd("suburb", e.target.value)} /></div>
                  <div>
                    <Label>State *</Label>
                    <Select value={form.state} onValueChange={(v) => upd("state", v)}>
                      <SelectTrigger className="border-neutral-200"><SelectValue placeholder="State" /></SelectTrigger>
                      <SelectContent>
                        {["VIC", "NSW", "QLD", "WA", "SA", "TAS", "NT", "ACT"].map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Postcode *</Label><Input value={form.postcode} onChange={(e) => upd("postcode", e.target.value)} /></div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-[#957B60]" />
                  <h2 className="font-semibold text-black">Supporting Documents</h2>
                </div>

                <div>
                  <Label>Payment Remittance / Deposit Receipt</Label>
                  <p className="text-xs text-neutral-400 mb-2">Upload proof of deposit payment if available</p>
                  {paymentRemittance ? (
                    <div className="flex items-center gap-2 border rounded-lg p-3 bg-neutral-50">
                      <FileText className="h-4 w-4 text-[#957B60]" />
                      <span className="text-sm flex-1 truncate">{paymentRemittance.name}</span>
                      <button onClick={() => setPaymentRemittance(null)} className="text-neutral-400 hover:text-red-500">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-[#957B60]/50 transition-colors">
                      <Upload className="h-5 w-5 text-neutral-400" />
                      <span className="text-xs text-neutral-500">Click to upload</span>
                      <input type="file" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setPaymentRemittance(f);
                      }} />
                    </label>
                  )}
                </div>

                <div>
                  <Label>ID Documents</Label>
                  <p className="text-xs text-neutral-400 mb-2">Upload a photo of your driver&apos;s licence or passport</p>
                  {idDocuments.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {idDocuments.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 border rounded-lg p-3 bg-neutral-50">
                          <FileText className="h-4 w-4 text-[#957B60]" />
                          <span className="text-sm flex-1 truncate">{f.name}</span>
                          <button onClick={() => setIdDocuments((prev) => prev.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-500">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-[#957B60]/50 transition-colors">
                    <Upload className="h-5 w-5 text-neutral-400" />
                    <span className="text-xs text-neutral-500">Click to upload</span>
                    <input type="file" className="hidden" multiple onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setIdDocuments((prev) => [...prev, ...files]);
                    }} />
                  </label>
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}
              </div>
            )}

            <div className="flex justify-between items-center mt-8 pt-4 border-t">
              {step > 0 ? (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Previous
                </Button>
              ) : <div />}

              {step < 2 ? (
                <Button
                  className="bg-[#957B60] hover:bg-[#7d6750] text-white"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={step === 0 && (!form.full_legal_name || !form.email || !form.mobile)}
                >
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  className="bg-[#957B60] hover:bg-[#7d6750] text-white"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Check className="h-4 w-4 mr-2" />
                  Complete Registration
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-neutral-400 mt-6">
          &copy; {new Date().getFullYear()} Turnkey Building Group. All rights reserved.
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f5f3f0] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#957B60]" />
      </div>
    }>
      <RegistrationForm />
    </Suspense>
  );
}
