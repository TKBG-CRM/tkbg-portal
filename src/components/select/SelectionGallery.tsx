"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export interface GalleryOption {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_delta: number | null;
}

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

/**
 * Mobile first selection gallery: tap a card to select, tap the image to
 * enlarge, sticky confirm bar shows the current picks. One idempotent confirm
 * writes everything back through /api/select/confirm.
 */
export default function SelectionGallery({
  token,
  firstName,
  address,
  customMessage,
  repName,
  facades,
  externalColours,
  internalColours,
}: {
  token: string;
  firstName: string;
  address: string | null;
  customMessage: string | null;
  repName: string;
  facades: GalleryOption[];
  externalColours: GalleryOption[];
  internalColours: GalleryOption[];
}) {
  const [facadeId, setFacadeId] = useState<string | null>(null);
  const [externalId, setExternalId] = useState<string | null>(null);
  const [internalId, setInternalId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<GalleryOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const needFacade = facades.length > 0;
  const needExternal = externalColours.length > 0;
  const needInternal = internalColours.length > 0;

  const ready =
    (!needFacade || !!facadeId) &&
    (!needExternal || !!externalId) &&
    (!needInternal || !!internalId);

  const picks = [
    facadeId ? facades.find((f) => f.id === facadeId)?.name : null,
    externalId ? externalColours.find((c) => c.id === externalId)?.name : null,
    internalId ? internalColours.find((c) => c.id === internalId)?.name : null,
  ].filter(Boolean) as string[];

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/select/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          facade_id: facadeId,
          external_id: externalId,
          internal_id: internalId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save your selection");
      setDone(picks.join(", "));
    } catch (e: any) {
      setError(e?.message || "Could not save your selection. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-50">
            <Check className="size-7 text-green-600" />
          </div>
          <h1 className="mt-5 font-heading text-2xl font-bold text-black">
            Selection confirmed
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            You chose <span className="font-medium text-black">{done}</span>.{" "}
            {repName} will be in touch with the next steps.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-gold">
          {address ?? "Your new home"}
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-black sm:text-3xl">
          Hi {firstName}, choose your{" "}
          {needFacade ? "facade" : "colours"}
          {needFacade && (needExternal || needInternal) ? " and colours" : ""}
        </h1>
        {customMessage && (
          <div className="mt-4 whitespace-pre-wrap rounded-lg border border-brand-gold/30 bg-brand-gold-light p-4 text-sm leading-relaxed text-neutral-800">
            {customMessage}
          </div>
        )}
        <p className="mt-3 text-sm text-neutral-500">
          Tap an image to enlarge it. Your choice is confirmed at the bottom of the page.
        </p>

        {needFacade && (
          <Section
            label="Facade"
            options={facades}
            selectedId={facadeId}
            onSelect={setFacadeId}
            onZoom={setLightbox}
          />
        )}
        {needExternal && (
          <Section
            label="External colour scheme"
            options={externalColours}
            selectedId={externalId}
            onSelect={setExternalId}
            onZoom={setLightbox}
          />
        )}
        {needInternal && (
          <Section
            label="Internal colour scheme"
            options={internalColours}
            selectedId={internalId}
            onSelect={setInternalId}
            onZoom={setLightbox}
          />
        )}
      </main>

      {/* Sticky confirm bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 text-sm">
            {picks.length ? (
              <span className="block truncate text-neutral-700">{picks.join(" · ")}</span>
            ) : (
              <span className="text-neutral-400">Nothing chosen yet</span>
            )}
            {error && <span className="block truncate text-xs text-red-600">{error}</span>}
          </div>
          <Button
            onClick={confirm}
            disabled={!ready || submitting}
            className="shrink-0 bg-brand-gold text-white hover:bg-brand-gold-dark"
          >
            {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Confirm selection
          </Button>
        </div>
      </div>

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{lightbox?.name ?? "Image"}</DialogTitle>
          {lightbox?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lightbox.image_url}
              alt={lightbox.name}
              className="w-full rounded-lg"
            />
          )}
          <div className="rounded-b-lg bg-white/95 px-4 py-2 text-center text-sm font-medium text-black">
            {lightbox?.name}
            {lightbox?.description ? (
              <span className="block text-xs font-normal text-neutral-500">
                {lightbox.description}
              </span>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <header className="bg-black py-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/TURNKEY_WORDMARK_WHITE.svg" alt="Turnkey" className="mx-auto h-8" />
      </header>
      <div className="h-[2px] bg-brand-gold" />
      {children}
    </div>
  );
}

function Section({
  label,
  options,
  selectedId,
  onSelect,
  onZoom,
}: {
  label: string;
  options: GalleryOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onZoom: (o: GalleryOption) => void;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-medium uppercase tracking-wider text-brand-gold">{label}</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {options.map((o) => {
          const on = selectedId === o.id;
          return (
            <div
              key={o.id}
              className={cn(
                "overflow-hidden rounded-xl border bg-white transition-shadow",
                on ? "border-brand-gold ring-2 ring-brand-gold" : "border-neutral-200"
              )}
            >
              {o.image_url ? (
                <button
                  type="button"
                  onClick={() => onZoom(o)}
                  className="block w-full"
                  aria-label={`Enlarge ${o.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={o.image_url}
                    alt={o.name}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-neutral-100 text-xs text-neutral-400">
                  {o.name}
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelect(o.id)}
                className="flex w-full items-center justify-between gap-2 p-3 text-left"
                aria-pressed={on}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-black">
                    {o.name}
                    {o.price_delta != null && o.price_delta !== 0 && (
                      <span className="ml-1 text-xs font-normal text-brand-gold">
                        +{AUD.format(o.price_delta)}
                      </span>
                    )}
                  </span>
                  {o.description && (
                    <span className="block truncate text-xs text-neutral-500">
                      {o.description}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border",
                    on
                      ? "border-brand-gold bg-brand-gold text-white"
                      : "border-neutral-300 bg-white"
                  )}
                >
                  {on && <Check className="size-4" />}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
