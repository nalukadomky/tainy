import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { siteWhere } from "@/lib/demo";
import { blockedRanges } from "@/lib/availability";
import { addDays, toISO, todayISO } from "@/lib/stay";
import { toSiteViewData } from "@/lib/siteView";
import { EmbedView } from "@/components/EmbedView";

// Rezervace pro widget na cizím webu (public/widget.js ji otevírá v iframu).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const site = await prisma.site.findFirst({ where: siteWhere((await params).slug), select: { name: true } });
  return { title: site ? `Rezervace · ${site.name}` : "Rezervace", robots: { index: false } };
}

export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await prisma.site.findFirst({
    where: siteWhere(slug),
    include: { priceRules: { orderBy: { startDate: "asc" } } },
  });
  if (!site) notFound();
  const booked = await blockedRanges(site.id, addDays(todayISO(), -40));
  return (
    <EmbedView
      booked={booked}
      site={toSiteViewData({
        ...site,
        priceRules: site.priceRules.map((r) => ({ ...r, startDate: toISO(r.startDate), endDate: toISO(r.endDate) })),
      })}
    />
  );
}
