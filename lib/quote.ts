import type { PriceRule, Site } from "@prisma/client";
import { quoteStay, type Adjust, type PricingMode, type Quote } from "@/lib/pricing";
import { parseCategories, type GuestCounts } from "@/lib/guests";
import { toISO } from "@/lib/stay";

// Cena pobytu podle ceníku webu z databáze. Jediné místo, kde se ze Site
// skládá konfigurace ceníku — používá ho zakládání rezervace i změna termínu.

export function quoteForSite(
  site: Site & { priceRules: PriceRule[] },
  startIso: string,
  endIso: string,
  counts: GuestCounts
): Quote {
  return quoteStay(
    {
      pricePerNight: site.pricePerNight,
      pricingMode: site.pricingMode as PricingMode,
      weekend: { value: site.weekendValue, unit: site.weekendUnit === "czk" ? "czk" : "pct" },
      cleaningFee: site.cleaningFee,
      touristTax: site.touristTax,
      guestMode: site.guestMode,
      categories: parseCategories(site.guestCategories),
      priceRules: site.priceRules.map((r) => ({
        label: r.label,
        startDate: toISO(r.startDate),
        endDate: toISO(r.endDate),
        adjust: { value: r.value, unit: r.unit === "czk" ? "czk" : "pct" } as Adjust,
      })),
    },
    startIso,
    endIso,
    counts
  );
}
