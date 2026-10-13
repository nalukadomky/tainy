import { notFound } from "next/navigation";
import { ensureGeo } from "@/lib/geocode";
import { prisma } from "@/lib/prisma";
import { SiteView } from "@/components/SiteView";
import { DemoBar } from "@/components/DemoBar";
import { DEMO_SITE_ID, siteWhere } from "@/lib/demo";
import { blockedRanges } from "@/lib/availability";
import { addDays, toISO, todayISO } from "@/lib/stay";
import { toSiteViewData } from "@/lib/siteView";
import { redirectToCustomDomain } from "@/lib/domain-redirect";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Titulek podle názvu webu (důležité hlavně na vlastní doméně a ve vyhledávačích)
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const site = await prisma.site.findFirst({ where: siteWhere((await params).slug), select: { name: true, tagline: true } });
  if (!site) return {};
  return { title: site.name || "tainy", description: site.tagline || undefined };
}

export default async function SitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await prisma.site.findFirst({
    where: siteWhere(slug),
    include: { priceRules: { orderBy: { startDate: "asc" } } },
  });
  // Účet jen s widgetem nemá veřejný web — rezervace jsou na webu majitele
  if (!site || site.widgetOnly) notFound();
  await redirectToCustomDomain(site);

  // Obsazenost se načítá spolu se stránkou, takže kalendář je vyplněný
  // hned v prvním renderu a neprobliká prázdný.
  // Souřadnice pro „Kde nás najdete“ (u adresy zadané dřív se dohledají jednou)
  const [booked, geo] = await Promise.all([blockedRanges(site.id, addDays(todayISO(), -40)), ensureGeo(site)]);
  // Lišta „ukázkový web“ jen pro návštěvníky — majitel (např. přes „Zobrazit web“) vidí čistý web
  const demoBar = site.id === DEMO_SITE_ID && (await getUser())?.id !== site.ownerId;

  return (
    <>
      {demoBar && <DemoBar />}
      <SiteView
        booked={booked}
        site={toSiteViewData({
          ...site,
          geo,
          priceRules: site.priceRules.map((r) => ({ ...r, startDate: toISO(r.startDate), endDate: toISO(r.endDate) })),
        })}
      />
    </>
  );
}
