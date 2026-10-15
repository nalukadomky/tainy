import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { siteWhere } from "@/lib/demo";
import { blockedRanges } from "@/lib/availability";
import { addDays, toISO, todayISO } from "@/lib/stay";
import { toSiteViewData } from "@/lib/siteView";
import { offerDesign } from "@/lib/gift-server";
import { parseWidgetSettings } from "@/lib/widget";
import { EmbedView } from "@/components/EmbedView";

// Rezervace a dárkové poukazy pro widget na cizím webu (public/widget.js je otevírá
// v iframu; ?tab=poukaz rovnou na poukazy).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const site = await prisma.site.findFirst({ where: siteWhere((await params).slug), select: { name: true } });
  return { title: site ? `Rezervace · ${site.name}` : "Rezervace", robots: { index: false } };
}

export default async function EmbedPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; inline?: string }> }) {
  const { slug } = await params;
  const q = await searchParams;
  // ?inline=1 = sekce přímo ve stránce majitele (ne okno nad webem)
  const inline = q.inline === "1";
  const site = await prisma.site.findFirst({
    where: siteWhere(slug),
    include: {
      priceRules: { orderBy: { startDate: "asc" } },
      giftOffers: { where: { onSale: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!site) notFound();
  const booked = await blockedRanges(site.id, addDays(todayISO(), -40));
  return (
    <EmbedView
      booked={booked}
      inline={inline}
      offers={(site.bankAccount && (!inline || parseWidgetSettings(site.widgetSettings).gifts) ? site.giftOffers : []).map((o) => ({ ...offerDesign(o), id: o.id }))}
      initialTab={q.tab === "poukaz" ? "poukaz" : "rezervace"}
      site={toSiteViewData({
        ...site,
        priceRules: site.priceRules.map((r) => ({ ...r, startDate: toISO(r.startDate), endDate: toISO(r.endDate) })),
      })}
    />
  );
}
