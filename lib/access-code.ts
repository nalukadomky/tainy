// Kdy se hostovi odešle e-mail s kódem k zámku: je součástí e-mailu „Před
// příjezdem" (Nastavení → Automatizace, X dní předem v 10:00). Uložený kód
// na poslední chvíli (po plánovaném čase) se posílá hned.

import { cleaningStart } from "@/lib/cleaning";
import { addDays } from "@/lib/stay";
import { SCHEDULED_TIME } from "@/lib/email-templates";

const DEFAULT_DAYS_BEFORE = 2;

/** Plánovaný čas odeslání e-mailu s kódem (nebo null bez kódu). */
export function accessCodeSendAt(
  r: { startDate: string; accessCode: string; accessCodeSetAt: string | null },
  daysBefore = DEFAULT_DAYS_BEFORE
): Date | null {
  if (!r.accessCode) return null;
  const planned = cleaningStart(addDays(r.startDate.slice(0, 10), -daysBefore), SCHEDULED_TIME);
  const setAt = r.accessCodeSetAt ? new Date(r.accessCodeSetAt) : null;
  return setAt && setAt > planned ? setAt : planned;
}

/** Stav e-mailu s kódem: skutečně odeslaný (lib/guest-mails.ts), nebo kdy se pošle. */
export type CodeMail = { at: Date; sent: boolean } | null;

export function accessCodeMail(
  r: {
    startDate: string;
    accessCode: string;
    accessCodeSetAt: string | null;
    status: string;
    paidAt?: string | null;
    noGuestMail?: boolean;
    arrivalMailAt?: string | null;
    arrivalCodeMailAt?: string | null;
  },
  daysBefore = DEFAULT_DAYS_BEFORE
): CodeMail {
  if (!r.accessCode) return null;
  if (r.arrivalCodeMailAt) return { at: new Date(r.arrivalCodeMailAt), sent: true };
  const setAt = r.accessCodeSetAt ? new Date(r.accessCodeSetAt) : null;
  if (r.arrivalMailAt && (!setAt || setAt <= new Date(r.arrivalMailAt))) return { at: new Date(r.arrivalMailAt), sent: true };
  // Zrušené a testovací rezervace se automaticky neposílají
  if (r.status === "cancelled" || r.noGuestMail) return null;
  const planned = accessCodeSendAt(r, daysBefore);
  if (!planned) return null;
  return { at: planned > new Date() ? planned : new Date(), sent: false };
}

/** „31. 3. v 10:00“ v českém čase. */
export function fmtSendAt(d: Date): string {
  const date = d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", timeZone: "Europe/Prague" });
  const time = d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });
  return `${date} v ${time}`;
}
