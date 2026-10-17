import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, deny } from "@/lib/auth";
import { createSite } from "@/lib/create-site";
import { EARLY_ACCESS_DENIED, mayCreateSite } from "@/lib/early-access";


// Vrací pouze weby přihlášeného uživatele (napájí přepínač webů v administraci).
// `alerts` = kolik věcí u nemovitosti čeká na majitele: nezaplacené rezervace
// (pobyt ještě neskončil) a objednané dárkové poukazy čekající na platbu.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json([]);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [sites, unpaid, gifts] = await Promise.all([
    prisma.site.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
      // Přepínači stačí název a adresa — ne celé řádky s texty a fotkami
      select: { id: true, slug: true, name: true, widgetOnly: true },
    }),
    prisma.reservation.groupBy({
      by: ["siteId"],
      where: { site: { ownerId: user.id }, status: "pending", endDate: { gte: today } },
      _count: { _all: true },
    }),
    prisma.giftOrder.groupBy({
      by: ["siteId"],
      where: { site: { ownerId: user.id }, status: "pending" },
      _count: { _all: true },
    }),
  ]);
  const count = (rows: { siteId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.siteId === id)?._count._all ?? 0;
  return NextResponse.json(
    sites.map(({ id, ...s }) => ({ ...s, alerts: count(unpaid, id) + count(gifts, id) })),
  );
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return deny(401);

  if (!(await mayCreateSite(user))) return NextResponse.json(EARLY_ACCESS_DENIED, { status: 403 });

  const body = await req.json();
  if (!body.name || !body.pricePerNight) {
    return NextResponse.json({ error: "Chybí název nebo cena za noc." }, { status: 400 });
  }

  const site = await createSite(user.id, body);
  return NextResponse.json(site, { status: 201 });
}
