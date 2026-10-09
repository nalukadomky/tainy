import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByBlackoutId, deny } from "@/lib/auth";
import { lockSite } from "@/lib/availability";
import { newPublicId } from "@/lib/stay";
import { FEED_LABEL, FEED_SOURCES, type FeedSource } from "@/lib/ical-sync";

// „Je to rezervace“: blokace stažená z portálu (Booking.com rezervace
// a blokace nerozlišuje) se převede na rezervaci — počítá se do úklidů
// a jde jí doplnit jméno a cenu. Synchronizace ji dál páruje podle UID.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwnerByBlackoutId((await params).id);
  if (!guard.ok) return deny(guard.status);
  const b = guard.blackout;
  if (!b.feedId) return NextResponse.json({ error: "Převést jde jen termín stažený z portálu." }, { status: 400 });

  const reservation = await prisma.$transaction(async (tx) => {
    await lockSite(tx, b.siteId);
    const [feed, site] = await Promise.all([
      tx.calendarFeed.findUniqueOrThrow({ where: { id: b.feedId! }, select: { source: true } }),
      tx.site.findUniqueOrThrow({ where: { id: b.siteId }, select: { checkInTime: true, checkOutTime: true } }),
    ]);
    const source: FeedSource = FEED_SOURCES.includes(feed.source as FeedSource) ? (feed.source as FeedSource) : "other";
    await tx.blackout.delete({ where: { id: b.id } });
    return tx.reservation.create({
      data: {
        publicId: newPublicId(),
        siteId: b.siteId,
        guestName: `Host z ${FEED_LABEL[source]}`,
        email: "",
        guests: 0,
        startDate: b.startDate,
        endDate: b.endDate,
        checkInTime: site.checkInTime,
        checkOutTime: site.checkOutTime,
        totalPrice: 0,
        source,
        status: "paid",
        feedId: b.feedId,
        externalUid: b.externalUid,
      },
    });
  });
  return NextResponse.json(reservation, { status: 201 });
}
