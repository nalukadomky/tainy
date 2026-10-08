// Kdy se hostovi odešle e-mail s kódem k zámku. Zatím pevně den před příjezdem
// v 10:00 — později se bude brát z nastavení e-mailů. Uložený kód na poslední
// chvíli (po plánovaném čase) se posílá hned.

import { cleaningStart } from "@/lib/cleaning";
import { addDays } from "@/lib/stay";

export const ACCESS_CODE_EMAIL = { daysBefore: 1, time: "10:00" };

/** Plánovaný čas odeslání e-mailu s kódem (nebo null bez kódu). */
export function accessCodeSendAt(r: { startDate: string; accessCode: string; accessCodeSetAt: string | null }): Date | null {
  if (!r.accessCode) return null;
  const planned = cleaningStart(addDays(r.startDate.slice(0, 10), -ACCESS_CODE_EMAIL.daysBefore), ACCESS_CODE_EMAIL.time);
  const setAt = r.accessCodeSetAt ? new Date(r.accessCodeSetAt) : null;
  return setAt && setAt > planned ? setAt : planned;
}

/** „31. 3. v 10:00“ v českém čase. */
export function fmtSendAt(d: Date): string {
  const date = d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", timeZone: "Europe/Prague" });
  const time = d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });
  return `${date} v ${time}`;
}
