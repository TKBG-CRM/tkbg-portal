// Shared deposit maths for the portal. Both the Deposits page and the
// project detail "Deposit Progress" summary use these so the figures
// always agree (the detail summary previously only counted payment-plan
// instalments and ignored the initial deposit, showing $0 paid).

export type Allocation = "land" | "build" | "split";

// How the initial deposit is credited across the land and build legs.
export function computeAllocationSplit(
  initial: number | null,
  land: number | null,
  build: number | null,
  allocation: Allocation
): { land: number; build: number } {
  const i = initial ?? 0;
  if (i <= 0) return { land: 0, build: 0 };
  if (allocation === "land") return { land: i, build: 0 };
  if (allocation === "build") return { land: 0, build: i };
  const l = land ?? 0;
  const b = build ?? 0;
  if (l + b <= 0) return { land: i / 2, build: i / 2 };
  return { land: (i * l) / (l + b), build: (i * b) / (l + b) };
}

// Amount of the deposit actually received so far, comparable to
// total_deposit_amount. Mirrors the Deposits page: the initial deposit is
// credited across the land/build legs, and a leg counts as fully received
// once its *_paid_at is set.
export function computeDepositPaid(project: {
  initial_deposit_amount?: number | string | null;
  land_deposit_amount?: number | string | null;
  build_deposit_amount?: number | string | null;
  total_deposit_amount?: number | string | null;
  initial_deposit_allocation?: string | null;
  land_deposit_paid_at?: string | null;
  build_deposit_paid_at?: string | null;
}): number {
  const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
  const initialAmt = num(project.initial_deposit_amount);
  const landAmt = num(project.land_deposit_amount);
  const buildAmt = num(project.build_deposit_amount);
  const total = num(project.total_deposit_amount);
  const alloc = (project.initial_deposit_allocation as Allocation) || "split";
  const split = computeAllocationSplit(initialAmt, landAmt, buildAmt, alloc);
  const paidLand = project.land_deposit_paid_at ? landAmt : split.land;
  const paidBuild = project.build_deposit_paid_at ? buildAmt : split.build;
  const received = paidLand + paidBuild;
  return total > 0 ? Math.min(received, total) : received;
}
