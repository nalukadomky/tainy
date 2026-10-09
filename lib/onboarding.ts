// Rozpracovaný web z onboardingu: stav formuláře (otázky + editor ve webu),
// převod na náhled a na tělo POST /api/sites. Web vznikne až po registraci.

import type { SiteViewData } from "@/components/SiteView";

export type OnboardingForm = {
  name: string;
  propertyType: string;
  tagline: string;
  description: string;
  maxGuests: number;
  pricePerNight: string;
  weekendPrice: string;
  pricingMode: "unit" | "person";
  amenities: string[];
  contactEmail: string;
  contactPhone: string;
};

export const EMPTY_FORM: OnboardingForm = {
  name: "",
  propertyType: "chata",
  tagline: "",
  description: "",
  maxGuests: 4,
  pricePerNight: "",
  weekendPrice: "",
  pricingMode: "unit",
  amenities: [],
  contactEmail: "",
  contactPhone: "",
};

/** Rozpracovaný formulář (přežije obnovení stránky) a tělo pro vytvoření webu po přihlášení. */
export const FORM_KEY = "tainy.onboarding";
export const DRAFT_KEY = "tainy.draft";

// Víkendová cena (Pá–Ne) se ukládá rovnou jako pevná částka — dřív se
// přepočítávala na procenta a zaokrouhlením se rozcházela se zadanou cenou.
function weekendAdjust(form: OnboardingForm): { value: number; unit: "pct" | "czk" } {
  const cena = Number(form.weekendPrice);
  return cena > 0 ? { value: Math.round(cena), unit: "czk" } : { value: 0, unit: "pct" };
}

/** Tělo pro POST /api/sites. */
export function buildDraft(form: OnboardingForm) {
  return {
    name: form.name,
    propertyType: form.propertyType,
    tagline: form.tagline,
    description: form.description,
    maxGuests: form.maxGuests,
    pricingMode: form.pricingMode,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    pricePerNight: Number(form.pricePerNight),
    weekendValue: weekendAdjust(form).value,
    weekendUnit: weekendAdjust(form).unit,
    amenities: form.amenities.join(", "),
  };
}

/** Data pro web v editoru. */
export function draftToSiteView(form: OnboardingForm): SiteViewData {
  return {
    name: form.name,
    tagline: form.tagline,
    description: form.description,
    propertyType: form.propertyType,
    pricePerNight: Number(form.pricePerNight) || 0,
    pricingMode: form.pricingMode,
    weekend: weekendAdjust(form),
    maxGuests: form.maxGuests,
    amenities: form.amenities.join(", "),
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    priceRules: [],
  };
}

/** Adresa webu pro lištu prohlížeče v editoru (skutečnou určí server). */
export function previewSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "muj-web"
  );
}

const GUESTS = (n: number) => (n === 1 ? "1 hosta" : `${n} hostů`);

/**
 * Vzorový slogan a popis podle typu ubytování — web v editoru hned vypadá
 * hotově a majitel texty jen přepíše. Prázdná pole se doplní, vlastní text zůstane.
 */
export function withSuggestedTexts(form: OnboardingForm): OnboardingForm {
  const type = form.propertyType || "ubytování";
  const Type = type.charAt(0).toUpperCase() + type.slice(1);
  return {
    ...form,
    tagline: form.tagline.trim() ? form.tagline : `${Type} pro ${GUESTS(form.maxGuests)}, kde čas plyne pomaleji`,
    description: form.description.trim()
      ? form.description
      : `Vítejte v ${form.name || "našem ubytování"}. Klidné místo pro odpočinek, výlety do okolí a večery, kdy nikam nespěcháte.\n\nČeká na vás útulné zázemí, okolní příroda a klid — ideální pro rodiny, páry i partu přátel.`,
  };
}
