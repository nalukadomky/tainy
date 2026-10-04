import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SiteView } from "@/components/SiteView";
import { DemoBar } from "@/components/DemoBar";
import { blockedRanges } from "@/lib/availability";
import { addDays, toISO, todayISO } from "@/lib/stay";
import { toSiteViewData } from "@/lib/siteView";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await prisma.site.findUnique({
    where: { slug },
    include: { priceRules: { orderBy: { startDate: "asc" } } },
  });
  if (!site) notFound();

  // Obsazenost se načítá spolu se stránkou, takže kalendář je vyplněný
  // hned v prvním renderu a neprobliká prázdný.
  const booked = await blockedRanges(site.id, addDays(todayISO(), -40));

  return (
    <>
      {slug === "demo" && <DemoBar />}
      <SiteView
        booked={booked}
        site={toSiteViewData({
          ...site,
          priceRules: site.priceRules.map((r) => ({ ...r, startDate: toISO(r.startDate), endDate: toISO(r.endDate) })),
        })}
      />
    </>
  );
}
