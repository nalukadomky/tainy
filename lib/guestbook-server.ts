import "server-only";
import type { Reservation, Site } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptGuest, encryptGuest, parseCheckinToken, verifyCheckinToken } from "@/lib/guest-crypto";
import { guestCounts } from "@/lib/stay-mail";
import { taxableCount } from "@/lib/guests";
import { addDays, toISO } from "@/lib/stay";
import { ubyportDeadline } from "@/lib/workdays";
import {
  exemptionOf,
  isForeign,
  maskDoc,
  nightsWithin,
  periodRange,
  slotsFor,
  type GuestPerson,
  type Slot,
} from "@/lib/guestbook";

// Kniha ubytovaných na serveru: ukládání a čtení šifrovaných osob, stav
// check-inu, záznam přístupů a podklady pro přehled za období.

/** Jak dlouho se kniha uchovává (zákon o místních poplatcích: 6 let). */
export const RETENTION_YEARS = 6;

const aad = (reservationId: string, position: number) => `${reservationId}:${position}`;

export function slotsOf(r: Pick<Reservation, "guests" | "guestBreakdown">, site: Site): Slot[] {
  const { categories, counts } = guestCounts(r, site);
  return slotsFor(counts, categories, r.guests);
}

export type StoredPerson = { position: number; person: GuestPerson; filledBy: string; updatedAt: Date; reportedAt: Date | null };

/** Dešifrované osoby rezervace (seřazené podle pozice). */
export async function readPersons(reservationId: string): Promise<StoredPerson[]> {
  const rows = await prisma.guestRecord.findMany({ where: { reservationId }, orderBy: { position: "asc" } });
  return rows.map((row) => ({
    position: row.position,
    person: decryptGuest<GuestPerson>(row.data, aad(reservationId, row.position)),
    filledBy: row.filledBy,
    updatedAt: row.updatedAt,
    reportedAt: row.reportedAt,
  }));
}

/** Uloží (zašifruje) osobu a přepočítá, jestli je check-in kompletní. */
export async function savePerson(
  r: Pick<Reservation, "id" | "siteId" | "endDate" | "guests" | "guestBreakdown">,
  site: Site,
  position: number,
  person: GuestPerson,
  filledBy: "guest" | "owner",
): Promise<{ done: boolean; filled: number; total: number }> {
  const data = encryptGuest(person, aad(r.id, position));
  const purgeAt = new Date(r.endDate);
  purgeAt.setUTCFullYear(purgeAt.getUTCFullYear() + RETENTION_YEARS);
  await prisma.guestRecord.upsert({
    where: { reservationId_position: { reservationId: r.id, position } },
    create: { reservationId: r.id, siteId: r.siteId, position, data, foreign: isForeign(person), filledBy, purgeAt },
    update: { data, foreign: isForeign(person), filledBy, purgeAt },
  });
  return refreshDone(r, site);
}

/** Smaže osobu z knihy (majitel). */
export async function deletePerson(r: Pick<Reservation, "id" | "guests" | "guestBreakdown">, site: Site, position: number) {
  await prisma.guestRecord.deleteMany({ where: { reservationId: r.id, position } });
  return refreshDone(r, site);
}

/** Check-in je hotový, když jsou vyplněné všechny pozice pobytu. */
export async function refreshDone(r: Pick<Reservation, "id" | "guests" | "guestBreakdown">, site: Site) {
  const total = slotsOf(r, site).length;
  const filled = await prisma.guestRecord.count({ where: { reservationId: r.id, position: { lt: total } } });
  const done = filled >= total;
  await prisma.reservation.update({ where: { id: r.id }, data: { checkinDoneAt: done ? new Date() : null } });
  return { done, filled, total };
}

/** Záznam o tom, kdo si údaje zobrazil, exportoval nebo upravil. */
export async function logAccess(siteId: string, userEmail: string | undefined, action: "view" | "export" | "edit" | "delete", target = "") {
  await prisma.guestAccessLog
    .create({ data: { siteId, userEmail: userEmail ?? "", action, target: target.slice(0, 200) } })
    .catch(() => {});
}

/* ---------- Přehled za období ---------- */

export type BookRow = {
  reservationId: string;
  publicId: string;
  position: number;
  start: string;
  end: string;
  name: string;
  birthDate: string;
  nationality: string;
  doc: string; // zkrácené
  docType: string;
  city: string;
  country: string;
  foreign: boolean;
  exemption: string | null;
  nights: number; // nocí v období
  tax: number;
};


/** Pobyt v přehledu knihy: stav check-inu a poplatek (z knihy, nebo odhad podle rezervace). */
export type BookStay = {
  reservationId: string;
  guestName: string;
  start: string;
  end: string;
  nights: number; // nocí v období
  total: number; // osob k vyplnění
  filled: number;
  started: boolean; // příjezd dnes nebo dřív
  paid: boolean;
  tax: number;
  estimated: boolean; // check-in neúplný → poplatek podle rezervace
};

/**
 * Kniha za období: osoby (dešifrované jen tady, doklady zkrácené), pobyty se
 * stavem check-inu a souhrn poplatku. Pobyt s kompletním check-inem se počítá
 * z knihy (věk, osvobození), ostatní odhadem podle skladby rezervace.
 */
export async function buildBook(site: Site, period: string) {
  const range = periodRange(period);
  if (!range) return null;
  const from = new Date(`${range.start}T00:00:00.000Z`);
  const to = new Date(`${range.end}T00:00:00.000Z`);
  const today = toISO(new Date());
  // Rezervace i odvod obci za období souběžně (každý dotaz je cesta do databáze)
  const [reservations, remittance] = await Promise.all([
    prisma.reservation.findMany({
      where: { siteId: site.id, status: { not: "cancelled" }, source: { not: "demo" }, startDate: { lt: to }, endDate: { gt: from } },
      include: { guestRecords: { orderBy: { position: "asc" } } },
      orderBy: { startDate: "asc" },
    }),
    prisma.taxRemittance.findUnique({ where: { siteId_period: { siteId: site.id, period } } }),
  ]);
  const rate = site.touristTax;
  const rows: BookRow[] = [];
  const stays: BookStay[] = [];
  let collected = 0;
  let personNights = 0;

  for (const r of reservations) {
    const start = toISO(r.startDate);
    const end = toISO(r.endDate);
    const nights = nightsWithin(start, end, range.start, range.end);
    if (!nights) continue;
    const total = slotsOf(r, site).length;
    const { categories, counts } = guestCounts(r, site);
    const fromPrice = rate * taxableCount(counts, categories) * nights;
    // Vybráno od hostů: poplatek v ceně zaplacené rezervace (podle ceníku)
    if (r.status === "paid") collected += fromPrice;
    const stayNights = nightsWithin(start, end, start, end);
    const people: BookRow[] = [];
    for (const g of r.guestRecords) {
      let p: GuestPerson;
      try {
        p = decryptGuest<GuestPerson>(g.data, aad(r.id, g.position));
      } catch {
        continue;
      }
      const exemption = exemptionOf(p, start, stayNights);
      people.push({
        reservationId: r.id,
        publicId: r.publicId,
        position: g.position,
        start,
        end,
        name: `${p.firstName} ${p.lastName}`.trim(),
        birthDate: p.birthDate,
        nationality: p.nationality,
        doc: p.docNumber ? maskDoc(p.docNumber) : "",
        docType: p.docType,
        city: p.city,
        country: p.country,
        foreign: isForeign(p),
        exemption,
        nights,
        tax: exemption ? 0 : rate * nights,
      });
    }
    rows.push(...people);
    const complete = people.length >= total;
    personNights += complete ? people.length * nights : total * nights;
    stays.push({
      reservationId: r.id,
      guestName: r.guestName,
      start,
      end,
      nights,
      total,
      filled: people.length,
      started: start <= today,
      paid: r.status === "paid",
      tax: complete ? people.reduce((sum, x) => sum + x.tax, 0) : fromPrice,
      estimated: !complete,
    });
  }

  const summary = {
    expectedPeople: stays.reduce((sum, x) => sum + x.total, 0),
    people: rows.length,
    personNights,
    exempt: rows.filter((x) => x.exemption).length,
    taxDue: stays.reduce((sum, x) => sum + x.tax, 0),
    taxEstimated: stays.filter((x) => x.estimated).reduce((sum, x) => sum + x.tax, 0),
    collected,
    rate,
    foreign: rows.filter((x) => x.foreign).length,
  };
  return {
    period,
    range,
    /** Období skončilo (poslední den je před dneškem) — teprve pak se odvádí. */
    ended: range.end <= today,
    rows,
    stays,
    /** Pobyty, které už začaly a nemají kompletní check-in. */
    missing: stays.filter((x) => x.started && x.filled < x.total),
    summary,
    remittance: remittance && { amount: remittance.amount, paidAt: toISO(remittance.paidAt), note: remittance.note },
  };
}

/** Plné (dešifrované) osoby za období — jen pro export. */
export async function personsForExport(site: Site, period: string, onlyForeign = false) {
  const range = periodRange(period);
  if (!range) return [];
  const records = await prisma.guestRecord.findMany({
    where: {
      siteId: site.id,
      ...(onlyForeign && { foreign: true }),
      reservation: {
        status: { not: "cancelled" },
        startDate: { lt: new Date(`${range.end}T00:00:00.000Z`) },
        endDate: { gt: new Date(`${range.start}T00:00:00.000Z`) },
      },
    },
    include: { reservation: { select: { id: true, publicId: true, startDate: true, endDate: true } } },
    orderBy: [{ reservation: { startDate: "asc" } }, { position: "asc" }],
  });
  return records.flatMap((g) => {
    try {
      const person = decryptGuest<GuestPerson>(g.data, aad(g.reservationId, g.position));
      const start = toISO(g.reservation.startDate);
      const end = toISO(g.reservation.endDate);
      return [{ person, start, end, publicId: g.reservation.publicId, nights: nightsWithin(start, end, range.start, range.end), stayNights: nightsWithin(start, end, start, end) }];
    } catch {
      return [];
    }
  });
}

/** Do kdy platí odkaz na check-in (2 dny po odjezdu). */
export const checkinOpen = (r: Pick<Reservation, "status" | "endDate">) =>
  r.status !== "cancelled" && addDays(toISO(r.endDate), 2) >= toISO(new Date());

/** Rezervace podle tokenu z odkazu na check-in (null = neplatný nebo prošlý odkaz). */
export async function resolveCheckin(token: string) {
  const parsed = parseCheckinToken(token);
  if (!parsed) return null;
  const r = await prisma.reservation.findUnique({ where: { publicId: parsed.publicId }, include: { site: true } });
  if (!r || !verifyCheckinToken(parsed.sig, r) || !checkinOpen(r) || !r.site.checkinEnabled) return null;
  return r;
}

/** Stav check-inu pro hosta: kategorie osob a jen křestní jméno s iniciálou u vyplněných. */
export async function guestView(r: Reservation & { site: Site }) {
  const slots = slotsOf(r, r.site);
  const persons = await readPersons(r.id);
  return slots.map((s) => {
    const p = persons.find((x) => x.position === s.position)?.person;
    return { ...s, filled: !!p, name: p ? `${p.firstName} ${p.lastName.charAt(0)}.` : "" };
  });
}

/* ---------- Hlášení cizinců (Ubyport) ---------- */

// Cizince je potřeba nahlásit do 3 pracovních dnů ode dne ubytování. Seznam
// „k nahlášení“ = cizinci z knihy, kteří ještě nejsou označení jako nahlášení,
// s příjezdem v posledních 90 dnech nebo v příštích 30 dnech.

export type PendingForeigner = {
  reservationId: string;
  position: number;
  name: string;
  nationality: string;
  start: string;
  end: string;
  deadline: string;
};

function pendingWhere(siteId: string) {
  const today = new Date(`${toISO(new Date())}T00:00:00.000Z`);
  return {
    siteId,
    foreign: true,
    reportedAt: null,
    reservation: {
      status: { not: "cancelled" },
      startDate: { gte: new Date(today.getTime() - 90 * 86_400_000), lte: new Date(today.getTime() + 30 * 86_400_000) },
    },
  };
}

/** Cizinci k nahlášení (dešifrovaní kvůli jménu), nejbližší lhůta první. */
export async function pendingForeigners(siteId: string): Promise<{ list: PendingForeigner[]; persons: { person: GuestPerson; start: string; end: string }[] }> {
  const rows = await prisma.guestRecord.findMany({
    where: pendingWhere(siteId),
    include: { reservation: { select: { startDate: true, endDate: true } } },
  });
  const out = rows.flatMap((g) => {
    try {
      const person = decryptGuest<GuestPerson>(g.data, aad(g.reservationId, g.position));
      const start = toISO(g.reservation.startDate);
      const end = toISO(g.reservation.endDate);
      return [{ person, item: { reservationId: g.reservationId, position: g.position, name: `${person.firstName} ${person.lastName}`.trim(), nationality: person.nationality, start, end, deadline: ubyportDeadline(start) } }];
    } catch {
      return [];
    }
  });
  out.sort((a, b) => a.item.deadline.localeCompare(b.item.deadline) || a.item.name.localeCompare(b.item.name, "cs"));
  return { list: out.map((x) => x.item), persons: out.map((x) => ({ person: x.person, start: x.item.start, end: x.item.end })) };
}

/** Počet cizinců k nahlášení a nejbližší lhůta — bez dešifrování (přehled, e-mail). */
export async function pendingSummary(siteId: string): Promise<{ count: number; deadline: string | null }> {
  const rows = await prisma.guestRecord.findMany({ where: pendingWhere(siteId), select: { reservation: { select: { startDate: true } } } });
  const deadlines = rows.map((r) => ubyportDeadline(toISO(r.reservation.startDate))).sort();
  return { count: rows.length, deadline: deadlines[0] ?? null };
}

/** Označí cizince jako nahlášené (null = vrátit zpět). */
export async function markReported(siteId: string, items: { reservationId: string; position: number }[], at: Date | null) {
  let count = 0;
  for (const i of items.slice(0, 200)) {
    const r = await prisma.guestRecord.updateMany({
      where: { siteId, reservationId: String(i.reservationId), position: Number(i.position), foreign: true },
      data: { reportedAt: at },
    });
    count += r.count;
  }
  return count;
}
