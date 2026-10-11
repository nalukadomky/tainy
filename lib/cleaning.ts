// Úklidy po odjezdu hostů — čistá logika sdílená API, administrací i stránkou
// uklízečky. Uklízečka nikdy nedostane cenu pobytu; co o hostech uvidí, volí majitel.

import { pricedCategories } from "@/lib/pricing";
import { describeCounts, parseCategories, parseCounts } from "@/lib/guests";

export type PayMode = "hourly" | "flat";
export const PAY_LABEL: Record<PayMode, string> = { hourly: "Hodinová sazba", flat: "Za úklid" };

/** Údaje o hostech, které může majitel uklízečkám ukázat. */
export const CLEANER_FIELDS = [
  { key: "guests", label: "Počet a skladba hostů" },
  { key: "name", label: "Jméno hosta" },
  { key: "note", label: "Poznámka od hosta" },
  { key: "phone", label: "Telefon hosta" },
] as const;
export type CleanerField = (typeof CLEANER_FIELDS)[number]["key"];

export function parseCleanerFields(raw: string): CleanerField[] {
  const allowed = CLEANER_FIELDS.map((f) => f.key) as string[];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is CleanerField => allowed.includes(s));
}

export type ChecklistItem = { id: string; label: string; done: boolean; extra: boolean };

export function parseChecklist(raw: string): ChecklistItem[] {
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((i) => i && typeof i.label === "string")
      .map((i) => ({ id: String(i.id), label: String(i.label), done: !!i.done, extra: !!i.extra }));
  } catch {
    return [];
  }
}

/** Výchozí úkoly webu (jeden na řádek) → nový seznam k úklidu. */
export function checklistFromTemplate(template: string): ChecklistItem[] {
  return template
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label, i) => ({ id: `t${i}-${Math.random().toString(36).slice(2, 7)}`, label, done: false, extra: false }));
}

/** Kolik majitel uklízečce zaplatí: hodinová sazba podle času, nebo paušál. */
export function cleaningAmount(cleaner: { payMode: string; rate: number }, minutes: number | null): number {
  if (cleaner.payMode === "flat") return cleaner.rate;
  return Math.round((cleaner.rate * (minutes ?? 0)) / 60);
}

/** „2 h 15 min" */
export function fmtMinutes(minutes: number | null | undefined): string {
  if (!minutes) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

type StayLike = {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  checkInTime: string;
  checkOutTime: string;
  status: string;
};

/**
 * Okno úklidu: od odjezdu této rezervace do příjezdu další (nezrušené).
 * `sameDay` = další hosté přijíždějí v den odjezdu — úklid je časově napjatý.
 */
export function cleaningWindow<T extends StayLike>(stay: T, all: T[]) {
  const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
  const end = iso(stay.endDate);
  const next = all
    .filter((r) => r.id !== stay.id && r.status !== "cancelled" && iso(r.startDate) >= end)
    .sort((a, b) => iso(a.startDate).localeCompare(iso(b.startDate)))[0];
  return {
    date: end,
    from: stay.checkOutTime,
    nextArrival: next ? { date: iso(next.startDate), time: next.checkInTime } : null,
    sameDay: !!next && iso(next.startDate) === end,
  };
}

type GuestSite = { guestMode: string; pricingMode: string; guestCategories: string };
type GuestReservation = { guests: number; guestBreakdown: string; guestName: string; note: string; phone: string };

/** Údaje o hostech pro uklízečku — jen to, co majitel povolil. Nikdy cena ani e-mail. */
export function guestInfoForCleaner(r: GuestReservation, site: GuestSite, fields: CleanerField[]) {
  const out: { guests?: string; name?: string; note?: string; phone?: string } = {};
  if (fields.includes("guests")) {
    const categories = pricedCategories({
      guestMode: site.guestMode,
      pricingMode: site.pricingMode === "person" ? "person" : "unit",
      categories: parseCategories(site.guestCategories, site.pricingMode),
    });
    let label = "";
    try {
      label = describeCounts(parseCounts(JSON.parse(r.guestBreakdown || "{}"), categories), categories);
    } catch {}
    out.guests = label || `${r.guests} ${r.guests === 1 ? "host" : r.guests < 5 ? "hosté" : "hostů"}`;
  }
  if (fields.includes("name")) out.name = r.guestName;
  if (fields.includes("note") && r.note) out.note = r.note;
  if (fields.includes("phone") && r.phone) out.phone = r.phone;
  return out;
}

/**
 * Začátek úklidu jako okamžik: datum + čas v Praze (správně i přes letní čas).
 * Úklid po pobytu začíná check-outem, ruční úklid svým časem (bez času = půlnoc).
 */
export function cleaningStart(dateIso: string, time: string): Date {
  const [y, mo, d] = dateIso.slice(0, 10).split("-").map(Number);
  const [h, m] = /^\d{2}:\d{2}$/.test(time) ? time.split(":").map(Number) : [0, 0];
  const guess = Date.UTC(y, mo - 1, d, h, m);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asPrague = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asPrague - guess));
}

/** „po 12. 10. v 10:00" */
export function fmtStart(dateIso: string, time: string): string {
  const day = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("cs-CZ", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  });
  return time ? `${day} v ${time}` : day;
}

/** Okno ručního úklidu: jeho datum a čas, další příjezd hostů od toho dne. */
export function manualWindow<T extends StayLike>(dateIso: string, time: string, stays: T[]) {
  const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
  const date = dateIso.slice(0, 10);
  const next = stays
    .filter((r) => r.status !== "cancelled" && iso(r.startDate) >= date)
    .sort((a, b) => iso(a.startDate).localeCompare(iso(b.startDate)))[0];
  return {
    date,
    from: time,
    nextArrival: next ? { date: iso(next.startDate), time: next.checkInTime } : null,
    sameDay: !!next && iso(next.startDate) === date,
  };
}

/**
 * Upozornění „úklid ještě není hotový“ u rezervace, kdy hosté přijíždějí dnes
 * nebo zítra a před příjezdem zbývá nehotový úklid:
 *  - po předchozím pobytu (odjezd v posledních 14 dnech) — nehotový, nebo ho
 *    nikdo nemá přiřazený (hotový ruční úklid mezi odjezdem a příjezdem stačí),
 *  - nebo ručně naplánovaný úklid mezi předchozím odjezdem a příjezdem.
 */
export type CleaningAlert = {
  /** todo = přiřazený, ale nehotový; unassigned = nikdo ho nemá */
  kind: "todo" | "unassigned";
  arrival: string;
  arrivalTime: string;
  /** Úklid po pobytu: jméno hostů, kteří odjeli (u ručního úklidu prázdné). */
  prevGuest: string;
  /** Ruční úklid: popis a den, kdy je naplánovaný. */
  title: string;
  date: string;
  cleaner: string;
  done: number;
  total: number;
};

type AlertCleaning = { status: string; checklist: string; cleaner: { name: string } | null };

type AlertStay = {
  id: string;
  guestName: string;
  startDate: Date;
  endDate: Date;
  checkInTime: string;
  status: string;
  expiresAt: Date | null;
  cleaning: AlertCleaning | null;
};

type AlertManual = AlertCleaning & { date: Date | null; title: string };

export function cleaningAlerts(stays: AlertStay[], manual: AlertManual[], today: string): Record<string, CleaningAlert> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const holds = stays.filter((r) => r.status !== "cancelled" && (!r.expiresAt || r.expiresAt > now));
  const [y, m, d] = today.split("-").map(Number);
  const day = (n: number) => new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  const tomorrow = day(1);
  const recent = day(-14);
  const manuals = manual.filter((c) => c.date).map((c) => ({ ...c, day: iso(c.date!) }));
  const progress = (c: AlertCleaning) => {
    const list = parseChecklist(c.checklist);
    return { cleaner: c.cleaner?.name ?? "", done: list.filter((i) => i.done).length, total: list.length };
  };
  const out: Record<string, CleaningAlert> = {};

  for (const a of holds) {
    const start = iso(a.startDate);
    if (start < today || start > tomorrow) continue;
    const base = { arrival: start, arrivalTime: a.checkInTime };
    const prev = holds
      .filter((r) => r.id !== a.id && iso(r.endDate) <= start)
      .sort((p, q) => iso(q.endDate).localeCompare(iso(p.endDate)))[0];
    // Od kdy hledat úklidy: od předchozího odjezdu, nejdál 14 dní zpět
    const since = prev && iso(prev.endDate) > recent ? iso(prev.endDate) : recent;
    const between = manuals.filter((c) => c.day >= since && c.day <= start);

    // Ručně naplánovaný úklid před příjezdem, který ještě není hotový
    const pending = between.filter((c) => c.status !== "done").sort((p, q) => q.day.localeCompare(p.day))[0];
    if (pending) {
      out[a.id] = {
        ...base,
        kind: pending.cleaner ? "todo" : "unassigned",
        prevGuest: "",
        title: pending.title || "Úklid",
        date: pending.day,
        ...progress(pending),
      };
      continue;
    }

    // Úklid po předchozím pobytu (jen nedávný odjezd)
    if (!prev || iso(prev.endDate) < recent) continue;
    const c = prev.cleaning;
    if (c?.status === "done" || between.some((x) => x.status === "done")) continue;
    out[a.id] = {
      ...base,
      kind: c ? "todo" : "unassigned",
      prevGuest: prev.guestName,
      title: "",
      date: iso(prev.endDate),
      ...(c ? progress(c) : { cleaner: "", done: 0, total: 0 }),
    };
  }
  return out;
}
