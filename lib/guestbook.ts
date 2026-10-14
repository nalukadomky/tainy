// Kniha ubytovaných: údaje osoby z check-inu, ověření, počet osob k vyplnění,
// poplatek z pobytu a období odvodu. Čisté funkce — sdílí je formulář hosta,
// administrace i server (šifrování je zvlášť v lib/guest-crypto.ts).
//
// Co zákon chce:
//   • evidence pro poplatek z pobytu (zákon 565/1990 Sb., § 3g): jméno, datum
//     narození, adresa trvalého pobytu, číslo dokladu, doba pobytu, osvobození;
//   • u cizinců navíc hlášení policii (Ubyport): státní občanství, vízum, účel pobytu.

import { COUNTRY_OPTIONS, countryName, isCountry } from "@/lib/countries";
import type { GuestCategory, GuestCounts } from "@/lib/guests";
import { addDays, isIsoDate, nightsOf, todayISO } from "@/lib/stay";

export type DocType = "op" | "pas" | "jiny";
export type Exempt = "" | "ztp" | "other";

export type GuestPerson = {
  firstName: string;
  lastName: string;
  birthDate: string; // yyyy-mm-dd
  nationality: string; // ISO alpha-3
  docType: DocType;
  docNumber: string;
  street: string;
  city: string;
  zip: string;
  country: string; // stát bydliště, ISO alpha-3
  visa: string;
  purpose: string; // kód účelu pobytu pro Ubyport
  exempt: Exempt;
  note: string;
};

export const DOC_TYPES: [DocType, string][] = [
  ["op", "Občanský průkaz"],
  ["pas", "Cestovní pas"],
  ["jiny", "Jiný doklad"],
];
export const docTypeLabel = (t: string) => DOC_TYPES.find(([k]) => k === t)?.[1] ?? "Doklad";
export const docTypeShort = (t: string) => (t === "pas" ? "Pas" : t === "op" ? "OP" : "Doklad");

/** Účel pobytu cizince — číselník Ubyportu. */
export const PURPOSES: [string, string][] = [
  ["10", "Turistika"],
  ["03", "Návštěva rodiny nebo přátel"],
  ["01", "Obchodní / služební cesta"],
  ["27", "Zaměstnání"],
  ["11", "Studium, školení, stáž"],
  ["02", "Kulturní"],
  ["07", "Sportovní"],
  ["00", "Zdravotní"],
  ["06", "Podnikání (OSVČ)"],
  ["12", "Tranzit (průjezd)"],
  ["99", "Ostatní"],
];

export const EXEMPTIONS: [Exempt, string][] = [
  ["", "Bez osvobození"],
  ["ztp", "Držitel ZTP/P nebo jeho průvodce"],
  ["other", "Jiný důvod podle vyhlášky obce"],
];

export { COUNTRY_OPTIONS, countryName };

/** Prázdná osoba (formulář); hlavní host dostane jméno z rezervace. */
export function emptyPerson(name = ""): GuestPerson {
  const [first, ...rest] = name.trim().split(/\s+/);
  return {
    firstName: first ?? "",
    lastName: rest.join(" "),
    birthDate: "",
    nationality: "CZE",
    docType: "op",
    docNumber: "",
    street: "",
    city: "",
    zip: "",
    country: "CZE",
    visa: "",
    purpose: "10",
    exempt: "",
    note: "",
  };
}

export const isForeign = (p: Pick<GuestPerson, "nationality">) => p.nationality !== "CZE";
export const fullName = (p: Pick<GuestPerson, "firstName" | "lastName">) => `${p.firstName} ${p.lastName}`.trim();

/** Věk v den `on` (celé roky). */
export function ageAt(birthIso: string, onIso: string): number {
  const [by, bm, bd] = birthIso.split("-").map(Number);
  const [y, m, d] = onIso.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Od kolika let je číslo dokladu povinné (OP se vydává od 15 let). */
export const DOC_REQUIRED_AGE = 15;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/**
 * Ověří a očistí osobu z formuláře. `arrival` = den příjezdu (věk kvůli dokladu).
 * Vrací chybu s názvem pole, aby ji formulář ukázal u správného políčka.
 */
export function validatePerson(raw: unknown, arrival: string): { person: GuestPerson } | { error: string; field: keyof GuestPerson } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p: GuestPerson = {
    firstName: text(r.firstName, 60),
    lastName: text(r.lastName, 60),
    birthDate: text(r.birthDate, 10),
    nationality: isCountry(r.nationality) ? r.nationality : "CZE",
    docType: DOC_TYPES.some(([k]) => k === r.docType) ? (r.docType as DocType) : "op",
    docNumber: text(r.docNumber, 30).toUpperCase(),
    street: text(r.street, 120),
    city: text(r.city, 80),
    zip: text(r.zip, 12),
    country: isCountry(r.country) ? r.country : "CZE",
    visa: text(r.visa, 30).toUpperCase(),
    purpose: PURPOSES.some(([k]) => k === r.purpose) ? String(r.purpose) : "10",
    exempt: EXEMPTIONS.some(([k]) => k === r.exempt) ? (r.exempt as Exempt) : "",
    note: text(r.note, 300),
  };
  if (!p.firstName) return { error: "Doplň jméno.", field: "firstName" };
  if (!p.lastName) return { error: "Doplň příjmení.", field: "lastName" };
  if (!isIsoDate(p.birthDate) || p.birthDate > todayISO() || p.birthDate < "1900-01-01")
    return { error: "Zkontroluj datum narození.", field: "birthDate" };
  if (ageAt(p.birthDate, arrival) >= DOC_REQUIRED_AGE && !p.docNumber)
    return { error: "Doplň číslo dokladu.", field: "docNumber" };
  if (!p.street) return { error: "Doplň ulici a číslo domu.", field: "street" };
  if (!p.city) return { error: "Doplň obec nebo město.", field: "city" };
  if (!isForeign(p)) {
    p.visa = "";
    p.purpose = "10";
  }
  return { person: p };
}

/* ---------- Kdo má check-in vyplnit ---------- */

export type Slot = { position: number; label: string };

/** Osoby pobytu (bez psů) s kategorií podle skladby rezervace. */
export function slotsFor(counts: GuestCounts, categories: GuestCategory[], fallbackGuests: number): Slot[] {
  const labels: string[] = [];
  for (const c of categories) {
    if (c.key === "dog") continue;
    const label = c.key === "adult" ? "dospělý" : c.label.replace(/^Děti/i, "dítě").toLowerCase();
    for (let i = 0; i < (counts[c.key] ?? 0); i++) labels.push(label);
  }
  if (!labels.length) for (let i = 0; i < Math.max(1, fallbackGuests); i++) labels.push("host");
  return labels.slice(0, 50).map((label, i) => ({ position: i, label }));
}

/* ---------- Poplatek z pobytu ---------- */

/** Poplatek se platí za pobyt nejvýše 60 po sobě jdoucích dní (§ 3a). */
export const TAX_MAX_NIGHTS = 60;

/** Proč osoba poplatek neplatí (null = platí). Do 18 let se pozná z data narození. */
export function exemptionOf(p: Pick<GuestPerson, "birthDate" | "exempt">, arrival: string, nights: number): string | null {
  if (nights > TAX_MAX_NIGHTS) return "pobyt nad 60 dní";
  if (p.birthDate && ageAt(p.birthDate, arrival) < 18) return "do 18 let";
  if (p.exempt === "ztp") return "ZTP/P";
  if (p.exempt === "other") return "jiný důvod";
  return null;
}

/** Noci pobytu, které spadají do období [from, to). */
export function nightsWithin(start: string, end: string, from: string, to: string): number {
  const s = start > from ? start : from;
  const e = end < to ? end : to;
  return e > s ? nightsOf(s, e) : 0;
}

/* ---------- Období odvodu ---------- */

export type TaxPeriod = "month" | "quarter" | "half" | "year";
export const TAX_PERIODS: [TaxPeriod, string][] = [
  ["month", "měsíčně"],
  ["quarter", "čtvrtletně"],
  ["half", "pololetně"],
  ["year", "ročně"],
];
export const isTaxPeriod = (v: unknown): v is TaxPeriod => TAX_PERIODS.some(([k]) => k === v);

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Klíč období, do kterého patří den: 2026-11 / 2026-Q4 / 2026-H2 / 2026. */
export function periodKey(iso: string, period: TaxPeriod): string {
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  if (period === "month") return `${y}-${pad(m)}`;
  if (period === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
  if (period === "half") return `${y}-H${m <= 6 ? 1 : 2}`;
  return y;
}

/** Rozsah období [start, end) v ISO. */
export function periodRange(key: string): { start: string; end: string } | null {
  let m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return { start: `${y}-${pad(mo)}-01`, end: mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01` };
  }
  m = /^(\d{4})-Q([1-4])$/.exec(key);
  if (m) {
    const y = Number(m[1]);
    const q = Number(m[2]);
    return { start: `${y}-${pad(q * 3 - 2)}-01`, end: q === 4 ? `${y + 1}-01-01` : `${y}-${pad(q * 3 + 1)}-01` };
  }
  m = /^(\d{4})-H([12])$/.exec(key);
  if (m) {
    const y = Number(m[1]);
    return m[2] === "1" ? { start: `${y}-01-01`, end: `${y}-07-01` } : { start: `${y}-07-01`, end: `${y + 1}-01-01` };
  }
  m = /^(\d{4})$/.exec(key);
  if (m) return { start: `${m[1]}-01-01`, end: `${Number(m[1]) + 1}-01-01` };
  return null;
}

export function periodLabel(key: string): string {
  let m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  m = /^(\d{4})-Q([1-4])$/.exec(key);
  if (m) return `${m[2]}. čtvrtletí ${m[1]}`;
  m = /^(\d{4})-H([12])$/.exec(key);
  if (m) return `${m[2]}. pololetí ${m[1]}`;
  return `rok ${key}`;
}

/** Posledních `count` období (nejnovější první), od období obsahujícího `from`. */
export function recentPeriods(period: TaxPeriod, count: number, from = todayISO()): string[] {
  const out: string[] = [];
  let day = from;
  while (out.length < count) {
    const key = periodKey(day, period);
    if (!out.includes(key)) out.push(key);
    const range = periodRange(key)!;
    day = addDays(range.start, -1);
  }
  return out;
}

/** Zkrácené číslo dokladu do přehledů: „2091•••“. */
export const maskDoc = (n: string) => (n ? `${n.slice(0, Math.min(4, Math.max(1, n.length - 3)))}•••` : "—");
