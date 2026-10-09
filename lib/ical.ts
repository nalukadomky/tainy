// iCal (RFC 5545) — jen to, co potřebuje výměna obsazenosti s portály:
// čtení událostí z kalendáře Airbnb / Booking.com a export obsazených dní webu.
// Data jsou v celých dnech, konec se nepočítá (den odjezdu) — stejně jako u nás.

export type IcalEvent = {
  uid: string;
  /** Den příjezdu (YYYY-MM-DD). */
  start: string;
  /** Den odjezdu (YYYY-MM-DD), nepočítá se. */
  end: string;
  summary: string;
  cancelled: boolean;
};

/** Rozbalí zalomené řádky (pokračování začíná mezerou nebo tabulátorem). */
function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

const unescape = (v: string) =>
  v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

/** DTSTART/DTEND → YYYY-MM-DD. Čas se zahodí — portály posílají celé dny, případně příjezd v čase. */
function toDay(value: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function addDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Události z kalendáře. Neúplné a nesmyslné se přeskočí. */
export function parseIcs(text: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur) {
        const start = cur.DTSTART ? toDay(cur.DTSTART) : null;
        let end = cur.DTEND ? toDay(cur.DTEND) : null;
        if (start && (!end || end <= start)) end = addDay(start); // jednodenní / bez konce
        if (start && end) {
          events.push({
            uid: (cur.UID || `${start}_${end}`).slice(0, 255),
            start,
            end,
            summary: unescape(cur.SUMMARY ?? "").slice(0, 120),
            cancelled: (cur.STATUS ?? "").toUpperCase() === "CANCELLED",
          });
        }
      }
      cur = null;
    } else if (cur) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const name = line.slice(0, colon).split(";")[0].toUpperCase();
      if (!(name in cur)) cur[name] = line.slice(colon + 1);
    }
  }
  return events;
}

const esc = (v: string) => v.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
const compact = (iso: string) => iso.replaceAll("-", "");

/** Kalendář obsazenosti pro portály: jen „Obsazeno“, bez osobních údajů. */
export function buildIcs(
  calendarName: string,
  events: { uid: string; start: string; end: string; summary: string }[],
  now = new Date()
): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//tainy.cz//Obsazenost//CS",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calendarName)}`,
    ...events.flatMap((e) => [
      "BEGIN:VEVENT",
      `UID:${esc(e.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      `DTEND;VALUE=DATE:${compact(e.end)}`,
      `SUMMARY:${esc(e.summary)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/**
 * Je to rezervace, nebo jen nedostupný den? Airbnb rezervace pojmenuje
 * „Reserved“, blokace „Airbnb (Not available)“. Booking.com obojí zapisuje
 * stejně („CLOSED - Not available“), takže z něj jsou blokace a majitel je
 * může jedním klikem převést na rezervaci.
 */
export function looksLikeReservation(source: string, summary: string): boolean {
  if (source !== "airbnb") return false;
  return /reserved|rezerv/i.test(summary) && !/not available|blocked|closed/i.test(summary);
}
