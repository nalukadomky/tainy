// Výpočet ceny pobytu sdílený mezi rezervačním widgetem a API.
//
// Cena jedné noci vzniká ve dvou krocích:
//
//   KROK 1 — cena noci bez ohledu na to, kdo přijede
//     Základ je `pricePerNight` (za nemovitost, nebo za jednoho dospělého).
//     Na něj se aplikuje víkendová přirážka a sezónní období. Každá úprava je
//     dvojice hodnota + jednotka:
//       • pct — ± % vůči základu; víc procentních úprav se sčítá
//       • czk — pevná cena noci, která výsledek přepíše
//     Když platí aspoň jedna pevná částka, procenta se pro tu noc ignorují.
//     Konflikt řeší konkrétnost: sezóna přebíjí víkend a mezi sezónami vyhraje
//     ta s pozdějším začátkem.
//
//   KROK 2 — skladba hostů
//     Každá kategorie (dospělí, děti, kojenci, pes) má vlastní úpravu.
//       • režim „za osobu"     → kategorie určuje cenu té osoby
//       • režim „za nemovitost" → kategorie je příplatek nad cenu objektu
//     Když se hosté nedělí, chová se to jako jediná kategorie „dospělý" s 0 %,
//     takže výsledek je stejný jako před zavedením kategorií.
//
// K ceně za noci se nakonec přičtou poplatky, aby host viděl konečnou částku:
//   • úklidový poplatek — jednou za pobyt
//   • poplatek z pobytu — Kč × osoby, které ho platí × noci (zákonná povinnost)
//
// Den příjezdu a den odjezdu se v kalendáři zobrazují jako půldny
// (odjíždějící host dopoledne, přijíždějící odpoledne) — účtují se
// ale klasicky noci mezi příjezdem a odjezdem.

import {
  defaultCategories,
  taxableCount,
  type GuestCategory,
  type GuestCounts,
} from "@/lib/guests";

export type PricingMode = "unit" | "person";

/** Úprava ceny: procento vůči základu, nebo pevná částka, která základ přepíše. */
export type Adjust = { value: number; unit: "pct" | "czk" };

export type PriceRuleInput = {
  label: string;
  startDate: string; // ISO datum nebo datetime
  endDate: string;   // včetně
  adjust: Adjust;
};

export type PricingConfig = {
  pricePerNight: number;
  pricingMode: PricingMode;
  weekend: Adjust;
  priceRules: PriceRuleInput[];
  cleaningFee?: number;
  touristTax?: number;
  /** "split" = hosté se dělí do kategorií, cokoli jiného = jeden čítač osob. */
  guestMode?: string;
  categories?: GuestCategory[];
};

export type QuoteLine = {
  count: number;
  price: number; // cena jedné noci za celou společnost
  note: string;  // např. "víkend, Hlavní sezóna"
};

export type QuoteFee = {
  /** cleaning = úklid, tax = poplatek z pobytu (odvádí se obci, sleva se ho netýká). */
  key: "cleaning" | "tax";
  label: string;
  detail: string;
  amount: number;
};

export type Quote = {
  nights: number;
  nightsTotal: number;
  feesTotal: number;
  total: number;
  lines: QuoteLine[];
  fees: QuoteFee[];
};

// Kategorie použitá, když se hosté nedělí — chová se přesně jako dřívější
// „počet hostů" a drží zpětnou kompatibilitu ceníku.
const PLAIN_ADULT: GuestCategory = {
  ...defaultCategories()[0],
  label: "Hosté",
  adjust: { value: 0, unit: "pct" },
  capacity: true,
  tax: true,
};

/** Kategorie, se kterými se opravdu počítá. */
export function pricedCategories(
  cfg: Pick<PricingConfig, "guestMode" | "categories"> & { pricingMode?: PricingMode }
): GuestCategory[] {
  if (cfg.guestMode !== "split") return [PLAIN_ADULT];
  const enabled = (cfg.categories ?? defaultCategories(cfg.pricingMode)).filter((c) => c.enabled);
  return enabled.length ? enabled : [PLAIN_ADULT];
}

/** Je úprava vůbec nastavená? Nula znamená „neřeším", ne „zdarma". */
function isSet(a: Adjust | undefined): a is Adjust {
  return !!a && (a.unit === "pct" ? a.value !== 0 : a.value > 0);
}

function isoDate(value: string): string {
  return value.slice(0, 10);
}

function dateFromISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function nextISO(iso: string): string {
  const d = dateFromISO(iso);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nightsBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Skloňování „noc / noci / nocí" a „host / hosté / hostů". */
export function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n < 5 ? few : many;
}

/** KROK 1 — cena noci před započtením skladby hostů. */
function baseNightPrice(cfg: PricingConfig, nightIso: string): { price: number; note: string } {
  const day = isoDate(nightIso);
  const dow = dateFromISO(day).getDay(); // 0 = ne, 5 = pá, 6 = so

  // Úpravy platné pro tuhle noc, od nejobecnější po nejkonkrétnější
  const matching: { label: string; adjust: Adjust }[] = [];
  if ((dow === 5 || dow === 6 || dow === 0) && isSet(cfg.weekend)) {
    matching.push({ label: "víkend", adjust: cfg.weekend });
  }
  for (const rule of cfg.priceRules ?? []) {
    if (day >= isoDate(rule.startDate) && day <= isoDate(rule.endDate) && isSet(rule.adjust)) {
      matching.push({ label: rule.label || "sezóna", adjust: rule.adjust });
    }
  }

  // Pevná částka přepíše všechno; vyhrává ta nejkonkrétnější, tedy poslední.
  const fixed = matching.filter((m) => m.adjust.unit === "czk").at(-1);
  if (fixed) {
    return { price: applyAdjust(cfg.pricePerNight, fixed.adjust), note: fixed.label };
  }

  const pct = matching.reduce((sum, m) => sum + m.adjust.value, 0);
  return {
    price: Math.max(0, Math.round(cfg.pricePerNight * (1 + pct / 100))),
    note: matching.map((m) => m.label).join(", "),
  };
}

/** Cena po jedné úpravě: procenta základ upraví, pevná částka ho přepíše. */
export function applyAdjust(base: number, adjust: Adjust): number {
  return adjust.unit === "czk"
    ? Math.max(0, Math.round(adjust.value))
    : Math.max(0, Math.round(base * (1 + adjust.value / 100)));
}

/** Cena jedné osoby dané kategorie za noc (režim „za osobu"). */
export function categoryPrice(nightBase: number, category: GuestCategory): number {
  return applyAdjust(nightBase, category.adjust);
}

/** Příplatek za jednu osobu dané kategorie za noc (režim „za nemovitost"). */
export function categorySurcharge(nightBase: number, category: GuestCategory): number {
  return category.adjust.unit === "czk"
    ? Math.round(category.adjust.value)
    : Math.round((nightBase * category.adjust.value) / 100);
}

/**
 * Co host za jednu osobu dané kategorie a noc reálně zaplatí navíc.
 * V režimu „za osobu" je to celá cena osoby, v režimu „za nemovitost" příplatek.
 */
export function perGuestNightPrice(cfg: PricingConfig, nightIso: string, category: GuestCategory): number {
  const { price } = baseNightPrice(cfg, nightIso);
  return cfg.pricingMode === "person" ? categoryPrice(price, category) : categorySurcharge(price, category);
}

/** KROK 2 — cena noci pro konkrétní skladbu hostů. */
export function nightPrice(cfg: PricingConfig, nightIso: string, counts: GuestCounts): { price: number; note: string } {
  const { price: base, note } = baseNightPrice(cfg, nightIso);
  const categories = pricedCategories(cfg);

  if (cfg.pricingMode === "person") {
    const total = categories.reduce(
      (sum, c) => sum + categoryPrice(base, c) * (counts[c.key] ?? 0),
      0
    );
    return { price: total, note };
  }

  const surcharge = categories.reduce(
    (sum, c) => sum + categorySurcharge(base, c) * (counts[c.key] ?? 0),
    0
  );
  return { price: Math.max(0, base + surcharge), note };
}

/** Rozpočet celého pobytu [startIso, endIso) — noc po noci, seskupeno do řádků, plus poplatky. */
export function quoteStay(cfg: PricingConfig, startIso: string, endIso: string, counts: GuestCounts): Quote {
  const start = isoDate(startIso);
  const end = isoDate(endIso);
  const lines = new Map<string, QuoteLine>();
  let nights = 0;
  let nightsTotal = 0;

  for (let d = start; d < end && nights < 366; d = nextISO(d)) {
    const { price, note } = nightPrice(cfg, d, counts);
    nights += 1;
    nightsTotal += price;
    const key = `${price}|${note}`;
    const line = lines.get(key) ?? { count: 0, price, note };
    line.count += 1;
    lines.set(key, line);
  }

  const fees: QuoteFee[] = [];
  if (nights > 0 && cfg.cleaningFee) {
    fees.push({ key: "cleaning", label: "Úklid", detail: "jednorázově", amount: cfg.cleaningFee });
  }
  const taxable = taxableCount(counts, pricedCategories(cfg));
  if (nights > 0 && cfg.touristTax && taxable > 0) {
    fees.push({
      key: "tax",
      label: "Poplatek z pobytu",
      detail: `${cfg.touristTax} Kč × ${taxable} ${plural(taxable, "osoba", "osoby", "osob")} × ${nights} ${plural(nights, "noc", "noci", "nocí")}`,
      amount: cfg.touristTax * taxable * nights,
    });
  }
  const feesTotal = fees.reduce((sum, f) => sum + f.amount, 0);

  return { nights, nightsTotal, feesTotal, total: nightsTotal + feesTotal, lines: [...lines.values()], fees };
}

export function czk(n: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(n);
}
