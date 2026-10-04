// Pravidla pobytu a práce s termíny — čistá logika bez databáze,
// aby ji mohl použít rezervační widget v prohlížeči i API na serveru.
// Hlášky jsou tím pádem na obou stranách stejné.

import { plural } from "@/lib/pricing";
import { capacityCount, type GuestCategory, type GuestCounts } from "@/lib/guests";

export type Range = { start: string; end: string }; // ISO yyyy-mm-dd, end = den odjezdu (exklusivně)

export type StayRules = {
  minNights: number;
  leadTimeDays: number;
  maxGuests: number;
  /** Kategorie, se kterými se počítá kapacita — z `pricedCategories`. */
  categories: GuestCategory[];
};

/** Datum pobytu z databáze (sloupec typu DATE = UTC půlnoc) na ISO yyyy-mm-dd. */
export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO yyyy-mm-dd na Date pro uložení do sloupce typu DATE. */
export function fromISO(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

/** Dnešek v lokálním čase jako ISO yyyy-mm-dd. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Posune ISO datum o `days` dní. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function nightsOf(startIso: string, endIso: string): number {
  const ms = fromISO(endIso).getTime() - fromISO(startIso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Nejdřívější možný den příjezdu podle `leadTimeDays`. */
export function earliestArrival(rules: Pick<StayRules, "leadTimeDays">): string {
  return addDays(todayISO(), Math.max(0, rules.leadTimeDays));
}

/** Nepřekrývá se [start, end) s žádným obsazeným rozsahem? */
export function isRangeFree(blocked: Range[], startIso: string, endIso: string): boolean {
  return !blocked.some((b) => b.start < endIso && b.end > startIso);
}

/**
 * Ověří termín proti pravidlům pobytu. Vrací chybovou hlášku, nebo null když je vše v pořádku.
 * Volá se ve widgetu (okamžitá zpětná vazba) i v API (autoritativně).
 */
export function validateStay(
  rules: StayRules,
  startIso: string,
  endIso: string,
  counts: GuestCounts
): string | null {
  const nights = nightsOf(startIso, endIso);
  if (nights < 1) return "Den odjezdu musí být až po dni příjezdu.";
  if (nights > 365) return "Pobyt je příliš dlouhý.";

  const earliest = earliestArrival(rules);
  if (startIso < earliest) {
    return rules.leadTimeDays > 0
      ? `Rezervovat lze nejdříve ${rules.leadTimeDays} ${plural(rules.leadTimeDays, "den", "dny", "dní")} předem.`
      : "Termín už je v minulosti.";
  }

  const min = Math.max(1, rules.minNights);
  if (nights < min) {
    return `Nejkratší možný pobyt je ${min} ${plural(min, "noc", "noci", "nocí")}.`;
  }

  // Do kapacity se počítají jen kategorie, které lůžko opravdu zaberou.
  const obsazenost = capacityCount(counts, rules.categories);
  if (obsazenost < 1) return "Vyber aspoň jednoho hosta.";
  if (obsazenost > rules.maxGuests) {
    return `Ubytování je pro nejvýš ${rules.maxGuests} ${plural(rules.maxGuests, "hosta", "hosty", "hostů")}.`;
  }

  // Nezletilí sami nerezervují — v rozdělené skladbě musí přijet dospělý.
  const dospeli = rules.categories.find((c) => c.key === "adult");
  if (dospeli && (counts.adult ?? 0) < 1) {
    return "Rezervaci musí doprovázet aspoň jeden dospělý.";
  }

  return null;
}

/** Krátký kód rezervace do veřejného odkazu — bez znaků, které jdou splést (0/O, 1/I). */
export function newPublicId(): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  let out = "";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** Čas ve tvaru HH:MM (check-in / check-out). */
export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

type Times = { checkInTime: string; checkOutTime: string };

/**
 * Check-in / check-out pobytu: časy uložené u rezervace, a když chybí
 * (rezervace z doby před ukládáním časů), časy webu.
 */
export function stayTimes(reservation: Partial<Times>, site: Times): Times {
  return {
    checkInTime: isTime(reservation.checkInTime) ? reservation.checkInTime : site.checkInTime,
    checkOutTime: isTime(reservation.checkOutTime) ? reservation.checkOutTime : site.checkOutTime,
  };
}
