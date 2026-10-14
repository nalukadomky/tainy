import "server-only";
import type { Reservation, Site } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptGuest, encryptGuest, parseCheckinToken, verifyCheckinToken } from "@/lib/guest-crypto";
import { guestCounts } from "@/lib/stay-mail";
import { taxableCount } from "@/lib/guests";
import { addDays, toISO } from "@/lib/stay";
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

export type StoredPerson = { position: number; person: GuestPerson; filledBy: string; updatedAt: Date };

/** Dešifrované osoby rezervace (seřazené podle pozice). */
export async function readPersons(reservationId: string): Promise<StoredPerson[]> {
  const rows = await prisma.guestRecord.findMany({ where: { reservationId }, orderBy: { position: "asc" } });
  return rows.map((row) => ({
    position: row.position,
    person: decryptGuest<GuestPerson>(row.data, aad(reservationId, row.position)),
    filledBy: row.filledBy,
    updatedAt: row.updatedAt,
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

export type MissingRow = { reservationId: string; guestName: string; start: string; end: string; filled: number; total: number };

/** Osoby a souhrn poplatku za období. Dešifruje jen na serveru, doklady zkracuje. */
export async function buildBook(site: Site, period: string) {
  const range = periodRange(period);
  if (!range) return null;
  const from = new Date(`${range.start}T00:00:00.000Z`);
  const to = new Date(`${range.end}T00:00:00.000Z`);
  // Pobyty, které mají v období aspoň jednu noc
  const reservations = await prisma.reservation.findMany({
    where: { siteId: site.id, status: { not: "cancelled" }, startDate: { lt: to }, endDate: { gt: from } },
    include: { guestRecords: { orderBy: { position: "asc" } } },
    orderBy: { startDate: "asc" },
  });
  const rate = site.touristTax;
  const rows: BookRow[] = [];
  const missing: MissingRow[] = [];
  let collected = 0;

  for (const r of reservations) {
    const start = toISO(r.startDate);
    const end = toISO(r.endDate);
    const nights = nightsWithin(start, end, range.start, range.end);
    if (!nights) continue;
    const total = slotsOf(r, site).length;
    // Vybráno od hostů: poplatek v ceně zaplacené rezervace (podle ceníku)
    if (r.status === "paid" && r.source !== "demo") {
      const { categories, counts } = guestCounts(r, site);
      collected += rate * taxableCount(counts, categories) * nights;
    }
    if (r.guestRecords.length < total && r.source !== "demo")
      missing.push({ reservationId: r.id, guestName: r.guestName, start, end, filled: r.guestRecords.length, total });
    const stayNights = nightsWithin(start, end, start, end);
    for (const g of r.guestRecords) {
      let p: GuestPerson;
      try {
        p = decryptGuest<GuestPerson>(g.data, aad(r.id, g.position));
      } catch {
        continue;
      }
      const exemption = exemptionOf(p, start, stayNights);
      rows.push({
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
  }

  const remittance = await prisma.taxRemittance.findUnique({ where: { siteId_period: { siteId: site.id, period } } });
  const summary = {
    people: rows.length,
    personNights: rows.reduce((s, x) => s + x.nights, 0),
    exempt: rows.filter((x) => x.exemption).length,
    taxDue: rows.reduce((s, x) => s + x.tax, 0),
    collected,
    rate,
    foreign: rows.filter((x) => x.foreign).length,
  };
  return {
    period,
    range,
    rows,
    missing,
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
