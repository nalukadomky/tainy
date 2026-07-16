import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Veřejná obsazenost pro kalendář — jen termíny, žádné údaje o hostech.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) return NextResponse.json({ error: "Web nenalezen." }, { status: 404 });

  const reservations = await prisma.reservation.findMany({
    where: {
      siteId: site.id,
      status: { not: "cancelled" },
      endDate: { gte: new Date(Date.now() - 40 * 86_400_000) },
    },
    select: { startDate: true, endDate: true },
  });

  return NextResponse.json(
    reservations.map((r) => ({
      start: r.startDate.toISOString().slice(0, 10),
      end: r.endDate.toISOString().slice(0, 10),
    }))
  );
}
