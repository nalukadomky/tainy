// Převod uloženého webu na data pro <SiteView>. Používá veřejný web
// (/w/[slug], data z DB) i živý náhled v administraci (neuložený formulář),
// aby náhled vypadal přesně jako to, co uvidí hosté.

import type { SiteViewData } from "@/components/SiteView";
import { parseCategories } from "@/lib/guests";
import { parseSleeping } from "@/lib/sleeping";
import { vatRateOf } from "@/lib/vat";
import { hasDoc, privacyTextOf, termsTextOf, type LegalSource } from "@/lib/legal";
import type { LegalDocData } from "@/components/LegalModal";

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
  sleeping?: string;
  vatPayer?: boolean;
  vatRate?: number;
  // Provozovatel a dokumenty — v průvodci zakládání webu ještě nejsou.
  businessName?: string;
  businessId?: string;
  vatId?: string;
  businessAddress?: string;
  businessRegister?: string;
  termsText?: string;
  termsPdf?: string;
  termsUpdatedAt?: Date | string | null;
  privacyText?: string;
  privacyPdf?: string;
  privacyUpdatedAt?: Date | string | null;
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
    sleeping: parseSleeping(site.sleeping),
    vatRate: vatRateOf(site),
    provider: {
      name: site.businessName ?? "",
      id: site.businessId ?? "",
      vatId: site.vatId ?? "",
      address: site.businessAddress ?? "",
    },
    hasTerms: hasDoc(site, "terms"),
    hasPrivacy: hasDoc(site, "privacy"),
    docs: {
      terms: legalDoc(site, "terms"),
      privacy: legalDoc(site, "privacy"),
    },
    priceRules: site.priceRules.map((r) => ({
      label: r.label,
      startDate: r.startDate.slice(0, 10),
      endDate: r.endDate.slice(0, 10),
      adjust: { value: r.value, unit: r.unit === "czk" ? "czk" : "pct" } as const,
    })),
  };
}

/** Obsah dokumentu pro okno na webu (vlastní znění, PDF, nebo výchozí text). */
function legalDoc(site: SiteSource, kind: "terms" | "privacy"): LegalDocData | undefined {
  const src = site as LegalSource;
  if (!hasDoc(src, kind)) return undefined;
  const own = kind === "terms" ? site.termsPdf || site.termsText?.trim() : site.privacyPdf || site.privacyText?.trim();
  const updated = kind === "terms" ? site.termsUpdatedAt : site.privacyUpdatedAt;
  return {
    text: kind === "terms" ? termsTextOf(src) : privacyTextOf(src),
    pdf: (kind === "terms" ? site.termsPdf : site.privacyPdf) ?? "",
    updatedAt: own && updated ? new Date(updated).toISOString() : null,
  };
}
