import { redirect } from "next/navigation";
import { Wallet, Landmark, TrendingUp, PiggyBank, DollarSign, Percent, Home } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeading } from "@/components/PortalHeading";
import { formatAmount } from "@/lib/numbers";
import {
  portfolioSummary,
  totalLoanBalance,
  annualIncome,
  annualExpenses,
  annualMortgageRepayments,
  DEFAULT_LVR,
  type PortfolioProperty,
} from "@/lib/portfolio";
import PortfolioProjection from "@/components/portfolio/PortfolioProjection";
import PortfolioScenario from "@/components/portfolio/PortfolioScenario";
import { PortfolioManager, type Property } from "./_components/portfolio-manager";

export const dynamic = "force-dynamic";

const AUD = (n: number) => formatAmount(Math.round(n)) || "$0";

export default async function PortalPortfolioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("linked_user_id", user.id)
    .single();
  if (!contact) redirect("/");

  const { data: rows } = await supabase
    .from("properties")
    .select(
      "id, contact_id, name, address_line1, suburb, state, postcode, property_type, status, purchase_price, purchase_date, current_valuation, valuation_date, weekly_rent, notes, loans:property_loans(id, property_id, lender, loan_type, original_amount, current_balance, interest_rate_pct, monthly_repayment, balance_as_of, notes), cashflow_items(id, property_id, category, label, amount, frequency, is_income)"
    )
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: true });

  const properties = (rows ?? []) as Property[];
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
        subtitle="Track your properties, loans and equity — and see when you're on track to invest again"
      />

      {properties.length > 0 && (
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
        </>
      )}

      {/* Add / edit properties, loans and cashflow */}
      {properties.length === 0 ? (
        <Card className="border-neutral-200">
          <CardContent className="p-10 text-center">
            <Home className="mx-auto mb-3 h-10 w-10 text-neutral-300" />
            <p className="mb-4 text-sm text-neutral-600">
              You haven&apos;t added any properties yet. Add your home or an investment property to
              see your equity and when you&apos;re ready to invest again.
            </p>
            <PortfolioManager contactId={contact.id} initialProperties={[]} showInlineAddOnly />
          </CardContent>
        </Card>
      ) : (
        <PortfolioManager contactId={contact.id} initialProperties={properties} />
      )}
    </div>
  );
}
