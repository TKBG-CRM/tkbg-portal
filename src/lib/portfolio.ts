/**
 * Property portfolio equity maths.
 * -----------------------------------------------------------------------------
 * Pure, side-effect-free helpers used by both the client portal Portfolio page
 * and the internal TKBG "ready to buy again" view. No commission concepts live
 * here — this is purely value / debt / equity, safe to surface to clients.
 *
 * Definitions used throughout:
 *   equity         = current valuation − total current loan balances
 *   usable equity  = what a bank will typically release at a target LVR, i.e.
 *                    max(0, valuation × LVR − loan balance). Default LVR 80%
 *                    (the common no-LMI ceiling in AU lending).
 *   ready to buy   = usable equity across the portfolio clears the deposit
 *                    threshold needed to fund the next purchase.
 *   gross yield    = annual rent / current value × 100
 *   net yield      = annual cash flow / current value × 100
 *   capital growth = current value − purchase price ($ and %)
 */

/** Default loan-to-value ratio banks lend to without LMI. */
export const DEFAULT_LVR = 0.8;

/**
 * Default usable-equity threshold (AUD) at which a client is flagged as
 * "ready to buy again" — a deposit + costs buffer for a typical next purchase.
 */
export const DEFAULT_READY_TO_BUY_THRESHOLD = 100_000;

// ---------------------------------------------------------------------------
// Frequency annualisation
// ---------------------------------------------------------------------------

export type Frequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual";

const ANNUAL_MULTIPLIER: Record<Frequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

/** Convert an amount at a given frequency to its annual equivalent. */
export function annualise(amount: number | null, frequency: Frequency): number {
  return num(amount) * (ANNUAL_MULTIPLIER[frequency] ?? 1);
}

/** Convert an annual amount down to weekly. */
export function toWeekly(annual: number): number {
  return annual / 52;
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** A loan secured against a property (only the fields the maths needs). */
export interface PortfolioLoan {
  current_balance: number | null;
  monthly_repayment?: number | null;
  interest_rate_pct?: number | null;
}

/** A cashflow line item on a property. */
export interface PortfolioCashflowItem {
  amount: number;
  frequency: Frequency;
  is_income: boolean;
}

/** A property with its loans (only the fields the maths needs). */
export interface PortfolioProperty {
  current_valuation: number | null;
  purchase_price?: number | null;
  weekly_rent?: number | null;
  status?: string | null;
  loans?: PortfolioLoan[] | null;
  cashflow_items?: PortfolioCashflowItem[] | null;
}

/** Sum the current balances across a property's loans (nulls treated as 0). */
export function totalLoanBalance(loans?: PortfolioLoan[] | null): number {
  if (!loans || loans.length === 0) return 0;
  return loans.reduce((sum, loan) => sum + num(loan.current_balance), 0);
}

/**
 * Equity in a single property: valuation − total loan balance.
 * Can legitimately go negative (underwater), so it is NOT floored.
 */
export function propertyEquity(
  valuation: number | null,
  loanBalance: number
): number {
  return num(valuation) - num(loanBalance);
}

/**
 * Usable equity a bank would typically release: valuation × LVR − loan balance,
 * floored at 0 (you can't draw negative equity).
 */
export function usableEquity(
  valuation: number | null,
  loanBalance: number,
  lvr: number = DEFAULT_LVR
): number {
  const usable = num(valuation) * lvr - num(loanBalance);
  return usable > 0 ? usable : 0;
}

// ---------------------------------------------------------------------------
// Per-property yield & cash flow
// ---------------------------------------------------------------------------

/** Annual interest cost across loans: sum of balance × rate. */
export function annualInterest(loans?: PortfolioLoan[] | null): number {
  if (!loans || loans.length === 0) return 0;
  return loans.reduce(
    (sum, l) => sum + num(l.current_balance) * (num(l.interest_rate_pct) / 100),
    0
  );
}

/**
 * Balance-weighted average interest rate (%) across loans that carry a rate.
 * Loans with no rate recorded are excluded so they don't drag the average to 0.
 */
export function weightedAverageRate(loans: PortfolioLoan[]): number {
  const withRate = loans.filter(
    (l) => l.interest_rate_pct != null && num(l.current_balance) > 0
  );
  const totalBalance = withRate.reduce((s, l) => s + num(l.current_balance), 0);
  if (totalBalance <= 0) return 0;
  return (
    withRate.reduce((s, l) => s + num(l.current_balance) * num(l.interest_rate_pct), 0) /
    totalBalance
  );
}

/** Annual mortgage repayments across all loans on a property. */
export function annualMortgageRepayments(loans?: PortfolioLoan[] | null): number {
  if (!loans || loans.length === 0) return 0;
  return loans.reduce(
    (sum, l) => sum + annualise(l.monthly_repayment ?? null, "monthly"),
    0
  );
}

/** Annual income from cashflow_items (rent, etc.). */
export function annualIncome(items?: PortfolioCashflowItem[] | null): number {
  if (!items) return 0;
  return items
    .filter((i) => i.is_income)
    .reduce((sum, i) => sum + annualise(i.amount, i.frequency), 0);
}

/** Annual expenses from cashflow_items (rates, insurance, etc.). */
export function annualExpenses(items?: PortfolioCashflowItem[] | null): number {
  if (!items) return 0;
  return items
    .filter((i) => !i.is_income)
    .reduce((sum, i) => sum + annualise(i.amount, i.frequency), 0);
}

/**
 * Annual net cash flow for a property:
 *   income − expenses − mortgage repayments
 * Falls back to weekly_rent × 52 if no cashflow_items exist.
 */
export function annualCashFlow(property: PortfolioProperty): number {
  const items = property.cashflow_items;
  const income =
    items && items.length > 0
      ? annualIncome(items)
      : num(property.weekly_rent) * 52;
  const expenses = annualExpenses(items);
  const mortgage = annualMortgageRepayments(property.loans);
  return income - expenses - mortgage;
}

/** Gross yield: annual rent ÷ current value × 100 (%). */
export function grossYield(property: PortfolioProperty): number {
  const value = num(property.current_valuation);
  if (value <= 0) return 0;
  const items = property.cashflow_items;
  const rent =
    items && items.length > 0
      ? annualIncome(items)
      : num(property.weekly_rent) * 52;
  return (rent / value) * 100;
}

/** Net yield: annual cash flow ÷ current value × 100 (%). */
export function netYield(property: PortfolioProperty): number {
  const value = num(property.current_valuation);
  if (value <= 0) return 0;
  return (annualCashFlow(property) / value) * 100;
}

/** Capital growth since purchase: { dollars, percent }. */
export function capitalGrowth(property: PortfolioProperty): {
  dollars: number;
  percent: number;
} {
  const purchase = num(property.purchase_price);
  const current = num(property.current_valuation);
  const dollars = current - purchase;
  const percent = purchase > 0 ? (dollars / purchase) * 100 : 0;
  return { dollars, percent };
}

// ---------------------------------------------------------------------------
// Portfolio roll-up
// ---------------------------------------------------------------------------

/** Aggregated totals across a client's whole portfolio. */
export interface PortfolioSummary {
  /** Number of properties counted (sold properties excluded). */
  count: number;
  /** Sum of current valuations. */
  totalValue: number;
  /** Sum of current loan balances. */
  totalDebt: number;
  /** totalValue − totalDebt (can be negative). */
  totalEquity: number;
  /** Sum of per-property usable equity at the given LVR. */
  totalUsableEquity: number;
  /** Blended loan-to-value across the portfolio (0 when no value). */
  lvr: number;
  /** Sum of per-property annual cash flow. */
  totalAnnualCashFlow: number;
  /** totalAnnualCashFlow ÷ 52. */
  totalWeeklyCashFlow: number;
  /** Weighted gross yield across the portfolio (%). */
  weightedGrossYield: number;
  /** Weighted net yield across the portfolio (%). */
  weightedNetYield: number;
}

/**
 * Roll a list of properties up into portfolio totals. Sold properties are
 * excluded — they no longer contribute value, debt or borrowing power.
 *
 * Usable equity is summed PER property (each property floored at 0
 * individually) rather than computed on the blended totals, which matches how
 * a bank assesses releasable equity property-by-property.
 */
export function portfolioSummary(
  properties: PortfolioProperty[],
  lvr: number = DEFAULT_LVR
): PortfolioSummary {
  const active = properties.filter((p) => p.status !== "sold");

  let totalValue = 0;
  let totalDebt = 0;
  let totalUsableEquity = 0;
  let totalAnnualCashFlow = 0;
  let totalAnnualRent = 0;

  for (const property of active) {
    const balance = totalLoanBalance(property.loans);
    const val = num(property.current_valuation);
    totalValue += val;
    totalDebt += balance;
    totalUsableEquity += usableEquity(property.current_valuation, balance, lvr);
    totalAnnualCashFlow += annualCashFlow(property);
    const items = property.cashflow_items;
    totalAnnualRent +=
      items && items.length > 0
        ? annualIncome(items)
        : num(property.weekly_rent) * 52;
  }

  return {
    count: active.length,
    totalValue,
    totalDebt,
    totalEquity: totalValue - totalDebt,
    totalUsableEquity,
    lvr: totalValue > 0 ? totalDebt / totalValue : 0,
    totalAnnualCashFlow,
    totalWeeklyCashFlow: totalAnnualCashFlow / 52,
    weightedGrossYield: totalValue > 0 ? (totalAnnualRent / totalValue) * 100 : 0,
    weightedNetYield: totalValue > 0 ? (totalAnnualCashFlow / totalValue) * 100 : 0,
  };
}

/**
 * Whether a client's usable equity clears the deposit threshold for the next
 * purchase. Uses >= so a client sitting exactly on the threshold qualifies.
 */
export function readyToBuyAgain(
  totalUsableEquity: number,
  threshold: number = DEFAULT_READY_TO_BUY_THRESHOLD
): boolean {
  return totalUsableEquity >= threshold;
}

/** Coerce a nullable/NaN numeric to a finite number (0 fallback). */
function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
