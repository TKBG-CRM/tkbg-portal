"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatAmount } from "@/lib/numbers";
import {
  yearsToReadyAgain,
  readyDateLabel,
  DEFAULT_GROWTH_RATE,
  type ProjectionProperty,
} from "@/lib/portfolio-projections";
import { DEFAULT_LVR } from "@/lib/portfolio";

// Live buy-again projection with an adjustable capital-growth assumption.
export default function PortfolioProjection({
  properties,
  usableEquityNow,
  audience = "staff",
}: {
  properties: ProjectionProperty[];
  usableEquityNow: number;
  /** "client" softens the copy for the portal. */
  audience?: "staff" | "client";
}) {
  const [growth, setGrowth] = useState(DEFAULT_GROWTH_RATE);
  const years = yearsToReadyAgain({ properties, growthRate: growth });
  const label = readyDateLabel(years, new Date());

  const headline =
    years === 0
      ? audience === "client"
        ? "You may have enough equity to invest again now"
        : "Ready to buy again now"
      : label
        ? audience === "client"
          ? `On track to invest again around ${label}`
          : `Projected ready to buy again: ${label}`
        : "Not projected to reach the threshold within 30 years";

  return (
    <Card className="border-brand-gold/40 bg-brand-gold/5">
      <CardContent className="p-5">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-brand-black">{headline}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Usable equity today: {formatAmount(Math.round(usableEquityNow)) || "$0"} · assumes{" "}
              {Math.round(DEFAULT_LVR * 100)}% lending and debt held constant.
            </div>

            <div className="mt-3 max-w-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Assumed growth
                </span>
                <span className="text-sm font-semibold tabular-nums text-brand-black">
                  {(growth * 100).toFixed(1)}% p.a.
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.12}
                step={0.005}
                value={growth}
                onChange={(e) => setGrowth(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-brand-gold"
                aria-label="Assumed annual capital growth"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
