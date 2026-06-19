"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, ArrowRight, Check, Loader2, Upload, X, Plus, User, Home, FileText, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SplashGate } from "@/components/SplashGate";

const STEPS = ["Purchaser Details", "Current Address", "Supporting Documents", "Set Password"];

function RegistrationForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Brief branded "welcome aboard" moment shown after a successful submit while
  // we sign the client in and redirect them into the portal.
  const [welcoming, setWelcoming] = useState(false);
  const [error, setError] = useState("");
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [form, setForm] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    mobile: "",
    address_line1: "",
    suburb: "",
    city: "",
    state: "",
    postcode: "",
  });
  const [additionalPurchasers, setAdditionalPurchasers] = useState<
    {
      first_name: string;
      middle_name: string;
      last_name: string;
      email: string;
      mobile: string;
      idDocuments: File[];
    }[]
  >([]);
  const [paymentRemittance, setPaymentRemittance] = useState<File | null>(null);
  // ID documents for the PRIMARY purchaser. Each additional purchaser keeps
  // their own ID files on their entry in `additionalPurchasers`.
  const [idDocuments, setIdDocuments] = useState<File[]>([]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Remember the storage path we uploaded each File to, so a retry after
  // a failed submit reuses the same upload instead of creating a second
  // orphaned copy in registration/<token>/.
  const uploadedPaths = useRef<Map<File, string>>(new Map());

  // Load contact data via server endpoint (anon can't read contacts directly)
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/register/lookup?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          const { contact: c } = await res.json();
          setContact(c);
          setForm((prev) => ({
            ...prev,
            first_name: c.first_name || "",
            middle_name: c.middle_name || "",
            last_name: c.last_name || "",
            email: c.email || "",
            mobile: c.phone || "",
            address_line1: c.address_line1 || "",
            suburb: c.suburb || "",
            // Contact record has no separate city column — we only auto-fill
            // from suburb when city is actually a bigger locality. Leave
            // blank so the client types their own.
            city: (c as any).city || "",
            state: c.state || "",
            postcode: c.postcode || "",
          }));
        } else {
          const { error: msg } = await res.json().catch(() => ({ error: "Invalid link" }));
          setError(msg || "Invalid or expired registration link.");
        }
      } catch {
        setError("Could not load registration. Please try again.");
      }
      setLoading(false);
    })();
  }, [token]);

  const upd = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  // Compose a display name from split parts (drops an empty middle name).
  const composeName = (p: {
    first_name?: string;
    middle_name?: string;
    last_name?: string;
  }) =>
    [p.first_name, p.middle_name, p.last_name]
      .map((s) => (s || "").trim())
      .filter(Boolean)
      .join(" ");

  const primaryName = composeName(form);

  const addPurchaser = () =>
    setAdditionalPurchasers((p) => [
      ...p,
      {
        first_name: "",
        middle_name: "",
        last_name: "",
        email: "",
        mobile: "",
        idDocuments: [],
      },
    ]);

  const updatePurchaser = (idx: number, field: string, value: string) =>
    setAdditionalPurchasers((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );

  const removePurchaser = (idx: number) =>
    setAdditionalPurchasers((prev) => prev.filter((_, i) => i !== idx));

  const addPurchaserIdFiles = (idx: number, files: File[]) =>
    setAdditionalPurchasers((prev) =>
      prev.map((p, i) =>
        i === idx ? { ...p, idDocuments: [...p.idDocuments, ...files] } : p
      )
    );

  const removePurchaserIdFile = (idx: number, fileIdx: number) =>
    setAdditionalPurchasers((prev) =>
      prev.map((p, i) =>
        i === idx
          ? { ...p, idDocuments: p.idDocuments.filter((_, j) => j !== fileIdx) }
          : p
      )
    );

  // One ID-document upload card, reused for the primary purchaser and each
  // additional purchaser so every person on the contract attaches their own ID.
  const idUploadCard = (
    key: string,
    title: string,
    files: File[],
    onAdd: (files: File[]) => void,
    onRemove: (fileIdx: number) => void
  ) => (
    <div key={key} className="rounded-lg border p-3">
      <p className="text-sm font-medium text-neutral-700 mb-2">{title}</p>
      {files.length > 0 && (
        <div className="space-y-2 mb-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 border rounded-lg p-3 bg-neutral-50">
              <FileText className="h-4 w-4 text-brand-gold" />
              <span className="text-sm flex-1 truncate">{f.name}</span>
              <button onClick={() => onRemove(i)} className="text-neutral-400 hover:text-red-500">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-brand-gold/50 transition-colors">
        <Upload className="h-5 w-5 text-neutral-400" />
        <span className="text-xs text-neutral-500">Click to upload</span>
        <input
          type="file"
          className="hidden"
          multiple
          onChange={(e) => {
            const f = Array.from(e.target.files || []);
            if (f.length) onAdd(f);
          }}
        />
      </label>
    </div>
  );

  const handleSubmit = async () => {
    if (!token) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      // Upload files under registration/<token>/ (allowed by storage policy).
      // Reuse a previously-uploaded path for the same File so a retry after a
      // failed submit doesn't orphan a duplicate copy.
      const uploadIdFiles = async (files: File[]): Promise<string[]> => {
        const paths: string[] = [];
        for (const file of files) {
          const already = uploadedPaths.current.get(file);
          if (already) {
            paths.push(already);
            continue;
          }
          const filePath = `registration/${token}/${Date.now()}_id_${file.name}`;
          const { data, error: upErr } = await supabase.storage
            .from("documents")
            .upload(filePath, file, { upsert: false });
          if (upErr) throw new Error(`Could not upload ${file.name}: ${upErr.message}`);
          const uploadedPath = data?.path ?? filePath;
          paths.push(uploadedPath);
          uploadedPaths.current.set(file, uploadedPath);
        }
        return paths;
      };

      let paymentRemittancePath: string | null = null;
      if (paymentRemittance) {
        const already = uploadedPaths.current.get(paymentRemittance);
        if (already) {
          paymentRemittancePath = already;
        } else {
          const filePath = `registration/${token}/${Date.now()}_payment_${paymentRemittance.name}`;
          const { data, error: upErr } = await supabase.storage
            .from("documents")
            .upload(filePath, paymentRemittance, { upsert: false });
          if (upErr) throw new Error(`Could not upload payment remittance: ${upErr.message}`);
          paymentRemittancePath = data?.path ?? filePath;
          uploadedPaths.current.set(paymentRemittance, paymentRemittancePath);
        }
      }

      // Primary purchaser's IDs, then each additional purchaser's own IDs.
      const idDocumentPaths = await uploadIdFiles(idDocuments);
      const additionalPurchasersPayload = await Promise.all(
        additionalPurchasers
          .filter((p) => p.first_name.trim() && p.last_name.trim())
          .map(async (p) => ({
            first_name: p.first_name,
            middle_name: p.middle_name,
            last_name: p.last_name,
            email: p.email,
            mobile: p.mobile,
            idDocumentPaths: await uploadIdFiles(p.idDocuments),
          }))
      );

      const res = await fetch("/api/register/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          first_name: form.first_name,
          middle_name: form.middle_name,
          last_name: form.last_name,
          email: form.email,
          mobile: form.mobile,
          address_line1: form.address_line1,
          suburb: form.suburb,
          city: form.city,
          state: form.state,
          postcode: form.postcode,
          additionalPurchasers: additionalPurchasersPayload,
          idDocumentPaths,
          paymentRemittancePath,
          password,
        }),
      });

      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Submission failed" }));
        throw new Error(msg || "Submission failed");
      }

      // Registration succeeded — the submit API created (or updated) the auth
      // user with email_confirm:true and the password just set. Sign in with
      // those same credentials so the client lands logged in, then show a brief
      // branded welcome and hand them off to the portal.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password,
      });

      if (signInErr) {
        // Don't lose the success state — fall back to the manual login link.
        setDone(true);
        setSubmitting(false);
        return;
      }

      setWelcoming(true);
      // Full navigation (not router.push) so the fresh session cookie is
      // picked up by the portal. The portal home lives at the site root.
      setTimeout(() => {
        window.location.assign("/");
      }, 2200);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f5f2] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f7f5f2] flex items-center justify-center">
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

  // Brief branded "welcome aboard" moment while we redirect the freshly
  // signed-in client into the portal.
  if (welcoming) {
    return (
      <div className="min-h-screen bg-brand-black flex items-center justify-center px-4 text-center">
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/TURNKEY_LOGO_HORIZONTAL_GOLD.svg"
            alt="Turnkey Building Group"
            className="h-14 mb-10"
          />
          <div className="h-16 w-16 rounded-full bg-brand-gold/15 flex items-center justify-center mb-5">
            <Check className="h-8 w-8 text-brand-gold" />
          </div>
          <h2 className="text-2xl font-semibold text-white">
            Welcome aboard{form.first_name ? `, ${form.first_name}` : ""}!
          </h2>
          <p className="text-sm text-white/60 mt-3 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />
            Taking you to your project…
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#f7f5f2] flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/TURNKEY_LOGO_GOLD.svg"
              alt="Turnkey Building Group"
              className="h-20 mx-auto mb-6"
            />
            <div className="h-16 w-16 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-brand-gold" />
            </div>
            <h2 className="text-lg font-semibold text-black mb-2">Registration Complete!</h2>
            <p className="text-sm text-neutral-500 mb-6">
              Thank you for registering. You can now sign in to your Turnkey client portal using the email and password you just created.
            </p>
            <a
              href="/login"
              className="inline-flex items-center justify-center bg-brand-gold hover:bg-brand-gold-dark text-white text-sm font-medium px-6 py-2.5 rounded-md transition-colors"
            >
              Go to Client Portal
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      {/* Premium dark hero — gold logo + a warm, personalised welcome. */}
      <div className="bg-brand-black px-4 pt-12 pb-16 sm:pb-20 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/TURNKEY_LOGO_HORIZONTAL_GOLD.svg"
          alt="Turnkey Building Group"
          className="h-12 mx-auto mb-8"
        />
        <p className="text-[10px] uppercase tracking-[0.25em] text-brand-gold">
          Welcome to Turnkey
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-white mt-2">
          {form.first_name
            ? `Welcome, ${form.first_name}. Let's get you set up.`
            : "Let's get you set up."}
        </h1>
        <p className="text-sm text-white/60 mt-3 max-w-md mx-auto">
          A few quick details and you&apos;ll be ready to start your building
          journey with us.
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-12 -mt-8 sm:-mt-10">
        <div className="text-center mb-6">
          <p className="text-sm text-neutral-500">Step {step + 1} of {STEPS.length}</p>
        </div>

        {/* Steps indicator */}
        <div className="flex gap-1 mb-8 max-w-md mx-auto">
          {STEPS.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-1.5 w-full rounded-full transition-colors ${
                i <= step ? "bg-brand-gold" : "bg-neutral-300"
              }`} />
              <span className={`text-[10px] ${i <= step ? "text-brand-gold font-medium" : "text-neutral-400"}`}>
                {s}
              </span>
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="p-6">
            {/* Step 1 — Purchaser Details */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5 text-brand-gold" />
                  <h2 className="font-semibold text-black">Purchaser Details</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><Label>First Name *</Label><Input value={form.first_name} onChange={(e) => upd("first_name", e.target.value)} /></div>
                  <div><Label>Middle Name</Label><Input value={form.middle_name} onChange={(e) => upd("middle_name", e.target.value)} /></div>
                  <div><Label>Last Name *</Label><Input value={form.last_name} onChange={(e) => upd("last_name", e.target.value)} /></div>
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
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div><Label>First Name</Label><Input value={p.first_name} onChange={(e) => updatePurchaser(i, "first_name", e.target.value)} /></div>
                          <div><Label>Middle Name</Label><Input value={p.middle_name} onChange={(e) => updatePurchaser(i, "middle_name", e.target.value)} /></div>
                          <div><Label>Last Name</Label><Input value={p.last_name} onChange={(e) => updatePurchaser(i, "last_name", e.target.value)} /></div>
                        </div>
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

            {/* Step 2 — Current Address */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Home className="h-5 w-5 text-brand-gold" />
                  <h2 className="font-semibold text-black">Current Address</h2>
                </div>
                <div><Label>Street Address *</Label><Input value={form.address_line1} onChange={(e) => upd("address_line1", e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Suburb *</Label><Input value={form.suburb} onChange={(e) => upd("suburb", e.target.value)} /></div>
                  <div><Label>City *</Label><Input value={form.city} onChange={(e) => upd("city", e.target.value)} placeholder="e.g. Melbourne" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>State *</Label>
                    <Select value={form.state} onValueChange={(v) => upd("state", v)}>
                      <SelectTrigger className="border-neutral-200"><SelectValue placeholder="State" /></SelectTrigger>
                      <SelectContent>
                        {["VIC","NSW","QLD","WA","SA","TAS","NT","ACT"].map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Postcode *</Label><Input value={form.postcode} onChange={(e) => upd("postcode", e.target.value)} /></div>
                </div>
              </div>
            )}

            {/* Step 3 — Supporting Documents */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-brand-gold" />
                  <h2 className="font-semibold text-black">Supporting Documents</h2>
                </div>

                {/* Payment Remittance */}
                <div>
                  <Label>Payment Remittance / Deposit Receipt</Label>
                  <p className="text-xs text-neutral-400 mb-2">Upload proof of deposit payment if available</p>
                  {paymentRemittance ? (
                    <div className="flex items-center gap-2 border rounded-lg p-3 bg-neutral-50">
                      <FileText className="h-4 w-4 text-brand-gold" />
                      <span className="text-sm flex-1 truncate">{paymentRemittance.name}</span>
                      <button onClick={() => setPaymentRemittance(null)} className="text-neutral-400 hover:text-red-500">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-brand-gold/50 transition-colors">
                      <Upload className="h-5 w-5 text-neutral-400" />
                      <span className="text-xs text-neutral-500">Click to upload</span>
                      <input type="file" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setPaymentRemittance(f);
                      }} />
                    </label>
                  )}
                </div>

                {/* ID Documents — one upload per purchaser so each person on
                    the contract attaches their own driver's licence / passport. */}
                <div>
                  <Label>ID Documents</Label>
                  <p className="text-xs text-neutral-400 mb-2">
                    Upload a photo of each purchaser&apos;s driver&apos;s licence or passport
                  </p>
                  <div className="space-y-3">
                    {idUploadCard(
                      "primary",
                      `${primaryName || "Primary purchaser"} (You)`,
                      idDocuments,
                      (files) => setIdDocuments((prev) => [...prev, ...files]),
                      (fileIdx) =>
                        setIdDocuments((prev) => prev.filter((_, j) => j !== fileIdx))
                    )}
                    {additionalPurchasers.map((p, i) =>
                      idUploadCard(
                        `additional-${i}`,
                        composeName(p) || `Additional purchaser ${i + 1}`,
                        p.idDocuments,
                        (files) => addPurchaserIdFiles(i, files),
                        (fileIdx) => removePurchaserIdFile(i, fileIdx)
                      )
                    )}
                  </div>
                  {additionalPurchasers.length === 0 && (
                    <p className="text-[11px] text-neutral-400 mt-2">
                      Added another purchaser? You can go back to Step 1 to add them, then upload their ID here.
                    </p>
                  )}
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}
              </div>
            )}

            {/* Step 4 — Set Password */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="h-5 w-5 text-brand-gold" />
                  <h2 className="font-semibold text-black">Set Your Password</h2>
                </div>
                <p className="text-sm text-neutral-500">
                  Create a password to sign in to your Turnkey client portal. You&apos;ll use this together with your email ({form.email}) whenever you log in.
                </p>
                <div>
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label>Confirm Password *</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center mt-8 pt-4 border-t">
              {step > 0 ? (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Previous
                </Button>
              ) : <div />}

              {step < STEPS.length - 1 ? (
                <Button
                  className="bg-brand-gold hover:bg-brand-gold-dark text-white"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={
                    step === 0 &&
                    (!form.first_name.trim() ||
                      !form.last_name.trim() ||
                      !form.email ||
                      !form.mobile)
                  }
                >
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  className="bg-brand-gold hover:bg-brand-gold-dark text-white"
                  onClick={handleSubmit}
                  disabled={submitting || password.length < 8 || password !== confirmPassword}
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
    <>
      <SplashGate />
      <Suspense fallback={
        <div className="min-h-screen bg-[#f7f5f2] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
        </div>
      }>
        <RegistrationForm />
      </Suspense>
    </>
  );
}
