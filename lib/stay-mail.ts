// Souhrn pobytu pro e-maily hostovi (StayMail) z rezervace v databázi —
// sdílí ho potvrzení rezervace, změna termínu i e-maily při změně stavu.

import type { Reservation, Site } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pricedCategories } from "@/lib/pricing";
import { describeCounts, parseCategories, parseCounts } from "@/lib/guests";
import { LEGAL_PATH, hasDoc, providerLine, providerShort } from "@/lib/legal";
import { nightsOf, stayTimes, toISO } from "@/lib/stay";
import { appUrl, type StayMail } from "@/lib/email";

/** Kategorie hostů webu a skladba hostů rezervace (starší rezervace bez rozpisu = dospělí). */
export function guestCounts(reservation: Pick<Reservation, "guests" | "guestBreakdown">, site: Site) {
  const categories = pricedCategories({
    guestMode: site.guestMode,
    categories: parseCategories(site.guestCategories, site.pricingMode),
  });
  let raw: unknown = { adult: reservation.guests };
  try {
    if (reservation.guestBreakdown) raw = JSON.parse(reservation.guestBreakdown);
  } catch {
    // starší rezervace bez rozpisu — počítá se jako dospělí
  }
  return { categories, counts: parseCounts(raw, categories) };
}

export function stayMailOf(reservation: Reservation, site: Site): StayMail {
  const { categories, counts } = guestCounts(reservation, site);
  const start = toISO(reservation.startDate);
  const end = toISO(reservation.endDate);
  return {
    publicId: reservation.publicId,
    siteName: site.name,
    guestName: reservation.guestName,
    firstName: reservation.firstName,
    email: reservation.email,
    phone: reservation.phone,
    guests: reservation.guests,
    guestSummary: describeCounts(counts, categories),
    startDate: start,
    endDate: end,
    nights: nightsOf(start, end),
    total: reservation.totalPrice,
    discount: reservation.discount,
    vatRate: reservation.vatRate,
    vatAmount: reservation.vatAmount,
    voucherCode: reservation.voucherCode,
    paid: reservation.status === "paid",
    demo: reservation.source === "demo",
    ...stayTimes(reservation, site),
    legal: {
      provider: providerLine(site),
      short: providerShort(site),
      address: site.businessAddress,
      termsUrl: hasDoc(site, "terms") ? `${appUrl()}/${site.slug}/${LEGAL_PATH.terms}` : undefined,
      privacyUrl: hasDoc(site, "privacy") ? `${appUrl()}/${site.slug}/${LEGAL_PATH.privacy}` : undefined,
    },
  };
}

/** Rezervace i s webem (nebo null, když mezitím zmizela). */
export const loadReservation = (id: string) =>
  prisma.reservation.findUnique({ where: { id }, include: { site: true } });
