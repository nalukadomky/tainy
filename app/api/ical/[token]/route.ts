import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { holdsDates } from "@/lib/availability";
import { addDays, todayISO } from "@/lib/stay";
import { buildIcs } from "@/lib/ical";

// Kalendář obsazenosti webu pro portály (Airbnb, Booking.com…). Veřejný jen
// přes tajný token z Nastavení → Externí rezervace. Bez osobních údajů:
// každý obsazený termín je jen „Obsazeno“.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, "");
  if (!/^[\w-]{20,64}$/.test(token)) return new Response("Kalendář nenalezen.", { status: 404 });
  const site = await prisma.site.findUnique({ where: { icalToken: token }, select: { id: true, name: true } });
  if (!site) return new Response("Kalendář nenalezen.", { status: 404 });

  const from = new Date(`${addDays(todayISO(), -30)}T00:00:00Z`);
  const [stays, blocks] = await Promise.all([
    prisma.reservation.findMany({
      where: { siteId: site.id, endDate: { gte: from }, ...holdsDates() },
      select: { id: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
    prisma.blackout.findMany({
      where: { siteId: site.id, endDate: { gte: from } },
      select: { id: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
  ]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const ics = buildIcs(site.name, [
    ...stays.map((r) => ({ uid: `r-${r.id}@tainy.cz`, start: iso(r.startDate), end: iso(r.endDate), summary: "Obsazeno" })),
    ...blocks.map((b) => ({ uid: `b-${b.id}@tainy.cz`, start: iso(b.startDate), end: iso(b.endDate), summary: "Obsazeno" })),
  ]);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="obsazenost.ics"',
      "Cache-Control": "no-store",
    },
  });
}
