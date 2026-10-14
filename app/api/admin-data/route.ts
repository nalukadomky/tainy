import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureGeo } from "@/lib/geocode";
import { getUser, deny } from "@/lib/auth";
import { cleaningAlerts } from "@/lib/cleaning";
import { addDays, fromISO, todayISO } from "@/lib/stay";

// Všechna data administrace jedním požadavkem: web, rezervace, náklady a blokace.
// Jedno ověření přihlášení místo čtyř a jedno spojení z prohlížeče, takže
// obnova na pozadí neblokuje přechody mezi sekcemi.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });

  const [user, site] = await Promise.all([
    getUser(),
    prisma.site.findUnique({ where: { slug }, include: { priceRules: { orderBy: { startDate: "asc" } } } }),
  ]);
  if (!user) return deny(401);
  if (!site) return deny(404);
  if (site.ownerId !== user.id) return deny(403);

  const today = todayISO();
  const cleaningSelect = { status: true, checklist: true, cleaner: { select: { name: true } } } as const;
  const [geo, rows, costs, blackouts, cleaners, manual] = await Promise.all([
    ensureGeo(site),
    prisma.reservation.findMany({
      where: { siteId: site.id },
      orderBy: { startDate: "desc" },
      include: { cleaning: { select: cleaningSelect }, _count: { select: { guestRecords: true } } },
    }),
    prisma.cost.findMany({ where: { siteId: site.id }, orderBy: { date: "desc" } }),
    prisma.blackout.findMany({ where: { siteId: site.id }, orderBy: { startDate: "asc" } }),
    prisma.cleaner.count({ where: { siteId: site.id, active: true } }),
    // Ruční úklidy (bez rezervace) z posledních 14 dní a nejbližších dní
    prisma.cleaning.findMany({
      where: { siteId: site.id, reservationId: null, date: { gte: fromISO(addDays(today, -14)), lte: fromISO(addDays(today, 1)) } },
      select: { ...cleaningSelect, date: true, title: true },
    }),
  ]);
  // Úklid hlídáme jen u webů, které sekci Úklid používají (mají personál nebo ruční úklid)
  const alerts = cleaners || manual.length ? cleaningAlerts(rows, manual, today) : {};
  // Z check-inu jen počet vyplněných osob — údaje samotné se načítají zvlášť (šifrované)
  const reservations = rows.map(({ cleaning: _cleaning, _count, checkinNonce: _nonce, ...r }) => ({
    ...r,
    checkinCount: _count.guestRecords,
    cleaningAlert: alerts[r.id] ?? null,
  }));
  return NextResponse.json({ site: { ...site, geo }, reservations, costs, blackouts });
}
