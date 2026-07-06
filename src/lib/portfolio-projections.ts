/**
 * Portfolio projections + scenario modelling. Pure, side-effect-free — builds on
 * the equity maths in ./portfolio. No commission concepts. Assumptions are
 * deliberately conservative and clearly labelled so the numbers are defensible.
 */
import {
  DEFAULT_LVR,
  DEFAULT_READY_TO_BUY_THRESHOLD,
  usableEquity,
} from "@/lib/portfolio";

/** Default assumed annual capital growth for forward projections. */
export const DEFAULT_GROWTH_RATE = 0.05; // 5% p.a.

export interface ProjectionProperty {
  current_valuation: number | null;
  loanBalance: number;
}

/**
 * Years until a portfolio's total usable equity clears the "ready to buy again"
 * threshold, projecting each property's value forward at `growthRate` p.a.
 *
 * Assumptions: debt is held constant (conservative — P&I loans would pay down
 * and cross sooner); usable equity is summed per property, floored at 0, at the
 * given LVR. Returns 0 if already ready, or null if it doesn't clear within
 * `maxYears`.
 */
export function yearsToReadyAgain(opts: {
  properties: ProjectionProperty[];
  growthRate?: number;
  lvr?: number;
  threshold?: number;
  maxYears?: number;
}): number | null {
  const {
    properties,
    growthRate = DEFAULT_GROWTH_RATE,
    lvr = DEFAULT_LVR,
    threshold = DEFAULT_READY_TO_BUY_THRESHOLD,
    maxYears = 30,
  } = opts;

  for (let year = 0; year <= maxYears; year++) {
    const factor = Math.pow(1 + growthRate, year);
    const usable = properties.reduce(
      (sum, p) => sum + usableEquity((p.current_valuation ?? 0) * factor, p.loanBalance, lvr),
      0
    );
    if (usable >= threshold) return year;
  }
  return null;
}

/**
 * Turn a whole-year offset into an approximate calendar label (e.g. "Q3 2027").
 * `from` is the reference date; pass it in (callers stamp "now") so this stays pure.
 */
export function readyDateLabel(years: number | null, from: Date): string | null {
  if (years === null) return null;
  if (years === 0) return "Now";
  const target = new Date(from.getTime());
  target.setFullYear(target.getFullYear() + years);
  const q = Math.floor(target.getMonth() / 3) + 1;
  return `Q${q} ${target.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Scenario modelling
// ---------------------------------------------------------------------------

export interface ScenarioInputs {
  /** Change in interest rate, in percentage points (e.g. +1 for +1.0%). */
  ratePctChange: number;
  /** Extra principal repayment, dollars per month. */
  extraMonthlyRepayment: number;
  /** Rent change, dollars per week (can be negative). */
  weeklyRentChange: number;
}

export interface ScenarioBase {
  annualIncome: number;
  annualExpenses: number;
  annualRepayments: number;
  totalLoanBalance: number;
}

export interface ScenarioResult {
  annualCashFlow: number;
  weeklyCashFlow: number;
  /** Extra annual interest cost from the rate change (informational). */
  annualRateImpact: number;
}

/**
 * Recompute annual cash flow under a scenario.
 *
 * Rate change: we don't store each loan's rate, so we approximate the extra
 * interest as balance × Δrate (i.e. the rate change flows straight to interest
 * cost). Extra repayments are cash out. Rent change adjusts income. This is an
 * estimate for "what-if" comparison, not a precise amortisation.
 */
export function applyScenario(base: ScenarioBase, s: ScenarioInputs): ScenarioResult {
  const annualRateImpact = base.totalLoanBalance * (s.ratePctChange / 100);
  const income = base.annualIncome + s.weeklyRentChange * 52;
  const outgoings =
    base.annualExpenses + base.annualRepayments + annualRateImpact + s.extraMonthlyRepayment * 12;
  const annualCashFlow = income - outgoings;
  return {
    annualCashFlow,
    weeklyCashFlow: annualCashFlow / 52,
    annualRateImpact,
  };
}
