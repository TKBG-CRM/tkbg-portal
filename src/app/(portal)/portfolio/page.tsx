"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet,
  Landmark,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  DollarSign,
  Percent,
  Building2,
  Home,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeading } from "@/components/PortalHeading";
import { formatAmount } from "@/lib/numbers";
import {
  portfolioSummary,
  capitalGrowth,
  annualCashFlow,
  grossYield,
  totalLoanBalance,
  annualIncome,
  annualExpenses,
  annualMortgageRepayments,
  DEFAULT_LVR,
  type PortfolioProperty,
} from "@/lib/portfolio";
import PortfolioProjection from "@/components/portfolio/PortfolioProjection";
import PortfolioScenario from "@/components/portfolio/PortfolioScenario";

const AUD = (n: number) => formatAmount(Math.round(n)) || "$0";

const STATUS_LABELS: Record<string, string> = {
  owned: "Owned",
  under_construction: "Under Construction",
  sold: "Sold",
};

interface Row {
  id: string;
  name: string | null;
  address_line1: string | null;
  suburb: string | null;
  property_type: string;
  status: string | null;
  current_valuation: number | null;
  purchase_price: number | null;
  weekly_rent: number | null;
  loans: { current_balance: number | null; monthly_repayment: number | null; interest_rate_pct: number | null }[] | null;
  cashflow_items: { amount: number; frequency: string; is_income: boolean }[] | null;
}

export default function PortalPortfolioPage() {
  const supabase = createClient();
  const [contactId, setContactId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("linked_user_id", user.id)
        .single();
      if (contact) setContactId(contact.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: properties = [], isLoading } = useQuery<Row[]>({
    queryKey: ["portal-portfolio", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select(
          "id, name, address_line1, suburb, property_type, status, current_valuation, purchase_price, weekly_rent, loans:property_loans(current_balance, monthly_repayment, interest_rate_pct), cashflow_items(amount, frequency, is_income)"
        )
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as Row[];
    },
  });

  const summary = portfolioSummary(properties as unknown as PortfolioProperty[]);
  const active = (properties as unknown as PortfolioProperty[]).filter((p) => p.status !== "sold");
  const projectionProps = active.map((p) => ({
    current_valuation: p.current_valuation,
    loanBalance: totalLoanBalance(p.loans),
  }));
  const scenarioBase = active.reduce(
    (acc, p) => {
      const items = p.cashflow_items;
      acc.annualIncome += items && items.length > 0 ? annualIncome(items) : (p.weekly_rent ?? 0) * 52;
      acc.annualExpenses += annualExpenses(items);
      acc.annualRepayments += annualMortgageRepayments(p.loans);
      acc.totalLoanBalance += totalLoanBalance(p.loans);
      return acc;
    },
    { annualIncome: 0, annualExpenses: 0, annualRepayments: 0, totalLoanBalance: 0 }
  );

  const cards = [
    { label: "Portfolio Value", value: summary.totalValue, icon: Wallet },
    { label: "Total Debt", value: summary.totalDebt, icon: Landmark },
    { label: "Equity", value: summary.totalEquity, icon: TrendingUp },
    { label: `Usable Equity (${Math.round(DEFAULT_LVR * 100)}%)`, value: summary.totalUsableEquity, icon: PiggyBank },
    { label: "Annual Cash Flow", value: summary.totalAnnualCashFlow, icon: DollarSign, colored: true },
    { label: "Gross Yield", display: `${summary.weightedGrossYield.toFixed(1)}%`, icon: Percent },
  ];

  return (
    <div className="space-y-6">
      <PageHeading
        label="Portfolio"
        title="Portfolio"
        subtitle="Your properties, loans and equity — and when you're on track to invest again"
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : properties.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-neutral-500">
            <Home className="mx-auto mb-3 h-10 w-10 text-neutral-300" />
            No properties in your portfolio yet. Your Turnkey consultant can add them for you.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {cards.map((c) => {
              const Icon = c.icon;
              const colored = (c as any).colored;
              const display = (c as any).display ?? AUD((c as any).value ?? 0);
              return (
                <Card key={c.label} className="border-neutral-200">
                  <CardContent className="p-4 sm:p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <Icon className="h-4 w-4 text-brand-gold" />
                      <span className="text-[11px] font-medium uppercase leading-tight tracking-wide text-neutral-500">
                        {c.label}
                      </span>
                    </div>
                    <p
                      className={
                        "text-lg font-semibold tabular-nums sm:text-2xl " +
                        (colored ? ((c as any).value >= 0 ? "text-green-700" : "text-red-600") : "text-black")
                      }
                    >
                      {display}
                      {colored && <span className="ml-1 text-xs font-normal text-neutral-400">/yr</span>}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Projection + scenario */}
          {summary.count > 0 && (
            <div className="space-y-4">
              <PortfolioProjection
                properties={projectionProps}
                usableEquityNow={summary.totalUsableEquity}
                audience="client"
              />
              <PortfolioScenario
                base={scenarioBase}
                currentValue={summary.totalValue}
                currentAnnualCashFlow={summary.totalAnnualCashFlow}
              />
            </div>
          )}

          {/* Properties */}
          <div className="grid gap-3 sm:grid-cols-2">
            {(properties as unknown as Row[])
              .filter((p) => p.status !== "sold")
              .map((p) => {
                const debt = totalLoanBalance(p.loans);
                const value = p.current_valuation ?? 0;
                const equity = value - debt;
                const growth = capitalGrowth(p as unknown as PortfolioProperty);
                const cf = Math.round(annualCashFlow(p as unknown as PortfolioProperty));
                const gy = grossYield(p as unknown as PortfolioProperty);
                const Icon = p.property_type === "investment" ? Building2 : Home;
                const up = growth.dollars >= 0;
                return (
                  <Card key={p.id} className="border-neutral-200">
                    <CardContent className="p-4">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                            <Icon className="h-4 w-4 text-neutral-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-black">
                              {p.name || [p.address_line1, p.suburb].filter(Boolean).join(", ") || "Property"}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {STATUS_LABELS[p.status ?? ""] || p.status}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-lg font-bold tabular-nums text-black">{AUD(value)}</div>
                          {p.purchase_price != null && p.purchase_price > 0 && (
                            <div
                              className={
                                "flex items-center justify-end gap-0.5 text-xs tabular-nums " +
                                (up ? "text-green-600" : "text-red-600")
                              }
                            >
                              {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {up ? "+" : ""}
                              {AUD(growth.dollars)} ({growth.percent.toFixed(0)}%)
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <Mini label="Equity" text={AUD(equity)} />
                        <Mini label="CF /yr" text={AUD(cf)} tone={cf >= 0 ? "green" : "red"} />
                        <Mini label="Yield" text={`${gy.toFixed(1)}%`} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}

function Mini({ label, text, tone }: { label: string; text: string; tone?: "green" | "red" }) {
  return (
    <div className="rounded-lg bg-neutral-50 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div
        className={
          "text-sm font-medium tabular-nums " +
          (tone === "green" ? "text-green-700" : tone === "red" ? "text-red-600" : "text-black")
        }
      >
        {text}
      </div>
    </div>
  );
}
