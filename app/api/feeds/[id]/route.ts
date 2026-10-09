import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByFeedId, deny } from "@/lib/auth";
import { feedConflicts, syncFeed } from "@/lib/ical-sync";

const FEED_SELECT = { id: true, source: true, name: true, url: true, lastSyncAt: true, lastError: true, eventCount: true } as const;

// Synchronizovat teď
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwnerByFeedId((await params).id);
  if (!guard.ok) return deny(guard.status);
  const { changed } = await syncFeed(guard.feed);
  const [feed, conflicts] = await Promise.all([
    prisma.calendarFeed.findUniqueOrThrow({ where: { id: guard.feed.id }, select: FEED_SELECT }),
    feedConflicts(guard.feed.siteId),
  ]);
  return NextResponse.json({ feed, conflicts, changed });
}

// Odpojit — termíny stažené z tohoto kalendáře zmizí (rezervace i blokace)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwnerByFeedId((await params).id);
  if (!guard.ok) return deny(guard.status);
  await prisma.calendarFeed.delete({ where: { id: guard.feed.id } });
  return NextResponse.json({ ok: true });
}
