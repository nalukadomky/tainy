"use client";

// Malý náhled mapy se špendlíkem (bez knihovny): poskládá dlaždice
// OpenStreetMap kolem bodu tak, aby byl bod přesně uprostřed.

const TILE = 256;

function worldPx(lat: number, lng: number, z: number) {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export function MiniMap({
  lat,
  lng,
  width = 120,
  height = 80,
  zoom = 15,
}: {
  lat: number;
  lng: number;
  width?: number;
  height?: number;
  zoom?: number;
}) {
  const p = worldPx(lat, lng, zoom);
  const left = p.x - width / 2;
  const top = p.y - height / 2;
  const tiles: { x: number; y: number }[] = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++)
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) tiles.push({ x: tx, y: ty });
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-lg border border-line bg-bg"
      style={{ width, height }}
      title="Mapa © OpenStreetMap"
    >
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${t.x}-${t.y}`}
          src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
          alt=""
          loading="lazy"
          draggable={false}
          style={{ position: "absolute", left: t.x * TILE - left, top: t.y * TILE - top, width: TILE, height: TILE, maxWidth: "none" }}
        />
      ))}
      {/* Špendlík: hrot přesně na bodu */}
      <svg
        viewBox="0 0 34 44"
        width="22"
        height="28"
        aria-hidden
        style={{ position: "absolute", left: width / 2 - 11, top: height / 2 - 27, filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))" }}
      >
        <path d="M17 43C17 43 32 27.5 32 16.5A15 15 0 0 0 2 16.5C2 27.5 17 43 17 43Z" fill="var(--pine)" stroke="#fff" strokeWidth="2.5" />
        <circle cx="17" cy="16.5" r="5.5" fill="#fff" />
      </svg>
    </span>
  );
}
