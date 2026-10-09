"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as LeafletMap, Marker } from "leaflet";
import { inCzechia, isShortMapLink, parseCoordinates, type Point } from "@/lib/location";

// Okno „Upřesnit polohu“: špendlík na mapě (klik / přetažení), nebo vložený
// odkaz z Google Map či Mapy.cz, nebo souřadnice. Vrátí bod — uloží ho
// LocationSettings (hned v náhledu, na serveru na pozadí).

const CZ_CENTER: Point = { lat: 49.8, lng: 15.5 };
const PIN = `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"><path d="M17 43C17 43 32 27.5 32 16.5A15 15 0 0 0 2 16.5C2 27.5 17 43 17 43Z" fill="#2c5e3f" stroke="#fff" stroke-width="2"/><circle cx="17" cy="16.5" r="5.5" fill="#fff"/></svg>`;

export default function LocationPicker({
  initial,
  onPick,
  onClose,
}: {
  initial: Point | null;
  /** Vybraný bod a název místa (obec, okres) — ukládá volající. */
  onPick: (point: Point, town: string) => void;
  onClose: () => void;
}) {
  const [point, setPoint] = useState<Point | null>(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [place, setPlace] = useState("");
  const [town, setTown] = useState("");
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);

  // Mapa (Leaflet se načte až s oknem)
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !mapEl.current) return;
      const leaflet = mod.default ?? mod;
      L.current = leaflet;
      const start = initial ?? CZ_CENTER;
      const m = leaflet.map(mapEl.current, { zoomControl: true }).setView([start.lat, start.lng], initial ? 16 : 7);
      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        })
        .addTo(m);
      m.on("click", (e) => setPoint({ lat: e.latlng.lat, lng: e.latlng.lng }));
      m.attributionControl.setPrefix(false); // bez „Leaflet“ — stačí povinné uvedení OpenStreetMap
      map.current = m;
      if (initial) placeMarker(initial);
      // Okno se animuje — po doběhnutí přepočítat velikost mapy
      setTimeout(() => m.invalidateSize(), 250);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placeMarker(p: Point) {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;
    if (!marker.current) {
      marker.current = leaflet
        .marker([p.lat, p.lng], {
          draggable: true,
          icon: leaflet.divIcon({ html: PIN, className: "", iconSize: [34, 44], iconAnchor: [17, 43] }),
        })
        .addTo(m);
      marker.current.on("dragend", () => {
        const ll = marker.current!.getLatLng();
        setPoint({ lat: ll.lat, lng: ll.lng });
      });
    } else marker.current.setLatLng([p.lat, p.lng]);
  }

  // Nový bod → špendlík a název místa (zpětné vyhledání, s krátkou prodlevou)
  useEffect(() => {
    if (!point) return;
    placeMarker(point);
    setPlace("");
    setTown("");
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`https://photon.komoot.io/reverse?lat=${point.lat}&lon=${point.lng}`, { signal: ctrl.signal }).catch(
        () => null
      );
      const data = await res?.json().catch(() => null);
      const p = data?.features?.[0]?.properties;
      if (!p) return;
      setPlace([p.street && p.housenumber ? `${p.street} ${String(p.housenumber).replace(/^ev\.?\s*/i, "č. ev. ")}` : p.name, p.city || p.locality, p.county].filter(Boolean).join(", "));
      setTown([p.city || p.locality || p.district, p.county].filter(Boolean).join(", "));
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function applyText() {
    setError("");
    const t = text.trim();
    if (!t) return;
    let p = parseCoordinates(t);
    if (!p && isShortMapLink(t)) {
      setResolving(true);
      const res = await fetch(`/api/geo/resolve?url=${encodeURIComponent(t)}`).catch(() => null);
      const data = await res?.json().catch(() => null);
      setResolving(false);
      p = data?.point ?? null;
      if (!p) return setError(data?.error ?? "Z odkazu se nepodařilo zjistit polohu.");
    }
    if (!p) return setError("Tohle nepoznáme — zkopíruj odkaz na místo z Google Map nebo Mapy.cz, nebo souřadnice.");
    setPoint(p);
    map.current?.setView([p.lat, p.lng], 16);
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upřesnit polohu"
        className="rise flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:h-[min(820px,92dvh)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Upřesnit polohu</h2>
            <p className="mt-0.5 text-sm text-soft">Klikni do mapy nebo přetáhni špendlík na místo, kde ubytování je.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-soft transition hover:bg-bg hover:text-ink"
          >
            ×
          </button>
        </div>

        <form
          className="flex gap-2 border-b border-line px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            applyText();
          }}
        >
          <input
            className="field min-w-0 flex-1 !py-2.5 text-sm"
            placeholder="Nebo vlož odkaz z Google Map / Mapy.cz, či souřadnice (50.9807, 15.0764)"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
            }}
          />
          <button type="submit" className="btn-ghost shrink-0 !px-4 !py-2 text-sm" disabled={!text.trim() || resolving}>
            {resolving ? "Hledám…" : "Najít"}
          </button>
        </form>

        <div className="relative min-h-0 flex-1 bg-bg">
          <div ref={mapEl} className="tainy-map absolute inset-0" />
        </div>

        <div className="space-y-3 border-t border-line px-5 py-4">
          {error && <p className="rounded-xl bg-coral/10 px-4 py-2.5 text-sm font-medium text-coral">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-sm">
              {point ? (
                <>
                  <span className="block font-medium">{place || "Vybrané místo"}</span>
                  <span className="text-xs tabular-nums text-soft">
                    {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                    {!inCzechia(point) && " · mimo Česko — zkontroluj, že je to správně"}
                  </span>
                </>
              ) : (
                <span className="text-soft">Zatím není vybrané místo.</span>
              )}
            </p>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-ghost !px-4 !py-2 text-sm" onClick={onClose}>
                Zrušit
              </button>
              <button
                type="button"
                className="btn-primary !px-5 !py-2 text-sm"
                disabled={!point}
                onClick={() => point && onPick(point, town)}
              >
                Použít tuto polohu
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
