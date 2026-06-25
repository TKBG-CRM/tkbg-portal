"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, ArrowRight, Check, Loader2, Upload, X, Plus, User, Home, FileText, Lock,
  Copy, Landmark, CreditCard,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SplashGate } from "@/components/SplashGate";

const STEPS = ["Purchaser Details", "Current Address", "Supporting Documents", "Broker & Conveyancer", "Set Password"];

/**
 * Uppercase letter-spaced field label matching the branded email template.
 * Required fields get a brand-gold asterisk. Rendered in the Helvetica
 * heading face for crisp small caps (the body default is Solina serif).
 */
function FieldLabel({
  children,
  required,
  className = "",
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <Label
      className={`block mb-1.5 font-heading text-[10px] uppercase tracking-[0.18em] text-neutral-500 ${className}`}
    >
      {children}
      {required && <span className="text-brand-gold"> *</span>}
    </Label>
  );
}

/**
 * Step section header — a gold brand icon beside an uppercase letter-spaced
 * title, echoing the section dividers in the branded emails.
 */
function SectionHeader({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-neutral-100">
      <Icon className="h-4 w-4 text-brand-gold shrink-0" />
      <h2 className="font-heading text-xs uppercase tracking-[0.2em] font-bold text-black">
        {children}
      </h2>
    </div>
  );
}

function RegistrationForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  // Existing client (details already in the CRM): skip the full onboarding and
  // go straight to setting a password to activate portal access.
  const isAccess = searchParams.get("mode") === "access";
  const supabase = createClient();

  const [step, setStep] = useState(isAccess ? 4 : 0);
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

  // Optional broker + conveyancer details. If the client fills these in, the
  // submit API creates them as CRM contacts and links them onto the project so
  // sales staff don't have to chase and re-enter them.
  const emptyPartner = { company_name: "", first_name: "", last_name: "", email: "", mobile: "" };
  const [broker, setBroker] = useState({ ...emptyPartner });
  const [conveyancer, setConveyancer] = useState({ ...emptyPartner });
  const updBroker = (field: string, value: string) =>
    setBroker((prev) => ({ ...prev, [field]: value }));
  const updConveyancer = (field: string, value: string) =>
    setConveyancer((prev) => ({ ...prev, [field]: value }));

  // Deposit step: client either already paid (upload remittance) or needs to
  // pay now (reveal the TKBG bank details + transfer reference).
  const [depositChoice, setDepositChoice] = useState<"" | "paid" | "pay_now">("");
  // After the client taps "I've sent the transfer" we expand the remittance
  // upload so they can attach proof straight away.
  const [transferSent, setTransferSent] = useState(false);
  const [lotNumber, setLotNumber] = useState("");
  // Bank-transfer reference, auto-filled as "{Lot Number} {Last Name}" but
  // editable (e.g. when no lot is on file yet).
  const [reference, setReference] = useState("");
  const [referenceEdited, setReferenceEdited] = useState(false);
  // Which bank field was just copied — drives the "Copied!" toast.
  const [copiedField, setCopiedField] = useState<string | null>(null);

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
          if (c.lot_number) setLotNumber(String(c.lot_number).trim());
          setForm((prev) => ({
            ...prev,
            first_name: c.first_name || "",
            middle_name: c.middle_name || "",
            last_name: c.last_name || "",
            email: c.email || "",
            mobile: c.phone || "",
            address_line1: c.address_line1 || "",
            suburb: c.suburb || "",
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

  // Default bank reference is "{Lot Number} {Last Name}". Keep it in sync with
  // the lot + last name until the client manually edits the field.
  const defaultReference = [lotNumber, form.last_name.trim()]
    .filter(Boolean)
    .join(" ");
  useEffect(() => {
    if (!referenceEdited) setReference(defaultReference);
  }, [defaultReference, referenceEdited]);

  // Copy a value to the clipboard and flash the "Copied!" toast for that field.
  const copyToClipboard = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older/insecure contexts — fall back to a hidden textarea selection.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopiedField(field);
    setTimeout(() => setCopiedField((c) => (c === field ? null : c)), 1800);
  };

  // TKBG deposit account — fixed bank details shown on the "pay now" panel.
  const BANK_DETAILS = [
    { key: "account_name", label: "Account Name", value: "Turnkey Building Group" },
    { key: "bsb", label: "BSB", value: "067873" },
    { key: "account_number", label: "Account Number", value: "19502151" },
  ];

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

  // Remittance / proof-of-payment upload. Shared by the "already paid" branch
  // and the "I've sent the transfer" branch of the deposit step.
  const remittanceUploader = paymentRemittance ? (
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
          state: form.state,
          postcode: form.postcode,
          additionalPurchasers: additionalPurchasersPayload,
          idDocumentPaths,
          paymentRemittancePath,
          password,
          // Optional — the API maps mobile → phone, dedupes by email, and links
          // these onto the project as broker/conveyancer contacts.
          broker: {
            company_name: broker.company_name,
            first_name: broker.first_name,
            last_name: broker.last_name,
            email: broker.email,
            phone: broker.mobile,
          },
          conveyancer: {
            company_name: conveyancer.company_name,
            first_name: conveyancer.first_name,
            last_name: conveyancer.last_name,
            email: conveyancer.email,
            phone: conveyancer.mobile,
          },
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
    <div className="min-h-screen bg-[#f7f5f2] font-body">
      {/* Branded black hero — pure-white wordmark, gold eyebrow, serif welcome.
          Mirrors the login AuthHeader sizing + the branded email template. */}
      <div className="bg-brand-black px-4 pt-12 pb-16 sm:pb-20 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/TURNKEY_WORDMARK_WHITE.svg"
          alt="Turnkey Building Group"
          className="h-8 sm:h-10 md:h-12 w-auto mx-auto mb-8"
        />
        <p className="font-heading text-[10px] uppercase tracking-[0.3em] text-brand-gold font-medium">
          Welcome to Turnkey
        </p>
        <h1 className="font-display text-3xl sm:text-4xl text-white mt-3">
          {form.first_name
            ? `Welcome, ${form.first_name}.`
            : "Let's get you set up."}
        </h1>
        {form.first_name && (
          <p className="font-display text-xl sm:text-2xl text-white/90 mt-1">
            Let&apos;s get you set up.
          </p>
        )}
        <p className="text-sm text-white/60 mt-4 max-w-md mx-auto">
          A few quick details and you&apos;ll be ready to start your building
          journey with us.
        </p>
      </div>

      {/* Gold accent line — matches the login header */}
      <div className="h-[2px] bg-brand-gold" />

      <div className="max-w-2xl mx-auto px-4 pb-12 -mt-8 sm:-mt-10">
        {!isAccess && (
        <div className="text-center mb-6">
          <p className="font-heading text-[10px] uppercase tracking-[0.3em] text-brand-gold font-medium">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>
        )}

        {/* Steps indicator — gold progress bars with uppercase caps labels;
            completed steps get a small gold checkmark. Hidden in access mode
            (existing client only needs to set a password). */}
        {!isAccess && (
        <div className="flex gap-2 mb-8 max-w-md mx-auto">
          {STEPS.map((s, i) => {
            const completed = i < step;
            const active = i === step;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div
                  className={`h-1 w-full rounded-full transition-colors ${
                    i <= step ? "bg-brand-gold" : "bg-neutral-300"
                  }`}
                />
                <span
                  className={`font-heading text-[8.5px] sm:text-[9px] uppercase tracking-[0.12em] leading-tight text-center flex items-center gap-1 ${
                    active
                      ? "text-brand-gold font-bold"
                      : completed
                      ? "text-brand-gold/75 font-medium"
                      : "text-neutral-400"
                  }`}
                >
                  {completed && <Check className="h-2.5 w-2.5 shrink-0" />}
                  {s}
                </span>
              </div>
            );
          })}
        </div>
        )}

        <Card className="border-t-2 border-t-brand-gold shadow-md">
          <CardContent className="p-6">
            {/* Step 1 — Purchaser Details */}
            {step === 0 && (
              <div className="space-y-4">
                <SectionHeader icon={User}>Purchaser Details</SectionHeader>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><FieldLabel required>First Name</FieldLabel><Input value={form.first_name} onChange={(e) => upd("first_name", e.target.value)} /></div>
                  <div><FieldLabel>Middle Name</FieldLabel><Input value={form.middle_name} onChange={(e) => upd("middle_name", e.target.value)} /></div>
                  <div><FieldLabel required>Last Name</FieldLabel><Input value={form.last_name} onChange={(e) => upd("last_name", e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><FieldLabel required>Email</FieldLabel><Input type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} /></div>
                  <div><FieldLabel required>Mobile</FieldLabel><Input value={form.mobile} onChange={(e) => upd("mobile", e.target.value)} /></div>
                </div>

                {additionalPurchasers.length > 0 && (
                  <div className="border-t pt-5 mt-5 space-y-4">
                    <h3 className="font-heading text-[10px] uppercase tracking-[0.18em] font-bold text-neutral-600">
                      Additional Purchasers
                    </h3>
                    {additionalPurchasers.map((p, i) => (
                      <div key={i} className="border rounded-lg p-4 space-y-3 bg-neutral-50 relative">
                        <button
                          className="absolute top-2 right-2 text-neutral-400 hover:text-red-500"
                          onClick={() => removePurchaser(i)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div><FieldLabel>First Name</FieldLabel><Input value={p.first_name} onChange={(e) => updatePurchaser(i, "first_name", e.target.value)} /></div>
                          <div><FieldLabel>Middle Name</FieldLabel><Input value={p.middle_name} onChange={(e) => updatePurchaser(i, "middle_name", e.target.value)} /></div>
                          <div><FieldLabel>Last Name</FieldLabel><Input value={p.last_name} onChange={(e) => updatePurchaser(i, "last_name", e.target.value)} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><FieldLabel>Email</FieldLabel><Input type="email" value={p.email} onChange={(e) => updatePurchaser(i, "email", e.target.value)} /></div>
                          <div><FieldLabel>Mobile</FieldLabel><Input value={p.mobile} onChange={(e) => updatePurchaser(i, "mobile", e.target.value)} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={addPurchaser}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-gold hover:text-brand-gold-dark transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add Additional Purchaser
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — Current Address */}
            {step === 1 && (
              <div className="space-y-4">
                <SectionHeader icon={Home}>Current Address</SectionHeader>
                <div><FieldLabel required>Street Address</FieldLabel><Input value={form.address_line1} onChange={(e) => upd("address_line1", e.target.value)} /></div>
                <div><FieldLabel required>Suburb</FieldLabel><Input value={form.suburb} onChange={(e) => upd("suburb", e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><FieldLabel required>State</FieldLabel>
                    <Select value={form.state} onValueChange={(v) => upd("state", v)}>
                      <SelectTrigger className="border-neutral-200"><SelectValue placeholder="State" /></SelectTrigger>
                      <SelectContent>
                        {["VIC","NSW","QLD","WA","SA","TAS","NT","ACT"].map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><FieldLabel required>Postcode</FieldLabel><Input value={form.postcode} onChange={(e) => upd("postcode", e.target.value)} /></div>
                </div>
              </div>
            )}

            {/* Step 3 — Supporting Documents */}
            {step === 2 && (
              <div className="space-y-6">
                <SectionHeader icon={FileText}>Supporting Documents</SectionHeader>

                {/* Deposit — client either already paid (upload proof) or
                    needs to pay now (reveal TKBG bank details + reference). */}
                <div>
                  <FieldLabel>Initial Deposit</FieldLabel>
                  <p className="text-xs text-neutral-400 mb-3">
                    Have you already paid your deposit, or do you need to pay it now?
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDepositChoice("paid")}
                      className={`flex items-center gap-2.5 rounded-lg border p-3.5 text-left transition-colors ${
                        depositChoice === "paid"
                          ? "border-brand-gold bg-brand-gold-light ring-1 ring-brand-gold"
                          : "border-neutral-200 hover:border-brand-gold/50"
                      }`}
                    >
                      <Check className={`h-4 w-4 shrink-0 ${depositChoice === "paid" ? "text-brand-gold" : "text-neutral-400"}`} />
                      <span className="text-sm font-medium text-neutral-800">I&apos;ve already paid</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDepositChoice("pay_now")}
                      className={`flex items-center gap-2.5 rounded-lg border p-3.5 text-left transition-colors ${
                        depositChoice === "pay_now"
                          ? "border-brand-gold bg-brand-gold-light ring-1 ring-brand-gold"
                          : "border-neutral-200 hover:border-brand-gold/50"
                      }`}
                    >
                      <CreditCard className={`h-4 w-4 shrink-0 ${depositChoice === "pay_now" ? "text-brand-gold" : "text-neutral-400"}`} />
                      <span className="text-sm font-medium text-neutral-800">I need to pay now</span>
                    </button>
                  </div>

                  {/* Already paid → upload remittance straight away */}
                  {depositChoice === "paid" && (
                    <div className="mt-4">
                      <FieldLabel>Payment Remittance / Deposit Receipt</FieldLabel>
                      <p className="text-xs text-neutral-400 mb-2">Upload proof of your deposit payment</p>
                      {remittanceUploader}
                    </div>
                  )}

                  {/* Pay now → TKBG bank details with tap-to-copy + reference */}
                  {depositChoice === "pay_now" && (
                    <div className="mt-4 rounded-lg border border-brand-gold/30 bg-brand-gold-light p-4 sm:p-5">
                      <div className="flex items-center gap-2.5 mb-4">
                        <Landmark className="h-4 w-4 text-brand-gold shrink-0" />
                        <h3 className="font-heading text-[11px] uppercase tracking-[0.18em] font-bold text-black">
                          Pay Deposit Now
                        </h3>
                      </div>

                      <div className="space-y-2.5">
                        {BANK_DETAILS.map((row) => (
                          <div
                            key={row.key}
                            className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-heading text-[9px] uppercase tracking-[0.16em] text-neutral-500">
                                {row.label}
                              </p>
                              <p className="text-sm font-medium text-black tabular-nums truncate">{row.value}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(row.key, row.value)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-brand-gold/40 px-2.5 py-1.5 text-[11px] font-medium text-brand-gold hover:bg-brand-gold hover:text-white transition-colors shrink-0"
                            >
                              {copiedField === row.key ? (
                                <><Check className="h-3.5 w-3.5" /> Copied!</>
                              ) : (
                                <><Copy className="h-3.5 w-3.5" /> Copy</>
                              )}
                            </button>
                          </div>
                        ))}

                        {/* Reference — auto-filled "{Lot} {Last Name}", editable */}
                        <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-heading text-[9px] uppercase tracking-[0.16em] text-neutral-500">
                              Reference
                            </p>
                            <input
                              value={reference}
                              onChange={(e) => { setReference(e.target.value); setReferenceEdited(true); }}
                              placeholder="e.g. Lot 58 Smith"
                              className="w-full bg-transparent text-sm font-medium text-black outline-none placeholder:text-neutral-300"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard("reference", reference)}
                            disabled={!reference.trim()}
                            className="inline-flex items-center gap-1.5 rounded-md border border-brand-gold/40 px-2.5 py-1.5 text-[11px] font-medium text-brand-gold hover:bg-brand-gold hover:text-white transition-colors shrink-0 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-brand-gold"
                          >
                            {copiedField === "reference" ? (
                              <><Check className="h-3.5 w-3.5" /> Copied!</>
                            ) : (
                              <><Copy className="h-3.5 w-3.5" /> Copy</>
                            )}
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
                        Please use the reference exactly as shown so we can match your payment.
                      </p>

                      {/* Sent the transfer → expand remittance upload */}
                      {!transferSent ? (
                        <button
                          type="button"
                          onClick={() => setTransferSent(true)}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-gold hover:bg-brand-gold-dark text-white text-xs font-medium uppercase tracking-widest px-4 py-2.5 transition-colors"
                        >
                          <Check className="h-4 w-4" />
                          I&apos;ve sent the transfer
                        </button>
                      ) : (
                        <div className="mt-4">
                          <FieldLabel>Upload your remittance</FieldLabel>
                          <p className="text-xs text-neutral-400 mb-2">
                            Attach the transfer confirmation from your bank (optional, but helps us match it faster).
                          </p>
                          {remittanceUploader}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ID Documents — one upload per purchaser so each person on
                    the contract attaches their own driver's licence / passport. */}
                <div>
                  <FieldLabel>ID Documents</FieldLabel>
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

            {/* Step 4 — Broker & Conveyancer (optional) */}
            {step === 3 && (
              <div className="space-y-7">
                <div>
                  <SectionHeader icon={Landmark}>Broker &amp; Conveyancer</SectionHeader>
                  <p className="text-sm text-neutral-500 -mt-2">
                    Optional. If you already have a mortgage broker or a
                    conveyancer/solicitor, add their details and we&apos;ll connect
                    them to your project — so our team can liaise with them directly
                    and you won&apos;t be asked for this again. You can leave this
                    blank and add them later.
                  </p>
                </div>

                {/* Mortgage broker */}
                <div className="space-y-4">
                  <h3 className="font-heading text-[10px] uppercase tracking-[0.18em] font-bold text-neutral-600">
                    Mortgage Broker
                  </h3>
                  <div><FieldLabel>Company</FieldLabel><Input value={broker.company_name} onChange={(e) => updBroker("company_name", e.target.value)} placeholder="e.g. Aussie Home Loans" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><FieldLabel>First Name</FieldLabel><Input value={broker.first_name} onChange={(e) => updBroker("first_name", e.target.value)} /></div>
                    <div><FieldLabel>Last Name</FieldLabel><Input value={broker.last_name} onChange={(e) => updBroker("last_name", e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><FieldLabel>Email</FieldLabel><Input type="email" value={broker.email} onChange={(e) => updBroker("email", e.target.value)} /></div>
                    <div><FieldLabel>Mobile</FieldLabel><Input value={broker.mobile} onChange={(e) => updBroker("mobile", e.target.value)} /></div>
                  </div>
                </div>

                {/* Conveyancer / solicitor */}
                <div className="space-y-4 border-t pt-6">
                  <h3 className="font-heading text-[10px] uppercase tracking-[0.18em] font-bold text-neutral-600">
                    Conveyancer / Solicitor
                  </h3>
                  <div><FieldLabel>Company</FieldLabel><Input value={conveyancer.company_name} onChange={(e) => updConveyancer("company_name", e.target.value)} placeholder="e.g. Smith Conveyancing" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><FieldLabel>First Name</FieldLabel><Input value={conveyancer.first_name} onChange={(e) => updConveyancer("first_name", e.target.value)} /></div>
                    <div><FieldLabel>Last Name</FieldLabel><Input value={conveyancer.last_name} onChange={(e) => updConveyancer("last_name", e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><FieldLabel>Email</FieldLabel><Input type="email" value={conveyancer.email} onChange={(e) => updConveyancer("email", e.target.value)} /></div>
                    <div><FieldLabel>Mobile</FieldLabel><Input value={conveyancer.mobile} onChange={(e) => updConveyancer("mobile", e.target.value)} /></div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5 — Set Password */}
            {step === 4 && (
              <div className="space-y-4">
                <SectionHeader icon={Lock}>
                  {isAccess ? "Set Up Your Portal Access" : "Set Your Password"}
                </SectionHeader>
                {isAccess && (
                  <p className="text-sm text-neutral-600">
                    Welcome{form.first_name ? `, ${form.first_name}` : ""}! Your details are
                    already on file — there&apos;s nothing to fill out. Just choose a password to
                    access your Turnkey client portal.
                  </p>
                )}
                <p className="text-sm text-neutral-500">
                  Create a password to sign in to your Turnkey client portal. You&apos;ll use this together with your email ({form.email}) whenever you log in.
                </p>
                <div>
                  <FieldLabel required>Password</FieldLabel>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <FieldLabel required>Confirm Password</FieldLabel>
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
              {step > 0 && !isAccess ? (
                <Button
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                  className="uppercase text-xs tracking-widest"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" /> Previous
                </Button>
              ) : <div />}

              {step < STEPS.length - 1 ? (
                <Button
                  className="bg-brand-gold hover:bg-brand-gold-dark text-white uppercase text-xs tracking-widest"
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
                  className="bg-brand-gold hover:bg-brand-gold-dark text-white uppercase text-xs tracking-widest"
                  onClick={handleSubmit}
                  disabled={submitting || password.length < 8 || password !== confirmPassword}
                >
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Check className="h-4 w-4 mr-2" />
                  {isAccess ? "Set Up Access" : "Complete Registration"}
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
