// Převod uloženého webu na data pro <SiteView>. Používá veřejný web
// (/w/[slug], data z DB) i živý náhled v administraci (neuložený formulář),
// aby náhled vypadal přesně jako to, co uvidí hosté.

import type { SiteViewData } from "@/components/SiteView";
import { parseCategories } from "@/lib/guests";

export type SiteSource = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  propertyType: string;
  pricePerNight: number;
  pricingMode: string;
  weekendValue: number;
  weekendUnit: string;
  maxGuests: number;
  amenities: string;
  photos: string;
  heroStyle: string;
  heroPhoto: string | null;
  guestMode: string;
  guestCategories: string;
  contactEmail: string;
  contactPhone: string;
  minNights: number;
  leadTimeDays: number;
  checkInTime: string;
  checkOutTime: string;
  cleaningFee: number;
  touristTax: number;
  bankAccount: string;
  cancellationPolicy: string;
  /** Data jako ISO „YYYY-MM-DD". */
  priceRules: { label: string; startDate: string; endDate: string; value: number; unit: string }[];
};

export function toSiteViewData(site: SiteSource): SiteViewData {
  return {
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
    heroStyle: site.heroStyle === "photo" ? "photo" : "text",
    heroPhoto: site.heroPhoto ?? "",
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
      startDate: r.startDate.slice(0, 10),
      endDate: r.endDate.slice(0, 10),
      adjust: { value: r.value, unit: r.unit === "czk" ? "czk" : "pct" } as const,
    })),
  };
}
