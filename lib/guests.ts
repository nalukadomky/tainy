// Skladba hostů. Katalog kategorií je pevný — majitel je zapíná, vypíná
// a nastavuje jim cenu; volné vymýšlení vlastních kategorií by z jednoduchého
// ceníku udělalo konfigurátor.
//
// Uloženo v `Site.guestCategories` jako JSON. Prázdná hodnota = výchozí katalog,
// takže existující weby nemusí nic vyplňovat.

import type { Adjust } from "@/lib/pricing";

export type GuestKey = "adult" | "child" | "infant" | "dog";

export type GuestCategory = {
  key: GuestKey;
  label: string;
  enabled: boolean;
  /** Úprava ceny: pct = ± % vůči ceně noci, czk = pevná částka */
  adjust: Adjust;
  /** Počítá se do maximálního počtu hostů? */
  capacity: boolean;
  /** Platí poplatek z pobytu? Zákon osvobozuje osoby do 18 let. */
  tax: boolean;
};

/** Kolik koho přijede, např. { adult: 2, child: 1 }. */
export type GuestCounts = Partial<Record<GuestKey, number>>;

export const GUEST_ORDER: GuestKey[] = ["adult", "child", "infant", "dog"];

/**
 * Výchozí katalog. Závisí na režimu ceníku, protože stejné číslo znamená
 * v každém režimu něco jiného:
 *   • „za osobu"     — hodnota je cena té osoby, dítě tedy −50 %
 *   • „za nemovitost" — hodnota je příplatek k ceně objektu, a děti jsou
 *     v ceně chaty, takže 0; sleva by se odečítala z ceny celé nemovitosti
 */
export function defaultCategories(pricingMode = "person"): GuestCategory[] {
  const zaNemovitost = pricingMode === "unit";
  return [
    { key: "adult",  label: "Dospělí (13 let a více)", enabled: true,  adjust: { value: 0, unit: "pct" }, capacity: true,  tax: true },
    { key: "child",  label: "Děti 2–12 let",           enabled: true,  adjust: zaNemovitost ? { value: 0, unit: "pct" } : { value: -50, unit: "pct" },  capacity: true,  tax: false },
    { key: "infant", label: "Děti do 2 let",           enabled: true,  adjust: zaNemovitost ? { value: 0, unit: "pct" } : { value: -100, unit: "pct" }, capacity: false, tax: false },
    { key: "dog",    label: "Pes",                     enabled: false, adjust: { value: 200, unit: "czk" }, capacity: false, tax: false },
  ];
}

function isKey(value: unknown): value is GuestKey {
  return typeof value === "string" && (GUEST_ORDER as string[]).includes(value);
}

/**
 * Načte katalog z uloženého JSON. Neznámé klíče zahazuje a chybějící doplní
 * z výchozích hodnot, takže špatný obsah pole nikdy neshodí ceník.
 */
export function parseCategories(raw: string, pricingMode = "person"): GuestCategory[] {
  const defaults = defaultCategories(pricingMode);
  let stored: unknown;
  try {
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }
  if (!Array.isArray(stored)) return defaults.map((c) => ({ ...c }));

  return defaults.map((base) => {
    const found = stored.find((c) => isRecord(c) && c.key === base.key);
    if (!found || !isRecord(found)) return { ...base };
    const adjust = isRecord(found.adjust) ? found.adjust : {};
    return {
      key: base.key,
      label: typeof found.label === "string" && found.label.trim() ? found.label.slice(0, 60) : base.label,
      enabled: typeof found.enabled === "boolean" ? found.enabled : base.enabled,
      adjust: {
        value: Number.isFinite(Number(adjust.value)) ? Math.round(Number(adjust.value)) : base.adjust.value,
        unit: adjust.unit === "czk" ? "czk" : "pct",
      },
      capacity: typeof found.capacity === "boolean" ? found.capacity : base.capacity,
      tax: typeof found.tax === "boolean" ? found.tax : base.tax,
    };
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function serializeCategories(categories: GuestCategory[]): string {
  return JSON.stringify(categories);
}

/** Kategorie, které se hostovi opravdu nabídnou. */
export function activeCategories(mode: string, categories: GuestCategory[]): GuestCategory[] {
  if (mode !== "split") return [];
  return categories.filter((c) => c.enabled);
}

/** Načte skladbu z požadavku a nechá jen povolené kategorie. */
export function parseCounts(raw: unknown, active: GuestCategory[]): GuestCounts {
  const out: GuestCounts = {};
  const source = isRecord(raw) ? raw : {};
  for (const cat of active) {
    const n = Number(source[cat.key] ?? 0);
    out[cat.key] = Number.isFinite(n) && n > 0 ? Math.min(50, Math.round(n)) : 0;
  }
  return out;
}

function sumBy(counts: GuestCounts, categories: GuestCategory[], pick: (c: GuestCategory) => boolean): number {
  return categories.reduce((sum, c) => (pick(c) ? sum + (counts[c.key] ?? 0) : sum), 0);
}

/** Osoby, které se počítají do maximálního počtu hostů. */
export function capacityCount(counts: GuestCounts, categories: GuestCategory[]): number {
  return sumBy(counts, categories, (c) => c.capacity);
}

/** Osoby, ze kterých se odvádí poplatek z pobytu. */
export function taxableCount(counts: GuestCounts, categories: GuestCategory[]): number {
  return sumBy(counts, categories, (c) => c.tax);
}

/** Souhrn do e-mailu a výpisů, např. „2 dospělí · 1 dítě 2–12 let · 1 pes". */
export function describeCounts(counts: GuestCounts, categories: GuestCategory[]): string {
  return categories
    .filter((c) => (counts[c.key] ?? 0) > 0)
    .map((c) => `${counts[c.key]}× ${c.label.toLowerCase()}`)
    .join(" · ");
}

export function totalPeople(counts: GuestCounts, categories: GuestCategory[]): number {
  return sumBy(counts, categories, (c) => c.key !== "dog");
}
