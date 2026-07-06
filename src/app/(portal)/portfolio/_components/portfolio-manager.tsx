"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Home,
  Building2,
  Loader2,
  Landmark,
  MapPin,
  DollarSign,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseAmount, formatAmount } from "@/lib/numbers";
import { formatAuDate } from "@/lib/date";
import {
  propertyEquity,
  totalLoanBalance,
  type PortfolioLoan,
} from "@/lib/portfolio";

export type Loan = {
  id: string;
  property_id: string;
  lender: string | null;
  loan_type: string;
  original_amount: number | null;
  current_balance: number | null;
  interest_rate_pct: number | null;
  monthly_repayment: number | null;
  balance_as_of: string | null;
  notes: string | null;
};

export type CashflowItem = {
  id: string;
  property_id: string;
  category: string;
  label: string | null;
  amount: number;
  frequency: string;
  is_income: boolean;
};

export type Property = {
  id: string;
  contact_id: string;
  name: string | null;
  address_line1: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  property_type: string;
  status: string;
  purchase_price: number | null;
  purchase_date: string | null;
  current_valuation: number | null;
  valuation_date: string | null;
  weekly_rent: number | null;
  notes: string | null;
  loans: Loan[] | null;
  cashflow_items?: CashflowItem[] | null;
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  investment: "Investment",
  owner_occupier: "Owner Occupier",
};

const STATUS_LABELS: Record<string, string> = {
  owned: "Owned",
  under_construction: "Under Construction",
  sold: "Sold",
};

const LOAN_TYPE_LABELS: Record<string, string> = {
  principal_interest: "Principal & Interest",
  interest_only: "Interest Only",
};

const CASHFLOW_CATEGORY_LABELS: Record<string, string> = {
  rent: "Rent",
  rates: "Council Rates",
  insurance: "Insurance",
  mgmt_fee: "Management Fee",
  maintenance: "Maintenance",
  strata: "Strata / Body Corp",
  other: "Other",
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

function propertyTitle(p: Property): string {
  return (
    p.name ||
    [p.address_line1, p.suburb].filter(Boolean).join(", ") ||
    "Untitled property"
  );
}

export function PortfolioManager({
  contactId,
  initialProperties,
  showInlineAddOnly = false,
}: {
  contactId: string;
  initialProperties: Property[];
  showInlineAddOnly?: boolean;
}) {
  const router = useRouter();
  const [propertyDialogOpen, setPropertyDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [loanContext, setLoanContext] = useState<{
    propertyId: string;
    loan: Loan | null;
  } | null>(null);
  const [cashflowDialogOpen, setCashflowDialogOpen] = useState(false);
  const [cashflowContext, setCashflowContext] = useState<{
    propertyId: string;
    item: CashflowItem | null;
  } | null>(null);

  function openAddProperty() {
    setEditingProperty(null);
    setPropertyDialogOpen(true);
  }

  function openEditProperty(p: Property) {
    setEditingProperty(p);
    setPropertyDialogOpen(true);
  }

  function openAddLoan(propertyId: string) {
    setLoanContext({ propertyId, loan: null });
    setLoanDialogOpen(true);
  }

  function openEditLoan(propertyId: string, loan: Loan) {
    setLoanContext({ propertyId, loan });
    setLoanDialogOpen(true);
  }

  function openAddCashflow(propertyId: string) {
    setCashflowContext({ propertyId, item: null });
    setCashflowDialogOpen(true);
  }

  function openEditCashflow(propertyId: string, item: CashflowItem) {
    setCashflowContext({ propertyId, item });
    setCashflowDialogOpen(true);
  }

  const addButton = (
    <Button onClick={openAddProperty} className="bg-brand-gold hover:bg-brand-gold-dark text-white">
      <Plus className="h-4 w-4 mr-1.5" /> Add Property
    </Button>
  );

  return (
    <div>
      {showInlineAddOnly ? (
        <div className="flex justify-center">{addButton}</div>
      ) : (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">
            Properties · {initialProperties.length}
          </h2>
          {addButton}
        </div>
      )}

      {!showInlineAddOnly && (
        <div className="space-y-4">
          {initialProperties.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              onEdit={() => openEditProperty(p)}
              onAddLoan={() => openAddLoan(p.id)}
              onEditLoan={(loan) => openEditLoan(p.id, loan)}
              onAddCashflow={() => openAddCashflow(p.id)}
              onEditCashflow={(item) => openEditCashflow(p.id, item)}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      )}

      <PropertyDialog
        open={propertyDialogOpen}
        onOpenChange={setPropertyDialogOpen}
        contactId={contactId}
        property={editingProperty}
        onSaved={() => {
          setPropertyDialogOpen(false);
          router.refresh();
        }}
      />

      {loanContext && (
        <LoanDialog
          open={loanDialogOpen}
          onOpenChange={setLoanDialogOpen}
          propertyId={loanContext.propertyId}
          loan={loanContext.loan}
          onSaved={() => {
            setLoanDialogOpen(false);
            router.refresh();
          }}
        />
      )}

      {cashflowContext && (
        <CashflowItemDialog
          open={cashflowDialogOpen}
          onOpenChange={setCashflowDialogOpen}
          propertyId={cashflowContext.propertyId}
          item={cashflowContext.item}
          onSaved={() => {
            setCashflowDialogOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PropertyCard({
  property,
  onEdit,
  onAddLoan,
  onEditLoan,
  onAddCashflow,
  onEditCashflow,
  onChanged,
}: {
  property: Property;
  onEdit: () => void;
  onAddLoan: () => void;
  onEditLoan: (loan: Loan) => void;
  onAddCashflow: () => void;
  onEditCashflow: (item: CashflowItem) => void;
  onChanged: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const loans = property.loans ?? [];
  const debt = totalLoanBalance(loans as PortfolioLoan[]);
  const equity = propertyEquity(property.current_valuation, debt);
  const TypeIcon = property.property_type === "investment" ? Building2 : Home;

  async function deleteProperty() {
    if (
      !confirm(
        `Delete "${propertyTitle(property)}" and its loans? This can't be undone.`
      )
    )
      return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("properties")
      .delete()
      .eq("id", property.id);
    setDeleting(false);
    if (error) {
      toast.error("Couldn't delete the property.");
      return;
    }
    toast.success("Property deleted.");
    onChanged();
  }

  async function deleteLoan(loanId: string) {
    if (!confirm("Delete this loan?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("property_loans")
      .delete()
      .eq("id", loanId);
    if (error) {
      toast.error("Couldn't delete the loan.");
      return;
    }
    toast.success("Loan deleted.");
    onChanged();
  }

  async function deleteCashflowItem(itemId: string) {
    if (!confirm("Delete this cashflow item?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("cashflow_items")
      .delete()
      .eq("id", itemId);
    if (error) {
      toast.error("Couldn't delete the item.");
      return;
    }
    toast.success("Item deleted.");
    onChanged();
  }

  return (
    <Card className="border-neutral-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-md bg-brand-gold/10 flex items-center justify-center shrink-0">
              <TypeIcon className="h-5 w-5 text-brand-gold" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black truncate">
                {propertyTitle(property)}
              </p>
              {(property.address_line1 || property.suburb) && (
                <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {[
                      property.address_line1,
                      property.suburb,
                      property.state,
                      property.postcode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <Badge
                  variant="secondary"
                  className="bg-neutral-100 text-neutral-600 text-[10px] border-0"
                >
                  {PROPERTY_TYPE_LABELS[property.property_type] ||
                    property.property_type}
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-neutral-100 text-neutral-600 text-[10px] border-0"
                >
                  {STATUS_LABELS[property.status] || property.status}
                </Badge>
                {property.weekly_rent != null && (
                  <Badge
                    variant="secondary"
                    className="bg-neutral-100 text-neutral-600 text-[10px] border-0"
                  >
                    {formatAmount(property.weekly_rent)}/wk
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="h-8 w-8 p-0 text-neutral-500 hover:text-brand-gold"
              aria-label="Edit property"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={deleteProperty}
              disabled={deleting}
              className="h-8 w-8 p-0 text-neutral-500 hover:text-red-600"
              aria-label="Delete property"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Value / debt / equity */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-neutral-100">
          <Figure label="Value" value={property.current_valuation} />
          <Figure label="Debt" value={debt} />
          <Figure label="Equity" value={equity} accent />
        </div>

        {/* Loans */}
        <div className="mt-4 pt-4 border-t border-neutral-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5" /> Loans · {loans.length}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddLoan}
              className="h-7 text-xs text-brand-gold hover:text-brand-gold-dark"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Loan
            </Button>
          </div>
          {loans.length === 0 ? (
            <p className="text-xs text-neutral-400 py-1">
              No loans recorded — this property is counted as owned outright.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {loans.map((loan) => (
                <li
                  key={loan.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-black truncate">
                      {loan.lender || "Loan"}
                      <span className="text-neutral-400">
                        {" "}
                        · {LOAN_TYPE_LABELS[loan.loan_type] || loan.loan_type}
                        {loan.interest_rate_pct != null
                          ? ` · ${loan.interest_rate_pct}%`
                          : ""}
                      </span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      Balance {formatAmount(loan.current_balance) || "$0"}
                      {loan.balance_as_of
                        ? ` (as of ${formatAuDate(loan.balance_as_of)})`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditLoan(loan)}
                      className="h-7 w-7 p-0 text-neutral-400 hover:text-brand-gold"
                      aria-label="Edit loan"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteLoan(loan.id)}
                      className="h-7 w-7 p-0 text-neutral-400 hover:text-red-600"
                      aria-label="Delete loan"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Cashflow Items */}
        <div className="mt-4 pt-4 border-t border-neutral-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Cash Flow · {(property.cashflow_items ?? []).length}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddCashflow}
              className="h-7 text-xs text-brand-gold hover:text-brand-gold-dark"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
            </Button>
          </div>
          {(property.cashflow_items ?? []).length === 0 ? (
            <p className="text-xs text-neutral-400 py-1">
              No cashflow items. Add rates, insurance, strata, etc. to
              calculate net yield.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {(property.cashflow_items ?? []).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-black truncate">
                      {item.label || CASHFLOW_CATEGORY_LABELS[item.category] || item.category}
                      <span className="text-neutral-400">
                        {" "}· {FREQUENCY_LABELS[item.frequency] || item.frequency}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={
                        "text-sm font-medium tabular-nums " +
                        (item.is_income ? "text-green-700" : "text-neutral-900")
                      }
                    >
                      {item.is_income ? "+" : "−"}{formatAmount(item.amount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditCashflow(item)}
                      className="h-7 w-7 p-0 text-neutral-400 hover:text-brand-gold"
                      aria-label="Edit cashflow item"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCashflowItem(item.id)}
                      className="h-7 w-7 p-0 text-neutral-400 hover:text-red-600"
                      aria-label="Delete cashflow item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      <p
        className={
          "text-sm font-semibold tabular-nums " +
          (accent
            ? (value ?? 0) >= 0
              ? "text-brand-gold"
              : "text-red-600"
            : "text-black")
        }
      >
        {formatAmount(value) || "$0"}
      </p>
    </div>
  );
}

function PropertyDialog({
  open,
  onOpenChange,
  contactId,
  property,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contactId: string;
  property: Property | null;
  onSaved: () => void;
}) {
  const isEdit = !!property;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address_line1: "",
    suburb: "",
    state: "",
    postcode: "",
    property_type: "investment",
    status: "owned",
    purchase_price: "",
    purchase_date: "",
    current_valuation: "",
    valuation_date: "",
    weekly_rent: "",
    notes: "",
  });

  // Reset form when the dialog opens for a different property.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = property?.id ?? "__new__";
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setForm({
      name: property?.name ?? "",
      address_line1: property?.address_line1 ?? "",
      suburb: property?.suburb ?? "",
      state: property?.state ?? "",
      postcode: property?.postcode ?? "",
      property_type: property?.property_type ?? "investment",
      status: property?.status ?? "owned",
      purchase_price: property?.purchase_price?.toString() ?? "",
      purchase_date: property?.purchase_date ?? "",
      current_valuation: property?.current_valuation?.toString() ?? "",
      valuation_date: property?.valuation_date ?? "",
      weekly_rent: property?.weekly_rent?.toString() ?? "",
      notes: property?.notes ?? "",
    });
  }
  if (!open && seededFor !== null) setSeededFor(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      contact_id: contactId,
      name: form.name.trim() || null,
      address_line1: form.address_line1.trim() || null,
      suburb: form.suburb.trim() || null,
      state: form.state.trim() || null,
      postcode: form.postcode.trim() || null,
      property_type: form.property_type,
      status: form.status,
      purchase_price: parseAmount(form.purchase_price),
      purchase_date: form.purchase_date || null,
      current_valuation: parseAmount(form.current_valuation),
      valuation_date: form.valuation_date || null,
      weekly_rent: parseAmount(form.weekly_rent),
      notes: form.notes.trim() || null,
    };

    const { error } = isEdit
      ? await supabase.from("properties").update(payload).eq("id", property!.id)
      : await supabase.from("properties").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(
        isEdit ? "Couldn't save changes." : "Couldn't add the property."
      );
      return;
    }
    toast.success(isEdit ? "Property updated." : "Property added.");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Property" : "Add Property"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Property name">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. 12 Smith St investment"
            />
          </Field>
          <Field label="Street address">
            <Input
              value={form.address_line1}
              onChange={(e) => set("address_line1", e.target.value)}
              placeholder="123 Example Street"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Suburb">
              <Input
                value={form.suburb}
                onChange={(e) => set("suburb", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State">
                <Input
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  placeholder="VIC"
                />
              </Field>
              <Field label="Postcode">
                <Input
                  value={form.postcode}
                  onChange={(e) => set("postcode", e.target.value)}
                  inputMode="numeric"
                />
              </Field>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={form.property_type}
                onValueChange={(v) => set("property_type", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="investment">Investment</SelectItem>
                  <SelectItem value="owner_occupier">Owner Occupier</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owned">Owned</SelectItem>
                  <SelectItem value="under_construction">
                    Under Construction
                  </SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase price">
              <MoneyInput
                value={form.purchase_price}
                onChange={(v) => set("purchase_price", v)}
                placeholder="$0"
              />
            </Field>
            <Field label="Purchase date">
              <Input
                type="date"
                value={form.purchase_date}
                onChange={(e) => set("purchase_date", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current valuation">
              <MoneyInput
                value={form.current_valuation}
                onChange={(v) => set("current_valuation", v)}
                placeholder="$0"
              />
            </Field>
            <Field label="Valuation date">
              <Input
                type="date"
                value={form.valuation_date}
                onChange={(e) => set("valuation_date", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Weekly rent (if rented)">
            <MoneyInput
              value={form.weekly_rent}
              onChange={(v) => set("weekly_rent", v)}
              placeholder="$0"
            />
          </Field>
          <Field label="Notes">
            <Input
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-brand-gold hover:bg-brand-gold-dark text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoanDialog({
  open,
  onOpenChange,
  propertyId,
  loan,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  loan: Loan | null;
  onSaved: () => void;
}) {
  const isEdit = !!loan;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    lender: "",
    loan_type: "principal_interest",
    original_amount: "",
    current_balance: "",
    interest_rate_pct: "",
    monthly_repayment: "",
    balance_as_of: "",
    notes: "",
  });

  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = loan?.id ?? "__new__";
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setForm({
      lender: loan?.lender ?? "",
      loan_type: loan?.loan_type ?? "principal_interest",
      original_amount: loan?.original_amount?.toString() ?? "",
      current_balance: loan?.current_balance?.toString() ?? "",
      interest_rate_pct: loan?.interest_rate_pct?.toString() ?? "",
      monthly_repayment: loan?.monthly_repayment?.toString() ?? "",
      balance_as_of: loan?.balance_as_of ?? "",
      notes: loan?.notes ?? "",
    });
  }
  if (!open && seededFor !== null) setSeededFor(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      property_id: propertyId,
      lender: form.lender.trim() || null,
      loan_type: form.loan_type,
      original_amount: parseAmount(form.original_amount),
      current_balance: parseAmount(form.current_balance),
      interest_rate_pct: parseAmount(form.interest_rate_pct),
      monthly_repayment: parseAmount(form.monthly_repayment),
      balance_as_of: form.balance_as_of || null,
      notes: form.notes.trim() || null,
    };

    const { error } = isEdit
      ? await supabase
          .from("property_loans")
          .update(payload)
          .eq("id", loan!.id)
      : await supabase.from("property_loans").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(isEdit ? "Couldn't save the loan." : "Couldn't add the loan.");
      return;
    }
    toast.success(isEdit ? "Loan updated." : "Loan added.");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Loan" : "Add Loan"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Lender">
            <Input
              value={form.lender}
              onChange={(e) => set("lender", e.target.value)}
              placeholder="e.g. CBA"
            />
          </Field>
          <Field label="Loan type">
            <Select
              value={form.loan_type}
              onValueChange={(v) => set("loan_type", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="principal_interest">
                  Principal &amp; Interest
                </SelectItem>
                <SelectItem value="interest_only">Interest Only</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Original amount">
              <MoneyInput
                value={form.original_amount}
                onChange={(v) => set("original_amount", v)}
                placeholder="$0"
              />
            </Field>
            <Field label="Current balance">
              <MoneyInput
                value={form.current_balance}
                onChange={(v) => set("current_balance", v)}
                placeholder="$0"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Interest rate (%)">
              <Input
                value={form.interest_rate_pct}
                onChange={(e) => set("interest_rate_pct", e.target.value)}
                inputMode="decimal"
                placeholder="6.20"
              />
            </Field>
            <Field label="Monthly repayment">
              <MoneyInput
                value={form.monthly_repayment}
                onChange={(v) => set("monthly_repayment", v)}
                placeholder="$0"
              />
            </Field>
          </div>
          <Field label="Balance as of">
            <Input
              type="date"
              value={form.balance_as_of}
              onChange={(e) => set("balance_as_of", e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <Input
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-brand-gold hover:bg-brand-gold-dark text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Loan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CashflowItemDialog({
  open,
  onOpenChange,
  propertyId,
  item,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  item: CashflowItem | null;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: "rates",
    label: "",
    amount: "",
    frequency: "annual",
    is_income: false,
  });

  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = item?.id ?? "__new__";
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setForm({
      category: item?.category ?? "rates",
      label: item?.label ?? "",
      amount: item?.amount?.toString() ?? "",
      frequency: item?.frequency ?? "annual",
      is_income: item?.is_income ?? false,
    });
  }
  if (!open && seededFor !== null) setSeededFor(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      property_id: propertyId,
      category: form.category,
      label: form.label.trim() || null,
      amount: parseAmount(form.amount) ?? 0,
      frequency: form.frequency,
      is_income: form.is_income,
    };

    const { error } = isEdit
      ? await supabase.from("cashflow_items").update(payload).eq("id", item!.id)
      : await supabase.from("cashflow_items").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(isEdit ? "Couldn't save." : "Couldn't add the item.");
      return;
    }
    toast.success(isEdit ? "Item updated." : "Item added.");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Cashflow Item" : "Add Cashflow Item"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Category">
            <Select
              value={form.category}
              onValueChange={(v) => set("category", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CASHFLOW_CATEGORY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Label (optional)">
            <Input
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="e.g. Landlord insurance"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <MoneyInput
                value={form.amount}
                onChange={(v) => set("amount", v)}
                placeholder="$0"
              />
            </Field>
            <Field label="Frequency">
              <Select
                value={form.frequency}
                onValueChange={(v) => set("frequency", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_income"
              checked={form.is_income}
              onChange={(e) => set("is_income", e.target.checked)}
              className="h-4 w-4 accent-brand-gold"
            />
            <Label htmlFor="is_income" className="text-sm cursor-pointer">
              This is income (e.g. rent)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !form.amount}
            className="bg-brand-gold hover:bg-brand-gold-dark text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-neutral-600">{label}</Label>
      {children}
    </div>
  );
}
