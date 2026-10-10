// Výřez fotky bez úpravy souboru: bod zaostření (x, y v %) a přiblížení.
// Fotka se vykreslí přes object-fit: cover, object-position na bod
// a zvětšení kolem téhož bodu — bod zůstane na stejném místě rámečku.

export type Crop = { x: number; y: number; zoom: number };

export const DEFAULT_CROP: Crop = { x: 50, y: 50, zoom: 1 };
export const MAX_ZOOM = 3;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function parseCrop(raw: string | null | undefined): Crop {
  const [x, y, zoom] = String(raw ?? "").split(",").map(Number);
  if (![x, y, zoom].every(Number.isFinite)) return DEFAULT_CROP;
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100), zoom: clamp(zoom, 1, MAX_ZOOM) };
}

export const serializeCrop = (c: Crop) =>
  c.x === 50 && c.y === 50 && c.zoom === 1 ? "" : `${Math.round(c.x * 10) / 10},${Math.round(c.y * 10) / 10},${Math.round(c.zoom * 100) / 100}`;

/** Styl obrázku (next/image fill) podle výřezu. */
export function cropStyle(c: Crop): React.CSSProperties {
  return {
    objectFit: "cover",
    objectPosition: `${c.x}% ${c.y}%`,
    transform: c.zoom !== 1 ? `scale(${c.zoom})` : undefined,
    transformOrigin: `${c.x}% ${c.y}%`,
  };
}
