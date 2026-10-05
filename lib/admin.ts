"use client";

import { useCallback, useEffect, useState } from "react";
import type { Repeat } from "@/lib/costs";
import { plural, pricedCategories } from "@/lib/pricing";
import { describeCounts, parseCategories, parseCounts } from "@/lib/guests";
import { stayTimes } from "@/lib/stay";

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
  /** Úklid: výchozí úkoly (jeden na řádek) a co uklízečky uvidí (čárkou). */
  cleaningChecklist: string;
  cleanerFields: string;
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
  /** Check-in / check-out pobytu (HH:MM), zkopírované z webu při vytvoření rezervace. */
  checkInTime: string;
  checkOutTime: string;
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

// Poslední načtená data administrace (v paměti prohlížeče). Při přechodu mezi
// stránkami se ukážou hned a na pozadí se tiše obnoví — žádné čekání na server.
let cache: { slug: string; site: Site; reservations: Reservation[]; costs: Cost[]; blackouts: Blackout[] } | null = null;
const cached = () => (typeof window !== "undefined" && cache && cache.slug === getSiteSlug() ? cache : null);

/** Blokace termínu majitelem; `endDate` je den po posledním blokovaném dni. */
export type Blackout = { id: string; startDate: string; endDate: string; reason: string };

// Datový hook administrace: načte web + rezervace + náklady + blokace pro web přihlášeného
// uživatele (uložený v localStorage, jinak jeho první web).
export function useAdminData() {
  const [slug, setSlug] = useState<string | null>(() => cached()?.slug ?? null);
  const [site, setSite] = useState<Site | null>(() => cached()?.site ?? null);
  const [reservations, setReservations] = useState<Reservation[]>(() => cached()?.reservations ?? []);
  const [costs, setCosts] = useState<Cost[]>(() => cached()?.costs ?? []);
  const [blackouts, setBlackouts] = useState<Blackout[]>(() => cached()?.blackouts ?? []);
  // Načítání (a ghost loader) jen poprvé — s daty z mezipaměti se obnovuje potichu.
  const [loading, setLoading] = useState(() => !cached());
  const [error, setError] = useState("");

  // Každá změna dat (i optimistická úprava) se propíše do mezipaměti.
  useEffect(() => {
    if (slug && site) cache = { slug, site, reservations, costs, blackouts };
  }, [slug, site, reservations, costs, blackouts]);

  const reload = useCallback(async (s?: string) => {
    const silent = !!cache && cache.slug === (s ?? getSiteSlug());
    if (!silent) setLoading(true);
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

      const [siteRes, resRes, costRes, blockRes] = await Promise.all([
        fetch(`/api/sites/${useSlug}`),
        fetch(`/api/reservations?site=${useSlug}`),
        fetch(`/api/costs?site=${useSlug}`),
        fetch(`/api/blackouts?site=${useSlug}`),
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
      // Blokace, které se teprve ukládají (tmp-…), odpověď nesmí smazat.
      if (blockRes.ok) {
        const fresh: Blackout[] = await blockRes.json();
        setBlackouts((list) => [...fresh, ...list.filter((b) => b.id.startsWith("tmp-"))]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Načtení dat selhalo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Změna stavu se ukáže hned, ukládá se na pozadí; při chybě se vrátí původní.
  const setStatus = useCallback(async (id: string, status: Reservation["status"]) => {
    let before: Reservation["status"] | undefined;
    setReservations((list) =>
      list.map((r) => {
        if (r.id !== id) return r;
        before = r.status;
        return { ...r, status };
      })
    );
    const res = await fetch(`/api/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (!res?.ok) {
      if (before) setReservations((list) => list.map((r) => (r.id === id ? { ...r, status: before! } : r)));
      throw new Error("Stav se nepodařilo změnit.");
    }
  }, []);

  /** Změní check-in / check-out jedné rezervace — hned v seznamu, při chybě vrátí původní. */
  const setTimes = useCallback(
    async (id: string, patch: Partial<Pick<Reservation, "checkInTime" | "checkOutTime">>) => {
      let before: Reservation | undefined;
      setReservations((list) =>
        list.map((r) => {
          if (r.id !== id) return r;
          before = r;
          return { ...r, ...patch };
        })
      );
      const res = await fetch(`/api/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      if (!res?.ok) {
        if (before) setReservations((list) => list.map((r) => (r.id === id ? before! : r)));
        throw new Error("Čas se nepodařilo uložit.");
      }
    },
    []
  );

  /** Nahradí rezervaci v seznamu její novou verzí ze serveru (např. po změně termínu). */
  const replaceReservation = useCallback((updated: Reservation) => {
    setReservations((list) => list.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  return { slug, site, setSite, reservations, costs, setCosts, blackouts, setBlackouts, loading, error, reload, setStatus, setTimes, replaceReservation };
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}

/** Termín pobytu i s časy: „8. 10. 2026 od 15:00 – 12. 10. 2026 do 10:00". */
export function fmtStay(r: Reservation, site: Pick<Site, "checkInTime" | "checkOutTime"> | null): string {
  const t = site ? stayTimes(r, site) : r;
  const from = t.checkInTime ? ` od ${t.checkInTime}` : "";
  const to = t.checkOutTime ? ` do ${t.checkOutTime}` : "";
  return `${fmtDate(r.startDate)}${from} – ${fmtDate(r.endDate)}${to}`;
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
