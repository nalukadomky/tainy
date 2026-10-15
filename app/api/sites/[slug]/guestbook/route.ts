import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { guestCryptoReady } from "@/lib/guest-crypto";
import { buildBook, logAccess, pendingForeigners } from "@/lib/guestbook-server";
import { isTaxPeriod, periodKey, recentPeriods } from "@/lib/guestbook";
import { parseTaxSource } from "@/lib/tourist-tax";
import { todayISO } from "@/lib/stay";

// Kniha ubytovaných za období (měsíc / čtvrtletí / pololetí / rok podle
// nastavení odvodu). Údaje se dešifrují jen tady, doklady jsou zkrácené.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const site = await prisma.site.findUniqueOrThrow({ where: { id: guard.site.id } });
  const taxPeriod = isTaxPeriod(site.taxPeriod) ? site.taxPeriod : "quarter";
  const periods = recentPeriods(taxPeriod, 12);
  const asked = req.nextUrl.searchParams.get("period") ?? "";
  const period = periods.includes(asked) ? asked : periodKey(todayISO(), taxPeriod);
  const ready = guestCryptoReady();
  const [book, pending] = ready ? await Promise.all([buildBook(site, period), pendingForeigners(site.id)]) : [null, null];
  if (book?.rows.length) await logAccess(site.id, guard.user.email, "view", `kniha ${period}`);
  return NextResponse.json(
    {
      ready,
      period,
      periods,
      taxPeriod,
      book,
      ubyportPending: pending?.list ?? [],
      taxSource: parseTaxSource(site.taxSource),
      ubyport: { idub: site.ubyportIdub, abbr: site.ubyportAbbr },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
