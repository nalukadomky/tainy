// Náklady: jednorázové a opakované (měsíčně / ročně).
// Opakovaný náklad je v databázi jeden řádek; jednotlivé platby se dopočítávají
// tady, aby šel kdykoli ukončit bez mazání historie.

export type Repeat = "once" | "monthly" | "yearly";

export const REPEAT_LABEL: Record<Repeat, string> = {
  once: "Jednorázově",
  monthly: "Každý měsíc",
  yearly: "Každý rok",
};

export type CostLike = {
  amount: number;
  date: string;
  repeat: Repeat;
  endDate: string | null;
};

/** n-tý výskyt od začátku; den se u kratších měsíců zarovná (31. 1. → 28. 2.). */
function nth(start: Date, repeat: Repeat, n: number): Date {
  const y = start.getUTCFullYear() + (repeat === "yearly" ? n : 0);
  const m = start.getUTCMonth() + (repeat === "monthly" ? n : 0);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay)));
}

/** Data plateb nákladu v intervalu [from, to] (včetně). */
export function occurrences(cost: CostLike, from: Date, to: Date): Date[] {
  const start = new Date(cost.date);
  // Cokoli jiného než monthly/yearly (i chybějící hodnota) je jednorázové —
  // jinak by smyčka níže nikdy neskončila.
  const recurring = cost.repeat === "monthly" || cost.repeat === "yearly";
  if (!recurring || Number.isNaN(+start)) return start >= from && start <= to ? [start] : [];

  const until = cost.endDate && new Date(cost.endDate) < to ? new Date(cost.endDate) : to;
  const out: Date[] = [];
  for (let n = 0; ; n++) {
    const d = nth(start, cost.repeat, n);
    if (d > until) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** Kolik náklad stál v daném intervalu. */
export function costInRange(cost: CostLike, from: Date, to: Date): number {
  return occurrences(cost, from, to).length * cost.amount;
}

/** Součet všech nákladů, které už opravdu nastaly (do dneška). */
export function spentToDate(costs: CostLike[], now = new Date()): number {
  return costs.reduce((sum, c) => sum + costInRange(c, new Date(0), now), 0);
}

/** Běží opakovaný náklad ještě? */
export function isActive(cost: CostLike, now = new Date()): boolean {
  const recurring = cost.repeat === "monthly" || cost.repeat === "yearly";
  return recurring && (!cost.endDate || new Date(cost.endDate) >= now);
}

/** Průměrná měsíční zátěž z běžících opakovaných nákladů. */
export function monthlyFixed(costs: CostLike[], now = new Date()): number {
  return Math.round(
    costs
      .filter((c) => isActive(c, now))
      .reduce((sum, c) => sum + (c.repeat === "monthly" ? c.amount : c.amount / 12), 0)
  );
}
