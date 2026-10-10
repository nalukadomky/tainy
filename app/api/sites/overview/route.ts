import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, deny } from "@/lib/auth";
import { holdsDates } from "@/lib/availability";
import { parsePhotoLines } from "@/lib/photos";

// Nastavení → Nemovitosti: vlastní weby se souhrnem pro karty.
export async function GET() {
  const user = await getUser();
  if (!user) return deny(401);
  const sites = await prisma.site.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true, propertyType: true, photos: true, heroPhoto: true, themeColor: true },
  });
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const ids = sites.map((s) => s.id);
  const [upcoming, revenue, total] = await Promise.all([
    prisma.reservation.groupBy({
      by: ["siteId"],
      where: { siteId: { in: ids }, endDate: { gte: now }, ...holdsDates() },
      _count: true,
    }),
    prisma.reservation.groupBy({
      by: ["siteId"],
      where: { siteId: { in: ids }, status: "paid", startDate: { gte: yearStart } },
      _sum: { totalPrice: true },
    }),
    prisma.reservation.groupBy({ by: ["siteId"], where: { siteId: { in: ids } }, _count: true }),
  ]);
  const count = (list: { siteId: string; _count: number }[], id: string) => list.find((x) => x.siteId === id)?._count ?? 0;
  return NextResponse.json(
    sites.map((s) => ({
      slug: s.slug,
      name: s.name,
      propertyType: s.propertyType,
      themeColor: s.themeColor,
      photo: s.heroPhoto || parsePhotoLines(s.photos)[0]?.src || "",
      upcoming: count(upcoming, s.id),
      reservations: count(total, s.id),
      revenueYear: revenue.find((x) => x.siteId === s.id)?._sum.totalPrice ?? 0,
    }))
  );
}
