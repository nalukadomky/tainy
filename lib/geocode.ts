// Dohledání souřadnic z adresy ubytování (Photon nad OpenStreetMap — zdarma,
// bez klíče). Jen na serveru, při uložení adresy v Nastavení.

import { prisma } from "@/lib/prisma";
import type { Geo, Point } from "@/lib/location";

/** Vzdálenost dvou bodů v km (stačí přibližně). */
function km(a: Point, b: Point): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

const PHOTON = "https://photon.komoot.io/api/";
const CZ_BBOX = "12.09,48.55,18.86,51.06";

type Feature = { geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> };

async function search(q: string, extra: Record<string, string> = {}): Promise<Feature[]> {
  const url = `${PHOTON}?${new URLSearchParams({ q, limit: "1", bbox: CZ_BBOX, ...extra })}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "tainy.cz (geocoding)" },
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 86400 },
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.features) ? data.features : [];
}

const point = (f?: Feature) => {
  const c = f?.geometry?.coordinates;
  return c && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? { lat: c[1], lng: c[0] } : undefined;
};

/**
 * Přesný bod adresy a střed obce (pro přibližnou polohu). Když se celá adresa
 * nenajde, zkusí se obec z konce adresy — pak je jen přibližná poloha (bez přesného bodu).
 */
export async function geocodeAddress(address: string): Promise<Geo> {
  const q = address.trim();
  if (q.length < 3) return {};
  let [hit] = await search(q);
  let precise = true;
  if (!point(hit)) {
    const town = q.split(",").pop()!.replace(/\d{3}\s?\d{2}/, "").trim();
    if (town && town !== q) [hit] = await search(town, { osm_tag: "place" });
    precise = false;
  }
  const exact = point(hit);
  if (!hit || !exact) return {};
  const p = hit.properties ?? {};
  const town = p.city || p.locality || p.district || p.name || "";
  // Střed obce — ne bod domu, ať z kruhu na mapě nejde dům dohledat
  // (hledá se v okolí adresy — obcí stejného jména je v Česku víc)
  const label = [town, p.county].filter(Boolean).join(", ") || "Okolí ubytování";
  let center: Point | undefined;
  if (town) {
    const [place] = await search(town, { osm_tag: "place", lat: String(exact.lat), lon: String(exact.lng) });
    const c = point(place);
    if (c && km(c, exact) < 10) center = c;
  }
  // Obec nenalezena: bod zaokrouhlený na ~1,5 km — kruh pořád dům neprozradí
  center ??= { lat: Math.round(exact.lat * 75) / 75, lng: Math.round(exact.lng * 50) / 50 };
  return { exact: precise ? exact : undefined, area: { ...center, label } };
}

/**
 * Poloha určená majitelem špendlíkem (nebo odkazem / souřadnicemi): bod je
 * přesná poloha, obec a její střed se dohledají zpětně (Photon reverse).
 */
export async function geoFromPoint(pt: Point): Promise<Geo> {
  const url = `https://photon.komoot.io/reverse?${new URLSearchParams({ lat: String(pt.lat), lon: String(pt.lng) })}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "tainy.cz (geocoding)" },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const p: Record<string, string> = data?.features?.[0]?.properties ?? {};
  const town = p.city || p.locality || p.district || p.name || "";
  const label = [town, p.county].filter(Boolean).join(", ") || "Okolí ubytování";
  let center: Point | undefined;
  if (town) {
    const [place] = await search(town, { osm_tag: "place", lat: String(pt.lat), lon: String(pt.lng) });
    const c = point(place);
    if (c && km(c, pt) < 10) center = c;
  }
  center ??= { lat: Math.round(pt.lat * 75) / 75, lng: Math.round(pt.lng * 50) / 50 };
  return { exact: pt, area: { ...center, label }, manual: true };
}

const RETRY_MS = 24 * 3600_000;

/**
 * Souřadnice pro web, který má adresu, ale ještě je nemá (adresa zadaná dřív,
 * než se souřadnice dohledávaly, nebo výpadek služby). Dohledá a uloží je;
 * neúspěch si poznamená a zkusí to znovu nejdřív za den.
 */
export async function ensureGeo(site: { id: string; arrivalAddress: string; geo: string }): Promise<string> {
  if (!site.arrivalAddress.trim()) return site.geo;
  let tried: string | undefined;
  try {
    const g = site.geo ? JSON.parse(site.geo) : null;
    if (g?.exact || g?.area) return site.geo;
    tried = g?.tried;
  } catch {}
  if (tried && Date.now() - new Date(tried).getTime() < RETRY_MS) return site.geo;
  const found = await geocodeAddress(site.arrivalAddress).catch(() => ({}) as Geo);
  const geo = JSON.stringify(found.exact || found.area ? found : { tried: new Date().toISOString() });
  await prisma.site.update({ where: { id: site.id }, data: { geo } }).catch(() => {});
  return geo;
}
