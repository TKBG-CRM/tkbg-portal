"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";

/**
 * Owner-only remove control on a team member's row. Two-step (click → confirm)
 * so a stray tap can't drop someone. The server decides delete vs detach:
 * members with referral/commission history are detached (access revoked,
 * history kept); clean records are deleted outright.
 */
export default function RemoveTeamMemberButton({
  memberId,
  memberLabel,
}: {
  memberId: string;
  memberLabel: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/referral/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Could not remove them — please try again.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <span className="text-[11px] text-red-600">{error}</span>;
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-[11px] text-neutral-500">
          Remove {memberLabel}?
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Yes, remove
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="text-[11px] text-neutral-500 hover:text-black"
        >
          Keep
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title={`Remove ${memberLabel} from your team`}
      className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-red-600 transition-colors"
    >
      <X className="h-3 w-3" />
      Remove
    </button>
  );
}
