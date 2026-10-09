// Poloha ubytování na veřejném webu. Majitel volí při tvorbě webu, jak přesně ji ukázat:
//   exact     — přesná adresa a špendlík na mapě
//   area      — přibližně na mapě: obec a kruh v okolí
//   area-text — přibližně textem: jen obec, bez mapy
//   none      — sekce „Kde nás najdete“ se nezobrazí
// Hosté dostanou přesnou adresu vždy v e-mailu před příjezdem.
// Souřadnice se dohledají z adresy při uložení (lib/geocode.ts) a do webu
// jde jen to, co odpovídá zvolené přesnosti — v režimu „area“ nikdy přesný bod.

export type LocationMode = "none" | "area-text" | "area" | "exact";
export const LOCATION_MODES: LocationMode[] = ["none", "area-text", "area", "exact"];

export type Point = { lat: number; lng: number };
/** Uložené souřadnice: přesný bod adresy a střed obce; manual = bod určil majitel špendlíkem. */
export type Geo = { exact?: Point; area?: Point & { label: string }; manual?: boolean };

/** Co dostane veřejný web (u „area-text“ bez souřadnic). */
export type PublicLocation =
  | { mode: "area" | "exact"; lat: number; lng: number; label: string }
  | { mode: "area-text"; label: string };

export const cleanLocationMode = (v: unknown): LocationMode =>
  LOCATION_MODES.includes(v as LocationMode) ? (v as LocationMode) : "area";

export function parseGeo(raw: string | null | undefined): Geo {
  try {
    const g = raw ? JSON.parse(raw) : {};
    const pt = (p: unknown): Point | undefined => {
      const o = p as Record<string, unknown> | undefined;
      return o && Number.isFinite(o.lat) && Number.isFinite(o.lng) ? { lat: Number(o.lat), lng: Number(o.lng) } : undefined;
    };
    const area = pt(g?.area);
    return {
      exact: pt(g?.exact),
      area: area ? { ...area, label: String(g.area.label ?? "").slice(0, 120) } : undefined,
      manual: g?.manual === true || undefined,
    };
  } catch {
    return {};
  }
}

/** Poloha pro veřejný web podle volby majitele (nebo null = nezobrazovat). */
export function publicLocation(site: { locationMode?: string; geo?: string; arrivalAddress?: string }): PublicLocation | null {
  const mode = cleanLocationMode(site.locationMode);
  if (mode === "none") return null;
  const geo = parseGeo(site.geo);
  if (mode === "exact" && geo.exact && site.arrivalAddress?.trim())
    return { mode, ...geo.exact, label: site.arrivalAddress.trim() };
  if (!geo.area) return null;
  if (mode === "area-text") return { mode, label: geo.area.label };
  return { mode: "area", lat: geo.area.lat, lng: geo.area.lng, label: geo.area.label };
}

const valid = (lat: number, lng: number): Point | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }
    : null;

/** 50°58'50.6"N → 50.98 (jih a západ záporně). */
function dms(deg: string, min = "0", sec = "0", hemi = ""): number {
  const v = Number(deg.replace(",", ".")) + Number(min.replace(",", ".")) / 60 + Number(sec.replace(",", ".")) / 3600;
  return /[SWJZ]/i.test(hemi) ? -v : v;
}

/**
 * Bod z toho, co majitel vloží: odkaz z Google Map nebo Mapy.cz, desetinné
 * souřadnice („50.9807, 15.0764“) nebo stupně („50°58'50.6"N 15°04'35.0"E“).
 * Zkrácené odkazy (maps.app.goo.gl) rozbalí server — tady vrátí null.
 */
export function parseCoordinates(input: string): Point | null {
  const t = input.trim();
  if (!t) return null;
  let m: RegExpMatchArray | null;
  // Google: přesný bod místa (!3d…!4d…) má přednost před středem mapy (@…)
  if ((m = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/))) return valid(+m[1], +m[2]);
  if ((m = t.match(/[?&](?:q|query|ll|destination|daddr)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i)))
    return valid(+m[1], +m[2]);
  if ((m = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/))) return valid(+m[1], +m[2]);
  // Mapy.cz: x = délka, y = šířka; případně id=délka,šířka u source=coor
  if (/mapy\.(cz|com)/i.test(t)) {
    const id = t.match(/[?&]id=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i);
    if (/source=coor/i.test(t) && id) return valid(+id[2], +id[1]);
    const x = t.match(/[?&]x=(-?\d+(?:\.\d+)?)/i);
    const y = t.match(/[?&]y=(-?\d+(?:\.\d+)?)/i);
    if (x && y) return valid(+y[1], +x[1]);
  }
  // Stupně, minuty, vteřiny (i jen stupně a minuty)
  const deg = /(\d{1,3}(?:[.,]\d+)?)\s*°\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|”|'')\s*)?([NSEWSJVZ])?/gi;
  const parts = [...t.matchAll(deg)];
  if (parts.length >= 2 && t.includes("°")) {
    const [a, b] = parts;
    let lat = dms(a[1], a[2], a[3], a[4]);
    let lng = dms(b[1], b[2], b[3], b[4]);
    if (/[EWVZ]/i.test(a[4] ?? "") && /[NSJ]/i.test(b[4] ?? "")) [lat, lng] = [lng, lat];
    return valid(lat, lng);
  }
  // Desetinná čísla „50.9807, 15.0764“ (i s N/E nebo středníkem)
  if ((m = t.match(/^(-?\d{1,3}\.\d+)\s*°?\s*([NS])?\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*°?\s*([EW])?$/i))) {
    const lat = /S/i.test(m[2] ?? "") ? -m[1] : +m[1];
    const lng = /W/i.test(m[4] ?? "") ? -m[3] : +m[3];
    return valid(lat, lng);
  }
  return null;
}

/** Zkrácený odkaz z Google Map — rozbalí ho server (/api/geo/resolve). */
export const isShortMapLink = (t: string) => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//i.test(t.trim());

/** Leží bod zhruba v Česku? (jen upozornění, nic nezakazuje) */
export const inCzechia = (p: Point) => p.lat > 48.5 && p.lat < 51.1 && p.lng > 12 && p.lng < 18.9;
