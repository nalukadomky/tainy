import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { siteWhere } from "@/lib/demo";
import { themeHex } from "@/lib/theme";
import { parseWidgetSettings } from "@/lib/widget";

// Nastavení plovoucího tlačítka pro public/widget.js (gifts = prodává poukazy → i tlačítko Dárkový poukaz) — volá ho cizí web, proto CORS pro všechny.
const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60, s-maxage=60" };

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await prisma.site.findFirst({
    where: siteWhere(slug),
    select: { slug: true, name: true, themeColor: true, widgetSettings: true, bankAccount: true, _count: { select: { giftOffers: { where: { onSale: true } } } } },
  });
  if (!site) return NextResponse.json({ error: "Ubytování nenalezeno." }, { status: 404, headers: CORS });
  const w = parseWidgetSettings(site.widgetSettings);
  return NextResponse.json(
    { slug: site.slug, name: site.name, color: themeHex(site.themeColor), label: w.label, position: w.position, mode: w.mode, floating: w.floating, gifts: !!site.bankAccount && site._count.giftOffers > 0 },
    { headers: CORS },
  );
}
