// Výpočet ceny pobytu sdílený mezi rezervačním widgetem a API.
//
// Ceník funguje jednoduše, noc po noci:
//   1. základ = cena za noc (režim „unit" = za celou nemovitost,
//      režim „person" = za osobu × počet hostů)
//   2. noci z pátku, soboty a neděle dostanou víkendovou přirážku v %
//   3. sezónní období (od–do včetně) přičtou / odečtou svá %
//   Procenta se sčítají a aplikují jednou na základ.
//
// Den příjezdu a den odjezdu se v kalendáři zobrazují jako půldny
// (odjíždějící host dopoledne, přijíždějící odpoledne) — účtují se
// ale klasicky noci mezi příjezdem a odjezdem.

export type PricingMode = "unit" | "person";

export type PriceRuleInput = {
  label: string;
  startDate: string; // ISO datum nebo datetime
  endDate: string;   // včetně
  pct: number;
};

export type PricingConfig = {
  pricePerNight: number;
  pricingMode: PricingMode;
  weekendPct: number;
  priceRules: PriceRuleInput[];
};

export type QuoteLine = {
  count: number;
  price: number; // cena jedné noci
  note: string;  // např. "víkend, Hlavní sezóna"
};

export type Quote = {
  nights: number;
  total: number;
  lines: QuoteLine[];
};

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

/** Cena jedné noci začínající v den `nightIso`. */
export function nightPrice(cfg: PricingConfig, nightIso: string, guests: number): { price: number; note: string } {
  const base = cfg.pricingMode === "person" ? cfg.pricePerNight * guests : cfg.pricePerNight;
  let pct = 0;
  const tags: string[] = [];

  const dow = dateFromISO(nightIso).getDay(); // 0 = ne, 5 = pá, 6 = so
  if (cfg.weekendPct && (dow === 5 || dow === 6 || dow === 0)) {
    pct += cfg.weekendPct;
    tags.push("víkend");
  }
  for (const rule of cfg.priceRules ?? []) {
    if (nightIso >= isoDate(rule.startDate) && nightIso <= isoDate(rule.endDate) && rule.pct !== 0) {
      pct += rule.pct;
      tags.push(rule.label || "sezóna");
    }
  }
  return { price: Math.max(0, Math.round(base * (1 + pct / 100))), note: tags.join(", ") };
}

/** Rozpočet celého pobytu [startIso, endIso) — noc po noci, seskupeno do řádků. */
export function quoteStay(cfg: PricingConfig, startIso: string, endIso: string, guests: number): Quote {
  const start = isoDate(startIso);
  const end = isoDate(endIso);
  const lines = new Map<string, QuoteLine>();
  let nights = 0;
  let total = 0;

  for (let d = start; d < end && nights < 366; d = nextISO(d)) {
    const { price, note } = nightPrice(cfg, d, guests);
    nights += 1;
    total += price;
    const key = `${price}|${note}`;
    const line = lines.get(key) ?? { count: 0, price, note };
    line.count += 1;
    lines.set(key, line);
  }

  return { nights, total, lines: [...lines.values()] };
}

export function czk(n: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(n);
}
