// Dárkové poukazy k prodeji na webu — sdílené typy a výpočty (klient i server).
//
// Dva druhy: „value“ = částka na pobyt, „weekend“ = víkend pá–ne (2 noci) pro
// daný počet osob. Po zaplacení vznikne jednorázový kód (Voucher, gift) v
// hodnotě poukazu — při rezervaci se odečte z ceny, v dražším termínu host
// doplatí rozdíl.

import { czk, plural } from "@/lib/pricing";

export type GiftKind = "value" | "weekend";
export type GiftTemplate = "klasik" | "fotka" | "minimal" | "tma";

export type GiftDesign = {
  kind: GiftKind;
  value: number; // u „value“ hodnota poukazu
  persons: number; // u „weekend“
  price: number; // prodejní cena (u „value“ = hodnota)
  headline: string; // vlastní nadpis, prázdné = podle obsahu
  message: string;
  /** Jen u objednávky: komu je poukaz („Pro Janu a Honzu“), jak to kupující napsal — tučně nad věnováním. */
  recipient?: string;
  validMonths: number;
  template: GiftTemplate;
  color: string;
  photo: string;
};

export const WEEKEND_NIGHTS = 2;

/** E-mail vypadá skutečně: jmeno@domena.cz (bez mezer, dvou teček za sebou, s koncovkou z písmen). */
export const isLikelyEmail = (v: string) =>
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(v.trim());

/** Jméno i příjmení — aspoň dvě slova. */
export const isFullName = (v: string) => v.trim().split(/\s+/).filter((w) => w.length >= 1).length >= 2 && v.trim().length >= 4;

export const GIFT_TEMPLATES: { key: GiftTemplate; label: string }[] = [
  { key: "klasik", label: "Klasik" },
  { key: "fotka", label: "Fotka" },
  { key: "minimal", label: "Minimal" },
  { key: "tma", label: "Tma" },
];

export const VALID_MONTHS = [6, 12, 24];

export const defaultGift = (photo = ""): GiftDesign => ({
  kind: "value",
  value: 3000,
  persons: 2,
  price: 3000,
  headline: "",
  message: "Na pobyt, kdy se vám to bude hodit. Stačí si vybrat termín.",
  validMonths: 12,
  template: "klasik",
  color: "#2c5e3f",
  photo,
});

export const giftHeadline = (d: Pick<GiftDesign, "kind" | "value" | "persons" | "headline">) =>
  d.headline.trim() ||
  (d.kind === "value" ? czk(d.value) : `Víkend pro ${d.persons === 2 ? "dva" : `${d.persons} ${plural(d.persons, "osobu", "osoby", "osob")}`}`);

/** Hodnota kódu po zaplacení: u částky hodnota, u víkendu zaplacená cena. */
export const giftCodeValue = (d: Pick<GiftDesign, "kind" | "value" | "price">) => (d.kind === "value" ? d.value : d.price);

/** Cena běžné víkendové noci podle ceníku webu (víkendová úprava, cena za osobu). */
export function weekendNight(site: { pricePerNight: number; weekendValue: number; weekendUnit: string; pricingMode: string }, persons: number) {
  const base = site.weekendUnit === "czk" && site.weekendValue > 0 ? site.weekendValue : Math.round(site.pricePerNight * (1 + (site.weekendUnit === "czk" ? 0 : site.weekendValue) / 100));
  return site.pricingMode === "person" ? base * persons : base;
}

const HEX = /^#[0-9a-f]{6}$/i;
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Očistí návrh poukazu z formuláře (server i klient). */
export function cleanGift(raw: unknown): GiftDesign {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind: GiftKind = r.kind === "weekend" ? "weekend" : "value";
  const value = int(r.value, 100, 1_000_000, 3000);
  return {
    kind,
    value,
    persons: int(r.persons, 1, 20, 2),
    price: kind === "value" ? value : int(r.price, 100, 1_000_000, 3000),
    headline: text(r.headline, 60),
    message: text(r.message, 240),
    validMonths: VALID_MONTHS.includes(Number(r.validMonths)) ? Number(r.validMonths) : 12,
    template: GIFT_TEMPLATES.some((t) => t.key === r.template) ? (r.template as GiftTemplate) : "klasik",
    color: typeof r.color === "string" && HEX.test(r.color) ? r.color.toLowerCase() : "#2c5e3f",
    photo: text(r.photo, 600),
  };
}

export const GIFT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Čeká na platbu", cls: "bg-amber/20 text-[#92600a]" },
  paid: { label: "Zaplaceno", cls: "bg-pine/10 text-pine" },
  used: { label: "Uplatněno", cls: "bg-bg text-soft" },
  cancelled: { label: "Zrušeno", cls: "bg-bg text-soft line-through" },
};
