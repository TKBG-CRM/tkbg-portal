"use client";

import { useState } from "react";
import { SlidersHorizontal, ArrowRight, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/numbers";
import { applyScenario, type ScenarioBase } from "@/lib/portfolio-projections";

const AUD = (n: number) => (formatAmount(Math.round(n)) || "$0");

const EMPTY = { ratePctChange: 0, extraMonthlyRepayment: 0, weeklyRentChange: 0 };

export default function PortfolioScenario({
  base,
  currentAnnualCashFlow,
}: {
  base: ScenarioBase;
  currentValue: number;
  currentAnnualCashFlow: number;
}) {
  const [inputs, setInputs] = useState({ ...EMPTY });
  const result = applyScenario(base, inputs);
  const touched =
    inputs.ratePctChange !== 0 ||
    inputs.extraMonthlyRepayment !== 0 ||
    inputs.weeklyRentChange !== 0;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-brand-gold" />
            <h2 className="font-heading text-base font-semibold text-brand-black">
              What if…
            </h2>
          </div>
          {touched && (
            <Button variant="ghost" size="sm" onClick={() => setInputs({ ...EMPTY })}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <ScenarioSlider
            label="Interest rate change"
            value={inputs.ratePctChange}
            min={-2}
            max={4}
            step={0.25}
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}
            onChange={(v) => setInputs((s) => ({ ...s, ratePctChange: v }))}
          />
          <ScenarioSlider
            label="Extra repayment /mo"
            value={inputs.extraMonthlyRepayment}
            min={0}
            max={2000}
            step={50}
            format={(v) => AUD(v)}
            onChange={(v) => setInputs((s) => ({ ...s, extraMonthlyRepayment: v }))}
          />
          <ScenarioSlider
            label="Rent change /wk"
            value={inputs.weeklyRentChange}
            min={-200}
            max={300}
            step={10}
            format={(v) => `${v > 0 ? "+" : ""}${AUD(v)}`}
            onChange={(v) => setInputs((s) => ({ ...s, weeklyRentChange: v }))}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-neutral-50 px-4 py-3">
          <Outcome label="Cash flow /yr" from={currentAnnualCashFlow} to={result.annualCashFlow} />
          <Outcome label="Cash flow /wk" from={currentAnnualCashFlow / 52} to={result.weeklyCashFlow} />
          {inputs.ratePctChange !== 0 && (
            <div className="text-xs text-muted-foreground">
              Rate change adds {AUD(result.annualRateImpact)}/yr in interest
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Estimate only. Rate impact approximated as balance × rate change; extra repayments also
          build equity faster over time (not shown here).
        </p>
      </CardContent>
    </Card>
  );
}

function ScenarioSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums text-brand-black">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-brand-gold"
      />
    </div>
  );
}

function Outcome({ label, from, to }: { label: string; from: number; to: number }) {
  const toColor = to >= 0 ? "text-green-700" : "text-red-600";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
        <span className="text-neutral-500">{AUD(from)}</span>
        <ArrowRight className="h-3.5 w-3.5 text-neutral-400" />
        <span className={toColor}>{AUD(to)}</span>
      </div>
    </div>
  );
}
