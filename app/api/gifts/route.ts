import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { cleanGift } from "@/lib/gift";
import { toISO } from "@/lib/stay";

// Dárkové poukazy majitele: nabídka (GET + založení) a prodané objednávky.

export async function GET(req: NextRequest) {
  const guard = await requireSiteOwnerBySlug(req.nextUrl.searchParams.get("site") ?? "");
  if (!guard.ok) return deny(guard.status);
  const siteId = guard.site.id;
  const [offers, orders, used] = await Promise.all([
    prisma.giftOffer.findMany({ where: { siteId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { orders: { where: { status: "paid" } } } } } }),
    prisma.giftOrder.findMany({ where: { siteId }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.reservation.findMany({
      where: { siteId, status: { not: "cancelled" }, voucherCode: { not: "" } },
      select: { voucherCode: true, startDate: true, endDate: true },
    }),
  ]);
  return NextResponse.json({
    offers: offers.map(({ _count, ...o }) => ({ ...o, sold: _count.orders })),
    orders: orders.map((o) => {
      const stay = o.code ? used.find((r) => r.voucherCode === o.code) : undefined;
      return {
        id: o.id,
        publicId: o.publicId,
        design: o.design,
        price: o.price,
        buyerName: o.buyerName,
        buyerEmail: o.buyerEmail,
        recipient: o.recipient,
        status: stay ? "used" : o.status,
        code: o.code,
        createdAt: o.createdAt,
        validTo: o.validTo ? toISO(o.validTo) : null,
        usedFor: stay ? { start: toISO(stay.startDate), end: toISO(stay.endDate) } : null,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { site?: string; design?: unknown; onSale?: boolean };
  const guard = await requireSiteOwnerBySlug(String(body.site ?? ""));
  if (!guard.ok) return deny(guard.status);
  const d = cleanGift(body.design);
  const offer = await prisma.giftOffer.create({ data: { siteId: guard.site.id, ...d, onSale: body.onSale !== false } });
  return NextResponse.json({ ...offer, sold: 0 }, { status: 201 });
}
