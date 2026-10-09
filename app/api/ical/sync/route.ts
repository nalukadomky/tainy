import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncFeed } from "@/lib/ical-sync";

// Pravidelná synchronizace kalendářů z portálů pro externí plánovač zdarma
// (např. cron-job.org každých 15 minut). Bere jen kalendáře, které se
// nesynchronizovaly déle než 10 minut, a nanejvýš 20 najednou — opakované
// volání tak nic nezahltí a nic neprozradí.

export const maxDuration = 60;

const MAX_AGE = 10 * 60_000;
const BATCH = 20;

export async function GET() {
  const feeds = await prisma.calendarFeed.findMany({
    where: { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - MAX_AGE) } }] },
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
    take: BATCH,
    select: { id: true, siteId: true, source: true, url: true },
  });
  const results = await Promise.all(feeds.map((f) => syncFeed(f).catch(() => ({ changed: false, error: "chyba" }))));
  return NextResponse.json({ synced: feeds.length, changed: results.filter((r) => r.changed).length });
}
