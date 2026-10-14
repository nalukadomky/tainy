// Výsledek skenu existujícího webu (import do tainy). Sdílí ho server
// (sken, vytvoření webu) i obrazovka kontroly.

/** Nalezeno · Zkontroluj (odhad z textu) · Doplň (nenašli jsme). */
export type Mark = "found" | "check" | "missing";

export type Field<T> = { value: T; mark: Mark; /** Stránka, ze které údaj je. */ source?: string };

export type ImportPhoto = { src: string; alt: string; source: string };
export type ImportReview = { name: string; text: string; rating: number; meta: string };
export type ImportBusiness = { name: string; address: string; vatId: string; register: string };

export type ImportResult = {
  url: string;
  host: string;
  /** Prošlé stránky (cesty). */
  pages: string[];
  /** Web se skládá JavaScriptem — bez prohlížeče jsme část obsahu neviděli. */
  jsHeavy: boolean;
  name: Field<string>;
  tagline: Field<string>;
  description: Field<string>;
  about: Field<string>;
  propertyType: Field<string>;
  maxGuests: Field<number | null>;
  bedrooms: Field<number | null>;
  pricePerNight: Field<number | null>;
  checkInTime: Field<string>;
  checkOutTime: Field<string>;
  amenities: Field<string[]>;
  contactEmail: Field<string>;
  contactPhone: Field<string>;
  ico: Field<string>;
  business: ImportBusiness | null;
  address: Field<string>;
  themeColor: Field<string>;
  reviews: Field<ImportReview[]>;
  photos: ImportPhoto[];
};

/** Co majitel po kontrole odešle k vytvoření webu. */
export type ImportChoice = {
  name: string;
  tagline: string;
  description: string;
  about: string;
  propertyType: string;
  maxGuests: number;
  bedrooms: number;
  pricePerNight: number;
  checkInTime: string;
  checkOutTime: string;
  amenities: string[];
  contactEmail: string;
  contactPhone: string;
  ico: string;
  useBusiness: boolean;
  address: string;
  themeColor: string;
  useReviews: boolean;
  photos: string[];
  hero: string | null;
};

export const MAX_IMPORT_PHOTOS = 40;
