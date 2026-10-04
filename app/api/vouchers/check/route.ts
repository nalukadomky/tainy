import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pricedCategories } from "@/lib/pricing";
import { parseCategories, parseCounts } from "@/lib/guests";
import { quoteForSite } from "@/lib/quote";
import { todayISO } from "@/lib/stay";
import { applyVoucher, voucherValueLabel } from "@/lib/voucher";
import { findVoucher } from "@/lib/voucher-server";

// Veřejné ověření voucheru v rezervačním widgetu. Autoritativní kontrola
// proběhne znovu při založení rezervace — tohle je jen náhled pro hosta.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const site = await prisma.site.findUnique({
    where: { slug: String(body.site ?? "") },
    include: { priceRules: true },
  });
  if (!site) return NextResponse.json({ error: "Web nenalezen." }, { status: 404 });

  const start = String(body.startDate ?? "").slice(0, 10);
  const end = String(body.endDate ?? "").slice(0, 10);
  if (!ISO.test(start) || !ISO.test(end) || end <= start) {
    return NextResponse.json({ error: "Nejdřív vyber termín pobytu." }, { status: 400 });
  }

  const found = await findVoucher(site.id, String(body.code ?? ""));
  if (!found) return NextResponse.json({ error: "Tenhle kód neznáme — zkontroluj, jestli je správně." }, { status: 404 });

  const categories = pricedCategories({
    guestMode: site.guestMode,
    categories: parseCategories(site.guestCategories, site.pricingMode),
  });
  const quote = quoteForSite(site, start, end, parseCounts(body.guests, categories));
  const result = applyVoucher(found.rule, found.uses, quote, todayISO());
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    code: found.rule.code,
    label: voucherValueLabel(found.rule.kind, found.rule.value),
    discount: result.discount,
    total: quote.total - result.discount,
  });
}
