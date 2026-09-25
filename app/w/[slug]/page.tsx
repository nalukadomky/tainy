import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SiteView } from "@/components/SiteView";
import { DemoBar } from "@/components/DemoBar";
import { blockedRanges } from "@/lib/availability";
import { addDays, toISO, todayISO } from "@/lib/stay";
import { parseCategories } from "@/lib/guests";

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
        site={{
          slug: site.slug,
          name: site.name,
          tagline: site.tagline,
          description: site.description,
          propertyType: site.propertyType,
          pricePerNight: site.pricePerNight,
          pricingMode: site.pricingMode === "person" ? "person" : "unit",
          weekend: {
            value: site.weekendValue,
            unit: site.weekendUnit === "czk" ? "czk" : "pct",
          },
          maxGuests: site.maxGuests,
          amenities: site.amenities,
          photos: site.photos,
          guestMode: site.guestMode,
          categories: parseCategories(site.guestCategories, site.pricingMode),
          contactEmail: site.contactEmail,
          contactPhone: site.contactPhone,
          minNights: site.minNights,
          leadTimeDays: site.leadTimeDays,
          checkInTime: site.checkInTime,
          checkOutTime: site.checkOutTime,
          cleaningFee: site.cleaningFee,
          touristTax: site.touristTax,
          paymentMode: site.bankAccount ? "qr" : "onsite",
          cancellationPolicy: site.cancellationPolicy,
          priceRules: site.priceRules.map((r) => ({
            label: r.label,
            startDate: toISO(r.startDate),
            endDate: toISO(r.endDate),
            adjust: {
              value: r.value,
              unit: r.unit === "czk" ? "czk" : "pct",
            } as const,
          })),
        }}
      />
    </>
  );
}
