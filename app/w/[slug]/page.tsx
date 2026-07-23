import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SiteView } from "@/components/SiteView";

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

  return (
    <SiteView
      site={{
        slug: site.slug,
        name: site.name,
        tagline: site.tagline,
        description: site.description,
        propertyType: site.propertyType,
        pricePerNight: site.pricePerNight,
        pricingMode: site.pricingMode === "person" ? "person" : "unit",
        weekendPct: site.weekendPct,
        maxGuests: site.maxGuests,
        amenities: site.amenities,
        contactEmail: site.contactEmail,
        contactPhone: site.contactPhone,
        priceRules: site.priceRules.map((r) => ({
          label: r.label,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          pct: r.pct,
        })),
      }}
    />
  );
}
