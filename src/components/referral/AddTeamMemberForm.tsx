"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";

/**
 * Self-serve "add a team member" form on the referral dashboard — shown only
 * to partners with a business email domain (the server re-checks everything).
 * On success the new member is emailed a branded sign-in link via the existing
 * send-link flow, and the dashboard refreshes so they appear in the team list.
 */
export default function AddTeamMemberForm({
  ownerDomain,
}: {
  ownerDomain: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/referral/team/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Could not add the team member.");
        return;
      }
      // Email them a branded sign-in link right away. Best-effort — they can
      // always request one themselves from the login page.
      void fetch("/api/portal/referral/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: json.email }),
      }).catch(() => undefined);

      setDone(
        `${json.name} has been added — we've emailed them a sign-in link. They'll only ever see their own referrals.`
      );
      setName("");
      setEmail("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {done && (
        <p className="mb-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          {done}
        </p>
      )}
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setDone(null);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-gold hover:underline"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add a team member
        </button>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
          <p className="text-xs text-neutral-500">
            Add someone from your business — they need a{" "}
            <span className="font-medium text-neutral-700">@{ownerDomain}</span>{" "}
            email. They&apos;ll get their own sign-in and see only the
            referrals they&apos;ve made; you&apos;ll see everyone&apos;s here.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm focus:border-brand-gold focus:outline-none"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm focus:border-brand-gold focus:outline-none"
              placeholder={`name@${ownerDomain}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !name.trim() || !email.trim()}
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-[#7a6550] disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Add team member
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="text-xs text-neutral-500 hover:text-black"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
