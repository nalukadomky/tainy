import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureGeo } from "@/lib/geocode";
import { getUser, deny } from "@/lib/auth";

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

  const [geo, reservations, costs, blackouts] = await Promise.all([
    ensureGeo(site),
    prisma.reservation.findMany({ where: { siteId: site.id }, orderBy: { startDate: "desc" } }),
    prisma.cost.findMany({ where: { siteId: site.id }, orderBy: { date: "desc" } }),
    prisma.blackout.findMany({ where: { siteId: site.id }, orderBy: { startDate: "asc" } }),
  ]);
  return NextResponse.json({ site: { ...site, geo }, reservations, costs, blackouts });
}
