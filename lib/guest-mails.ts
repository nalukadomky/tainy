// E-maily hostovi při změně stavu rezervace (Nastavení → Automatizace):
//   Platba přijata — po označení „Zaplaceno“ (s odkladem, viz STATUS_MAIL_DELAY)
//   Zrušení        — po zrušení rezervace (stejný odklad)
//   Před příjezdem — X dní před příjezdem v 10:00 (denní cron), u rezervace
//                    zaplacené na poslední chvíli hned po potvrzení platby;
//                    kód k zámku zadaný až po odeslání se pošle znovu.
//   Check-in       — X dní před příjezdem v 10:00 odkaz na online check-in,
//                    ráno v den příjezdu připomínka, když ještě někdo chybí.
//
// Každý e-mail odejde nanejvýš jednou: před odesláním se „zabere“ atomickým
// updateMany (paralelní běh ho nepošle podruhé) a při selhání se uvolní.
// E-maily o zaplacení a zrušení jen rezervacím, které změnily stav po zavedení
// (paidAt / cancelledAt). „Před příjezdem“ a check-in dostanou všechny
// zaplacené rezervace (i starší bez paidAt). Testovací rezervace z vývoje
// (noGuestMail) nedostanou nikdy nic.

import type { Prisma, Reservation, Site } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl, logGuestMail, send } from "@/lib/email";
import { arrivalDaysOf, parseEmailSettings, renderEmail, SCHEDULED_TIME, type EmailKind } from "@/lib/email-templates";
import { cleaningStart } from "@/lib/cleaning";
import { addDays, toISO, todayISO } from "@/lib/stay";
import { loadReservation, stayMailOf } from "@/lib/stay-mail";
import { checkinToken, guestCryptoReady } from "@/lib/guest-crypto";
import { slotsOf } from "@/lib/guestbook-server";

/** Prostor na opravu omylu: e-mail o zaplacení / zrušení odejde až po téhle době. */
export const STATUS_MAIL_DELAY = 30_000;

type Loaded = Reservation & { site: Site };

/** Stav trvá celý odklad (přepnutí tam a zpět a znovu odklad prodlouží). Sekunda rezerva na časovač. */
const settled = (at: Date) => Date.now() - at.getTime() >= STATUS_MAIL_DELAY - 1000;

/** Portály píšou hostům samy (a dávají jen přeposílací adresy), ukázky se neposílají. */
const mailable = (r: Reservation) =>
  !!r.email.trim() && !r.anonymized && !r.noGuestMail && !["airbnb", "booking", "demo"].includes(r.source);

/** Zaplaceno a uplynul odklad na opravu omylu (starší rezervace bez paidAt = zaplaceno dávno). */
const paidSettled = (r: Reservation) => r.status === "paid" && (!r.paidAt || settled(r.paidAt));

const enabled = (site: Site, kind: EmailKind) => parseEmailSettings(site.emailSettings)[kind].enabled;

/** Kdy je na řadě e-mail „Před příjezdem“ (X dní předem v 10:00 českého času). */
export const arrivalMailAt = (r: Pick<Reservation, "startDate">, site: Pick<Site, "emailSettings">) =>
  cleaningStart(addDays(toISO(r.startDate), -arrivalDaysOf(site)), SCHEDULED_TIME);

/** Zabere e-mail (nastaví čas odeslání), odešle ho a při selhání zábor vrátí. */
async function claimAndSend(
  r: Loaded,
  where: Prisma.ReservationWhereInput,
  field: "paidMailAt" | "cancelMailAt" | "arrivalMailAt" | "arrivalCodeMailAt" | "checkinMailAt" | "checkinReminderAt",
  kind: EmailKind,
  extras: { accessCode?: string; checkin?: { link: string; people: number; missing: number; reminder?: boolean } } = {},
): Promise<boolean> {
  const claimed = await prisma.reservation.updateMany({ where: { id: r.id, ...where }, data: { [field]: new Date() } });
  if (!claimed.count) return false;
  const { subject, html } = renderEmail(kind, r.site, stayMailOf(r, r.site), { link: `${appUrl()}/r/${r.publicId}`, ...extras });
  const ok = await send({ to: r.email, subject, html, replyTo: r.site.contactEmail });
  if (!ok) await prisma.reservation.update({ where: { id: r.id }, data: { [field]: r[field] } });
  else await logGuestMail(r.id, field === "arrivalCodeMailAt" ? "arrivalCode" : field === "checkinReminderAt" ? "checkinReminder" : kind, subject, html);
  return ok;
}

async function paidMail(r: Loaded) {
  if (r.status !== "paid" || !r.paidAt || !settled(r.paidAt) || r.paidMailAt || !enabled(r.site, "paid")) return;
  if (toISO(r.endDate) <= todayISO()) return; // po odjezdu už nemá smysl
  await claimAndSend(r, { status: "paid", paidAt: { not: null }, paidMailAt: null }, "paidMailAt", "paid");
}

async function cancelMail(r: Loaded) {
  if (r.status !== "cancelled" || !r.cancelledAt || !settled(r.cancelledAt) || r.cancelMailAt || !enabled(r.site, "cancelled")) return;
  if (toISO(r.endDate) <= todayISO()) return;
  await claimAndSend(r, { status: "cancelled", cancelledAt: { not: null }, cancelMailAt: null }, "cancelMailAt", "cancelled");
}

async function arrivalMail(r: Loaded) {
  if (!paidSettled(r) || !enabled(r.site, "arrival")) return;
  if (toISO(r.startDate) < todayISO()) return; // pobyt už začal
  const code = r.accessCode.trim() || undefined;
  if (!r.arrivalMailAt) {
    if (arrivalMailAt(r, r.site) > new Date()) return; // ještě není na řadě
    await claimAndSend(r, { status: "paid", arrivalMailAt: null }, "arrivalMailAt", "arrival", { accessCode: code });
    return;
  }
  // Kód k zámku zadaný až po odeslání e-mailu „Před příjezdem“ → poslat znovu s kódem
  const setAt = r.accessCodeSetAt;
  if (!code || !setAt || setAt <= r.arrivalMailAt) return;
  if (r.arrivalCodeMailAt && r.arrivalCodeMailAt >= setAt) return;
  await claimAndSend(r, { status: "paid", arrivalCodeMailAt: r.arrivalCodeMailAt }, "arrivalCodeMailAt", "arrival", {
    accessCode: code,
  });
}

/** Kdy je na řadě odkaz na check-in (X dní předem v 10:00 českého času). */
export const checkinMailAt = (r: Pick<Reservation, "startDate">, site: Pick<Site, "emailSettings">) =>
  cleaningStart(addDays(toISO(r.startDate), -parseEmailSettings(site.emailSettings).checkin.days), SCHEDULED_TIME);

/** Odkaz a počty osob do e-mailu s check-inem (null = chybí šifrovací klíč). */
async function checkinExtras(r: Loaded, reminder = false) {
  const token = checkinToken(r);
  if (!token) return null;
  const people = slotsOf(r, r.site).length;
  const filled = await prisma.guestRecord.count({ where: { reservationId: r.id, position: { lt: people } } });
  return { link: `${appUrl()}/checkin/${token}`, people, missing: Math.max(0, people - filled), reminder };
}

const checkinOn = (r: Loaded) => r.site.checkinEnabled && guestCryptoReady() && !r.checkinDoneAt;

async function checkinMail(r: Loaded) {
  if (!paidSettled(r) || r.checkinMailAt || !checkinOn(r) || !enabled(r.site, "checkin")) return;
  if (toISO(r.startDate) < todayISO() || checkinMailAt(r, r.site) > new Date()) return;
  const checkin = await checkinExtras(r);
  if (checkin?.missing) await claimAndSend(r, { status: "paid", checkinMailAt: null }, "checkinMailAt", "checkin", { checkin });
}

/** Ráno v den příjezdu: připomínka, když odkaz odešel dřív a někdo pořád chybí. */
async function checkinReminder(r: Loaded) {
  if (r.status !== "paid" || !r.site.checkinReminder || r.checkinReminderAt || !checkinOn(r) || !enabled(r.site, "checkin")) return;
  const today = todayISO();
  if (toISO(r.startDate) !== today || !r.checkinMailAt || toISO(r.checkinMailAt) >= today) return;
  const checkin = await checkinExtras(r, true);
  if (checkin?.missing) await claimAndSend(r, { status: "paid", checkinReminderAt: null }, "checkinReminderAt", "checkin", { checkin });
}

/** Odkaz na check-in hned na pokyn majitele (i opakovaně). Vrací chybu, nebo null. */
export async function sendCheckinNow(id: string): Promise<string | null> {
  const r = await loadReservation(id);
  if (!r) return "Rezervace nenalezena.";
  if (r.noGuestMail) return "Testovací rezervace — hostovi se e-maily neposílají.";
  if (!mailable(r)) return "Tahle rezervace nemá e-mail, na který by šlo psát.";
  if (r.status === "cancelled") return "Rezervace je zrušená.";
  const checkin = await checkinExtras(r);
  if (!checkin) return "Chybí šifrovací klíč — check-in zatím nejde použít.";
  const ok = await claimAndSend(r, {}, "checkinMailAt", "checkin", { checkin });
  return ok ? null : "E-mail se nepodařilo odeslat. Zkus to prosím znovu.";
}

/**
 * „Před příjezdem“ hned na pokyn majitele (host chce údaje dřív) — bez čekání
 * na plánovaný den. Vrací chybovou hlášku, nebo null, když e-mail odešel.
 */
export async function sendArrivalNow(id: string, accessCode?: string): Promise<string | null> {
  // Kód k zámku doplněný těsně před odesláním — uložit dřív, ať je v e-mailu
  const code = accessCode?.trim().slice(0, 40);
  if (code) await prisma.reservation.updateMany({ where: { id, arrivalMailAt: null }, data: { accessCode: code, accessCodeSetAt: new Date() } });
  const r = await loadReservation(id);
  if (!r) return "Rezervace nenalezena.";
  if (r.noGuestMail) return "Testovací rezervace — hostovi se e-maily neposílají.";
  if (!mailable(r)) return "Tahle rezervace nemá e-mail, na který by šlo psát.";
  // Informace k příjezdu (kódy, Wi-Fi) až po zaplacení
  if (r.status !== "paid") return "Informace k příjezdu jde poslat až u zaplacené rezervace.";
  if (r.arrivalMailAt) return "E-mail „Před příjezdem“ už odešel.";
  const ok = await claimAndSend(r, { arrivalMailAt: null, status: "paid" }, "arrivalMailAt", "arrival", {
    accessCode: r.accessCode.trim() || undefined,
  });
  return ok ? null : "E-mail se nepodařilo odeslat. Zkus to prosím znovu.";
}

/** Pošle hostovi všechny e-maily, které jsou pro rezervaci právě na řadě. */
export async function sendDueMails(id: string): Promise<void> {
  const r = await loadReservation(id);
  if (!r || !mailable(r)) return;
  try {
    await paidMail(r);
    await cancelMail(r);
    await arrivalMail(await loadReservation(id).then((x) => x ?? r));
    await checkinMail(r);
    await checkinReminder(await loadReservation(id).then((x) => x ?? r));
  } catch (e) {
    console.error("E-maily k rezervaci se nepodařilo odeslat:", e);
  }
}

/** Rezervace, kterým má denní běh (cron) poslat e-maily — i pojistka, kdyby odklad po změně stavu selhal. */
export async function dueReservationIds(now = new Date()): Promise<string[]> {
  const settledBefore = new Date(now.getTime() - STATUS_MAIL_DELAY);
  const recent = new Date(now.getTime() - 3 * 86_400_000);
  const today = new Date(`${todayISO()}T00:00:00.000Z`);
  const rows = await prisma.reservation.findMany({
    where: {
      OR: [
        { status: "paid", paidMailAt: null, paidAt: { lt: settledBefore, gt: recent } },
        { status: "cancelled", cancelMailAt: null, cancelledAt: { lt: settledBefore, gt: recent } },
        { status: "paid", noGuestMail: false, arrivalMailAt: null, startDate: { gte: today, lte: new Date(today.getTime() + 31 * 86_400_000) } },
        { status: "paid", noGuestMail: false, checkinDoneAt: null, checkinMailAt: null, startDate: { gte: today, lte: new Date(today.getTime() + 31 * 86_400_000) } },
        { status: "paid", checkinDoneAt: null, checkinReminderAt: null, checkinMailAt: { not: null }, startDate: today },
      ],
    },
    select: { id: true },
    take: 200,
  });
  return rows.map((r) => r.id);
}
