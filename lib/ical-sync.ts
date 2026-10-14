// Stahování kalendářů z portálů (Airbnb, Booking.com…) a zápis jejich termínů
// jako rezervací nebo blokací. Jen na serveru.
//
// Synchronizace se spouští zdarma, bez placeného plánovače: při otevření
// administrace, před výpisem obsazenosti a před vytvořením rezervace na webu
// (jen když jsou data starší než pár minut), ručně tlačítkem a přes
// /api/ical/sync pro externí plánovač (např. cron-job.org).

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { holdsDates, lockSite } from "@/lib/availability";
import { newPublicId, todayISO, addDays } from "@/lib/stay";
import { looksLikeReservation, parseIcs, type IcalEvent } from "@/lib/ical";
import { SafeFetchError, decodeText, safeFetch, urlProblem } from "@/lib/safe-fetch";

export const FEED_SOURCES = ["airbnb", "booking", "other"] as const;
export type FeedSource = (typeof FEED_SOURCES)[number];
export const FEED_LABEL: Record<FeedSource, string> = { airbnb: "Airbnb", booking: "Booking.com", other: "Jiný portál" };

const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT = 10_000;

/* ---------- Bezpečné stažení kalendáře ---------- */

/** Odkaz na kalendář, který smíme stahovat (vrací chybovou hlášku, nebo null). */
export function feedUrlProblem(raw: string): string | null {
  const problem = urlProblem(normalizeFeedUrl(raw), false);
  if (problem === "invalid") return "Tohle není platný odkaz. Zkopíruj celý odkaz na kalendář (začíná https://).";
  if (problem === "protocol") return "Odkaz musí začínat https://.";
  if (problem) return "Tenhle odkaz nejde použít.";
  return null;
}

export const normalizeFeedUrl = (raw: string) => raw.trim().replace(/^webcal:\/\//i, "https://");

async function fetchIcs(raw: string, timeoutMs: number): Promise<string> {
  const problem = feedUrlProblem(raw);
  if (problem) throw new Error(problem);
  let res;
  try {
    res = await safeFetch(normalizeFeedUrl(raw), {
      timeoutMs,
      maxBytes: MAX_BYTES,
      accept: "text/calendar, text/plain, */*",
      userAgent: "tainy.cz calendar sync",
    });
  } catch (e) {
    // Spojení se nepodařilo (portál nedostupný) — místo technického „fetch failed“
    if (e instanceof TypeError) throw new Error("Kalendář se nepodařilo stáhnout — portál neodpovídá. Zkusíme to znovu.");
    if (!(e instanceof SafeFetchError)) throw e;
    if (e.code === "dns") throw new Error("Adresa kalendáře neexistuje.");
    if (e.code === "status") throw new Error(`Portál kalendář nevydal (chyba ${e.status}). Zkontroluj odkaz.`);
    if (e.code === "too-big") throw new Error("Kalendář je příliš velký.");
    if (e.code === "redirects") throw new Error("Odkaz přesměrovává příliš mnohokrát.");
    if (e.code === "protocol") throw new Error("Odkaz musí začínat https://.");
    throw new Error("Tenhle odkaz nejde použít.");
  }
  const text = decodeText(res.bytes, res.contentType);
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Na odkazu není kalendář (iCal). Zkopíruj odkaz pro export kalendáře.");
  return text;
}

/* ---------- Synchronizace jednoho kalendáře ---------- */

type Feed = { id: string; siteId: string; source: string; url: string };

const sourceOf = (s: string): FeedSource => (FEED_SOURCES.includes(s as FeedSource) ? (s as FeedSource) : "other");

/** Stáhne kalendář a promítne změny. Vrací, jestli se v termínech něco změnilo. */
export async function syncFeed(feed: Feed, timeoutMs = FETCH_TIMEOUT): Promise<{ changed: boolean; error?: string }> {
  let events: IcalEvent[];
  try {
    events = parseIcs(await fetchIcs(feed.url, timeoutMs));
  } catch (e) {
    const error =
      e instanceof Error && e.name !== "TimeoutError" && e.name !== "AbortError"
        ? e.message
        : "Portál neodpověděl včas — zkusíme to znovu později.";
    await prisma.calendarFeed.update({ where: { id: feed.id }, data: { lastSyncAt: new Date(), lastError: error } }).catch(() => {});
    return { changed: false, error };
  }

  const source = sourceOf(feed.source);
  const label = FEED_LABEL[source];
  // Minulost neřešíme — portály ji z kalendáře postupně mažou a proběhlé pobyty mají zůstat.
  const today = todayISO();
  const from = addDays(today, -1);
  const live = new Map<string, IcalEvent>();
  for (const e of events) if (!e.cancelled && e.end >= from) live.set(e.uid, e);

  let changed = false;
  let warning = "";
  await prisma.$transaction(
    async (tx) => {
      await lockSite(tx, feed.siteId);
      const [site, stays, blocks] = await Promise.all([
        tx.site.findUniqueOrThrow({ where: { id: feed.siteId }, select: { checkInTime: true, checkOutTime: true } }),
        tx.reservation.findMany({
          where: { feedId: feed.id },
          select: { id: true, externalUid: true, startDate: true, endDate: true, status: true },
        }),
        tx.blackout.findMany({ where: { feedId: feed.id }, select: { id: true, externalUid: true, startDate: true, endDate: true } }),
      ]);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const day = (s: string) => new Date(`${s}T00:00:00Z`);
      // Portál poslal kalendář bez jediného budoucího termínu, i když jsme jich měli víc —
      // spíš výpadek na jeho straně než zrušení všeho. Nic nerušit a zkusit to příště.
      const known = stays.filter((s) => s.status !== "cancelled" && iso(s.endDate) >= today).length + blocks.filter((b) => iso(b.endDate) >= today).length;
      const keepAll = live.size === 0 && known > 0;
      if (keepAll) warning = "Portál poslal prázdný kalendář — rezervace jsme nechali beze změny a zkusíme to znovu.";

      for (const s of stays) {
        const e = live.get(s.externalUid ?? "");
        if (e) {
          live.delete(e.uid);
          // Zrušenou rezervaci (zrušil ji majitel) synchronizace neobnovuje — mění jen termín
          if (iso(s.startDate) !== e.start || iso(s.endDate) !== e.end) {
            await tx.reservation.update({ where: { id: s.id }, data: { startDate: day(e.start), endDate: day(e.end) } });
            changed = true;
          }
        } else if (!keepAll && iso(s.endDate) >= today && s.status !== "cancelled") {
          // Z portálu zmizel budoucí termín = zrušená rezervace
          await tx.reservation.update({ where: { id: s.id }, data: { status: "cancelled" } });
          await tx.cleaning.deleteMany({ where: { reservationId: s.id, paid: false } });
          changed = true;
        }
      }
      for (const b of blocks) {
        const e = live.get(b.externalUid ?? "");
        if (e) {
          live.delete(e.uid);
          if (iso(b.startDate) !== e.start || iso(b.endDate) !== e.end) {
            await tx.blackout.update({ where: { id: b.id }, data: { startDate: day(e.start), endDate: day(e.end) } });
            changed = true;
          }
        } else if (!keepAll && iso(b.endDate) >= today) {
          await tx.blackout.delete({ where: { id: b.id } });
          changed = true;
        }
      }
      for (const e of live.values()) {
        if (looksLikeReservation(source, e.summary)) {
          await tx.reservation.create({
            data: {
              publicId: newPublicId(),
              siteId: feed.siteId,
              guestName: `Host z ${label}`,
              email: "",
              guests: 0,
              startDate: day(e.start),
              endDate: day(e.end),
              checkInTime: site.checkInTime,
              checkOutTime: site.checkOutTime,
              totalPrice: 0,
              source,
              status: "paid",
              feedId: feed.id,
              externalUid: e.uid,
            },
          });
        } else {
          await tx.blackout.create({
            data: {
              siteId: feed.siteId,
              startDate: day(e.start),
              endDate: day(e.end),
              reason: source === "airbnb" ? "Airbnb – nedostupné" : label,
              feedId: feed.id,
              externalUid: e.uid,
            },
          });
        }
        changed = true;
      }
      await tx.calendarFeed.update({
        where: { id: feed.id },
        data: keepAll
          ? { lastSyncAt: new Date(), lastError: warning }
          : { lastSyncAt: new Date(), lastError: "", eventCount: [...events].filter((e) => !e.cancelled && e.end >= from).length },
      });
    },
    { maxWait: 10_000, timeout: 20_000 }
  );
  return warning ? { changed, error: warning } : { changed };
}

/**
 * Synchronizuje kalendáře webu starší než `maxAgeMs`. Čeká nanejvýš `timeoutMs`
 * — při pomalém portálu se pokračuje s posledními daty (synchronizace doběhne na pozadí).
 */
export async function syncStale(siteId: string, maxAgeMs: number, timeoutMs = 4000): Promise<boolean> {
  const feeds = await prisma.calendarFeed.findMany({
    where: { siteId, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - maxAgeMs) } }] },
    select: { id: true, siteId: true, source: true, url: true },
  });
  if (!feeds.length) return false;
  const run = Promise.all(feeds.map((f) => syncFeed(f).catch(() => ({ changed: false })))).then((r) =>
    r.some((x) => x.changed)
  );
  // Když portál nestihne odpovědět, odpověď nečeká — synchronizace doběhne po ní (after).
  try {
    after(() => run);
  } catch {
    // mimo požadavek (skript) — běží dál samo
  }
  return Promise.race([run, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))]);
}

/** Překryvy: termín z portálu koliduje s rezervací z webu (nebo ruční). */
export async function feedConflicts(siteId: string) {
  const today = new Date(`${todayISO()}T00:00:00Z`);
  const [imported, own] = await Promise.all([
    prisma.reservation.findMany({
      where: { siteId, feedId: { not: null }, endDate: { gt: today }, ...holdsDates() },
      select: { id: true, guestName: true, startDate: true, endDate: true, source: true },
    }),
    prisma.reservation.findMany({
      where: { siteId, feedId: null, endDate: { gt: today }, ...holdsDates() },
      select: { id: true, guestName: true, startDate: true, endDate: true, source: true },
    }),
  ]);
  const importedBlocks = await prisma.blackout.findMany({
    where: { siteId, feedId: { not: null }, endDate: { gt: today } },
    select: { id: true, reason: true, startDate: true, endDate: true },
  });
  const ext = [
    ...imported.map((r) => ({ id: r.id, label: r.guestName, start: r.startDate, end: r.endDate })),
    ...importedBlocks.map((b) => ({ id: b.id, label: b.reason, start: b.startDate, end: b.endDate })),
  ];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return ext.flatMap((e) =>
    own
      .filter((o) => o.startDate < e.end && o.endDate > e.start)
      .map((o) => ({
        external: { label: e.label, start: iso(e.start), end: iso(e.end) },
        own: { id: o.id, guestName: o.guestName, start: iso(o.startDate), end: iso(o.endDate) },
      }))
  );
}
