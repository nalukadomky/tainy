"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

// Mezipaměť dat jednotlivých sekcí administrace (vouchery, úkoly, kniha…) v paměti
// prohlížeče. Klíčem je URL, ze které data přišla. Sekce se při další návštěvě ukáže
// hned z mezipaměti a na pozadí se tiše obnoví; menu ji navíc přednačítá dopředu
// (prefetchJson), takže ani první otevření obvykle nečeká na server.

const store = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

export const cachedJson = <T,>(url: string | null): T | null => (url ? ((store.get(url) as T | undefined) ?? null) : null);

/** Stáhne JSON a uloží ho do mezipaměti (souběžné požadavky na stejnou URL sdílí jeden). */
export function fetchJson<T>(url: string): Promise<T | null> {
  const running = inflight.get(url);
  if (running) return running as Promise<T | null>;
  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => {
      if (d !== null) store.set(url, d);
      return d as T | null;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Přednačtení na pozadí — jen když data ještě nemáme. */
export function prefetchJson(url: string) {
  if (!store.has(url) && !inflight.has(url)) void fetchJson(url);
}

/**
 * Jako useState, jen počáteční hodnota se vezme z mezipaměti a každá změna
 * (i optimistická úprava) se do ní propíše. `url` = klíč (null = ještě nevíme, např. bez slugu).
 */
export function useCachedJson<T>(url: string | null): [T | null, Dispatch<SetStateAction<T | null>>] {
  const [state, setState] = useState<{ url: string | null; value: T | null }>(() => ({ url, value: cachedJson<T>(url) }));
  // Změna klíče (jiný web, jiné období) — vezmi, co pro něj máme v mezipaměti
  let current = state;
  if (state.url !== url) {
    current = { url, value: cachedJson<T>(url) };
    setState(current);
  }
  const set = useCallback<Dispatch<SetStateAction<T | null>>>((update) => {
    setState((prev) => {
      const value = typeof update === "function" ? (update as (v: T | null) => T | null)(prev.value) : update;
      if (prev.url && value !== null) store.set(prev.url, value);
      return { url: prev.url, value };
    });
  }, []);
  return [current.value, set];
}

/** Setter jedné položky objektu v mezipaměti (např. `todos` z odpovědi {todos, cleaners}). */
export function fieldSetter<T extends object, K extends keyof T>(
  set: Dispatch<SetStateAction<T | null>>,
  key: K,
  empty: T[K],
): Dispatch<SetStateAction<T[K]>> {
  return (update) =>
    set((prev) => {
      const before = prev ? prev[key] : empty;
      const value = typeof update === "function" ? (update as (v: T[K]) => T[K])(before) : update;
      return { ...(prev ?? ({} as T)), [key]: value };
    });
}

/** Adresy dat sekcí — stránky i přednačítání v menu musí použít stejný klíč. */
export const SECTION_URL = {
  vouchers: (slug: string) => `/api/vouchers?site=${encodeURIComponent(slug)}`,
  gifts: (slug: string) => `/api/gifts?site=${encodeURIComponent(slug)}`,
  todos: (slug: string) => `/api/todos?site=${encodeURIComponent(slug)}`,
  cleaners: (slug: string) => `/api/cleaners?site=${encodeURIComponent(slug)}`,
  cleanings: (slug: string) => `/api/cleanings?site=${encodeURIComponent(slug)}`,
  guestbook: (slug: string, period = "") => `/api/sites/${encodeURIComponent(slug)}/guestbook${period ? `?period=${period}` : ""}`,
  overview: () => "/api/sites/overview",
};

/** Data, která sekce na dané adrese potřebuje navíc k useAdminData. */
function sectionUrls(href: string, slug: string): string[] {
  if (href.startsWith("/admin/vouchery/poukazy")) return [SECTION_URL.gifts(slug)];
  if (href.startsWith("/admin/vouchery")) return [SECTION_URL.vouchers(slug), SECTION_URL.gifts(slug)];
  if (href.startsWith("/admin/ukoly")) return [SECTION_URL.todos(slug)];
  if (href.startsWith("/admin/kalendar/uklid")) return [SECTION_URL.cleanings(slug), SECTION_URL.cleaners(slug)];
  if (href.startsWith("/admin/rezervace/kniha")) return [SECTION_URL.guestbook(slug)];
  if (href.startsWith("/admin/nastaveni/nemovitosti")) return [SECTION_URL.overview()];
  return [];
}

/** Přednačte data sekce (najetí myší / dotyk na položku menu). */
export function prefetchSection(href: string) {
  const slug = typeof window === "undefined" ? null : localStorage.getItem("tainy.site");
  if (slug) sectionUrls(href, slug).forEach(prefetchJson);
}

/**
 * Po otevření administrace postupně přednačte data těchto sekcí (ne naráz, ať nebrzdí
 * aktuální stránku). Kniha ubytovaných ne — každé její načtení se zapisuje do historie
 * přístupů k údajům hostů, takže jen při najetí na její záložku.
 */
export const WARM_SECTIONS = ["/admin/ukoly", "/admin/kalendar/uklid", "/admin/vouchery", "/admin/nastaveni/nemovitosti"];
