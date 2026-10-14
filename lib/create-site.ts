import "server-only";
import { prisma } from "@/lib/prisma";
import { cleanTheme } from "@/lib/theme";
import { slugify } from "@/lib/site-slug";

// Založení nového webu (registrace, import webu). Adresa webu se odvodí
// z názvu; když je obsazená, dostane krátkou koncovku.

export type NewSite = {
  name: string;
  pricePerNight: number;
  tagline?: string;
  description?: string;
  propertyType?: string;
  pricingMode?: string;
  weekendValue?: number;
  weekendUnit?: string;
  maxGuests?: number;
  amenities?: string;
  themeColor?: string;
  contactEmail?: string;
  contactPhone?: string;
  widgetOnly?: boolean;
};

export async function createSite(ownerId: string, body: NewSite) {
  let slug = slugify(body.name) || "muj-web";
  const existing = await prisma.site.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  return prisma.site.create({
    data: {
      slug,
      ownerId,
      name: String(body.name),
      tagline: String(body.tagline ?? ""),
      description: String(body.description ?? ""),
      propertyType: String(body.propertyType ?? "chata"),
      pricePerNight: Number(body.pricePerNight),
      pricingMode: body.pricingMode === "person" ? "person" : "unit",
      weekendValue: Math.max(-90, Math.min(1_000_000, Math.round(Number(body.weekendValue) || 0))),
      weekendUnit: body.weekendUnit === "czk" ? "czk" : "pct",
      maxGuests: Number(body.maxGuests ?? 4),
      amenities: String(body.amenities ?? ""),
      themeColor: cleanTheme(body.themeColor),
      contactEmail: String(body.contactEmail ?? ""),
      contactPhone: String(body.contactPhone ?? ""),
      // „Mám vlastní web“ v onboardingu — jen rezervační widget
      widgetOnly: body.widgetOnly === true,
    },
  });
}
