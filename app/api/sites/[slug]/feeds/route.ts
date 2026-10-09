import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { FEED_SOURCES, feedConflicts, feedUrlProblem, normalizeFeedUrl, syncFeed, type FeedSource } from "@/lib/ical-sync";

// Nastavení → Externí rezervace: odkaz na kalendář webu, připojené kalendáře
// z portálů a překryvy termínů.

const MAX_FEEDS = 10;

const newIcalToken = () => randomBytes(24).toString("base64url");

const FEED_SELECT = { id: true, source: true, name: true, url: true, lastSyncAt: true, lastError: true, eventCount: true } as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  // Odkaz na kalendář webu vznikne při prvním otevření záložky
  // (jen když ještě žádný není — souběžné načtení nesmí vytvořit dva různé)
  await prisma.site.updateMany({ where: { id: guard.site.id, icalToken: null }, data: { icalToken: newIcalToken() } });
  const { icalToken } = await prisma.site.findUniqueOrThrow({ where: { id: guard.site.id }, select: { icalToken: true } });
  const [feeds, conflicts] = await Promise.all([
    prisma.calendarFeed.findMany({ where: { siteId: guard.site.id }, orderBy: { createdAt: "asc" }, select: FEED_SELECT }),
    feedConflicts(guard.site.id),
  ]);
  return NextResponse.json({ icalToken, feeds, conflicts });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const body = await req.json().catch(() => ({}));
  const url = String(body.url ?? "").slice(0, 1000);
  const problem = feedUrlProblem(url);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const source: FeedSource = FEED_SOURCES.includes(body.source) ? body.source : "other";
  const count = await prisma.calendarFeed.count({ where: { siteId: guard.site.id } });
  if (count >= MAX_FEEDS) return NextResponse.json({ error: "Připojit jde nanejvýš 10 kalendářů." }, { status: 400 });
  const clean = normalizeFeedUrl(url);
  if (await prisma.calendarFeed.findFirst({ where: { siteId: guard.site.id, url: clean } }))
    return NextResponse.json({ error: "Tenhle kalendář už je připojený." }, { status: 400 });

  const feed = await prisma.calendarFeed.create({
    data: { siteId: guard.site.id, source, name: String(body.name ?? "").trim().slice(0, 60), url: clean },
    select: { ...FEED_SELECT, siteId: true },
  });
  // První synchronizace hned — majitel uvidí, jestli odkaz funguje
  await syncFeed(feed);
  const [fresh, conflicts] = await Promise.all([
    prisma.calendarFeed.findUniqueOrThrow({ where: { id: feed.id }, select: FEED_SELECT }),
    feedConflicts(guard.site.id),
  ]);
  return NextResponse.json({ feed: fresh, conflicts }, { status: 201 });
}
