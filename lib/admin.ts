"use client";

import { useCallback, useEffect, useState } from "react";
import type { Repeat } from "@/lib/costs";
import { plural, pricedCategories } from "@/lib/pricing";
import { describeCounts, parseCategories, parseCounts } from "@/lib/guests";

export type Unit = "pct" | "czk";

export type PriceRule = {
  id?: string;
  label: string;
  startDate: string;
  endDate: string;
  value: number;
  unit: Unit;
};

export type Site = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  propertyType: string;
  pricePerNight: number;
  pricingMode: "unit" | "person";
  weekendValue: number;
  weekendUnit: Unit;
  priceRules: PriceRule[];
  maxGuests: number;
  amenities: string;
  photos: string;
  heroStyle: "text" | "photo";
  heroPhoto: string;
  guestMode: "total" | "split";
  guestCategories: string;
  themeColor: string;
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
};

export type Reservation = {
  id: string;
  guestName: string;
  email: string;
  phone: string;
  guests: number;
  guestBreakdown: string;
  startDate: string;
  endDate: string;
  nightsTotal: number;
  feesTotal: number;
  totalPrice: number;
  /** Uplatněný voucher (prázdný kód = bez voucheru) a sleva v Kč. */
  voucherCode: string;
  voucherKind: string;
  voucherValue: number;
  discount: number;
  note: string;
  source: string;
  status: "pending" | "paid" | "cancelled";
  expiresAt: string | null;
  publicId: string;
  createdAt: string;
};

export type Cost = {
  id: string;
  label: string;
  amount: number;
  category: string;
  date: string;
  repeat: Repeat;
  endDate: string | null;
};

export function getSiteSlug(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tainy.site");
}

// Vrátí slug prvního webu přihlášeného uživatele (nebo null).
async function firstOwnedSlug(): Promise<string | null> {
  try {
    const res = await fetch("/api/sites");
    if (!res.ok) return null;
    const sites = await res.json();
    return Array.isArray(sites) && sites.length ? sites[0].slug : null;
  } catch {
    return null;
  }
}

// Datový hook administrace: načte web + rezervace + náklady pro web přihlášeného
// uživatele (uložený v localStorage, jinak jeho první web).
export function useAdminData() {
  const [slug, setSlug] = useState<string | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async (s?: string) => {
    setLoading(true);
    setError("");
    try {
      let useSlug = s ?? getSiteSlug();

      // Není-li uložený web, vezmi první vlastní web uživatele
      if (!useSlug) {
        useSlug = await firstOwnedSlug();
        if (!useSlug) {
          window.location.href = "/onboarding";
          return;
        }
        localStorage.setItem("tainy.site", useSlug);
      }
      setSlug(useSlug);

      const [siteRes, resRes, costRes] = await Promise.all([
        fetch(`/api/sites/${useSlug}`),
        fetch(`/api/reservations?site=${useSlug}`),
        fetch(`/api/costs?site=${useSlug}`),
      ]);

      // Uložený web už není náš (403) nebo neexistuje (404) — zkus první vlastní
      if (!siteRes.ok || !resRes.ok) {
        const first = await firstOwnedSlug();
        if (!first) {
          window.location.href = "/onboarding";
          return;
        }
        if (first !== useSlug) {
          localStorage.setItem("tainy.site", first);
          return reload(first);
        }
        throw new Error("Web se nepodařilo načíst.");
      }

      setSite(await siteRes.json());
      setReservations(await resRes.json());
      setCosts(costRes.ok ? await costRes.json() : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Načtení dat selhalo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Změna stavu bez znovunačtení celé stránky: seznam se upraví na místě.
  const setStatus = useCallback(async (id: string, status: Reservation["status"]) => {
    const res = await fetch(`/api/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("Stav se nepodařilo změnit.");
    setReservations((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
  }, []);

  /** Nahradí rezervaci v seznamu její novou verzí ze serveru (např. po změně termínu). */
  const replaceReservation = useCallback((updated: Reservation) => {
    setReservations((list) => list.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  return { slug, site, setSite, reservations, costs, setCosts, loading, error, reload, setStatus, replaceReservation };
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}

export const STATUS_LABEL: Record<Reservation["status"], string> = {
  pending: "Čeká na platbu",
  paid: "Zaplaceno",
  cancelled: "Zrušeno",
};

export const STATUS_STYLE: Record<Reservation["status"], string> = {
  pending: "bg-amber/15 text-[#92600a]",
  paid: "bg-pine/10 text-pine",
  cancelled: "bg-line/60 text-soft line-through",
};

/** Skladba hostů rezervace („2× dospělí · 1× pes"), pokud ji web rozlišuje; jinak počet. */
export function guestsLabel(r: Reservation, site: Site | null): string {
  const categories = pricedCategories({
    guestMode: site?.guestMode,
    pricingMode: site?.pricingMode,
    categories: parseCategories(site?.guestCategories ?? "", site?.pricingMode),
  });
  try {
    if (!r.guestBreakdown) throw new Error();
    const popis = describeCounts(parseCounts(JSON.parse(r.guestBreakdown), categories), categories);
    if (popis) return popis;
  } catch {
    // starší rezervace bez rozpisu
  }
  return `${r.guests} ${plural(r.guests, "host", "hosté", "hostů")}`;
}

export const SOURCE_LABEL: Record<string, string> = {
  web: "Web",
  airbnb: "Airbnb",
  booking: "Booking",
  manual: "Ručně",
};

/** Hledání bez ohledu na velikost písmen a diakritiku („kral" najde „Král"). */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
