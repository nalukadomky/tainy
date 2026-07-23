"use client";

import { useCallback, useEffect, useState } from "react";

export type PriceRule = {
  id?: string;
  label: string;
  startDate: string;
  endDate: string;
  pct: number;
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
  weekendPct: number;
  priceRules: PriceRule[];
  maxGuests: number;
  amenities: string;
  themeColor: string;
  tier: "start" | "pro";
  contactEmail: string;
  contactPhone: string;
};

export type Reservation = {
  id: string;
  guestName: string;
  email: string;
  phone: string;
  guests: number;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: "pending" | "paid" | "cancelled";
  createdAt: string;
};

export type Cost = {
  id: string;
  label: string;
  amount: number;
  category: string;
  date: string;
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

  return { slug, site, setSite, reservations, costs, loading, error, reload };
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
