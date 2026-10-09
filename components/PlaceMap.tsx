"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

// Mapa polohy na webu (OpenStreetMap přes Leaflet). Přesná poloha = špendlík,
// přibližná = kruh kolem obce. Přibližovat jde tlačítky a dvěma prsty; kolečko
// myši a posun jedním prstem na mobilu jsou vypnuté, ať mapa nebere stránce
// scrollování.

const pin = (color: string) =>
  `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"><path d="M17 43C17 43 32 27.5 32 16.5A15 15 0 0 0 2 16.5C2 27.5 17 43 17 43Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="17" cy="16.5" r="5.5" fill="#fff"/></svg>`;

export default function PlaceMap({ lat, lng, exact, title }: { lat: number; lng: number; exact: boolean; title: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current) return;
      const L = mod.default ?? mod;
      const touch = window.matchMedia("(pointer: coarse)").matches;
      // Barva webu (lib/theme.ts) — špendlík a kruh ladí s tlačítky
      const color = getComputedStyle(el.current).getPropertyValue("--pine").trim() || "#2c5e3f";
      const m = L.map(el.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        dragging: !touch,
        touchZoom: true,
        doubleClickZoom: true,
        keyboard: false,
      }).setView([lat, lng], exact ? 15 : 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      if (exact) {
        L.marker([lat, lng], {
          icon: L.divIcon({ html: pin(color), className: "", iconSize: [34, 44], iconAnchor: [17, 43] }),
          keyboard: false,
          interactive: false,
        }).addTo(m);
      } else {
        L.circle([lat, lng], { radius: 1800, color, weight: 2, fillColor: color, fillOpacity: 0.18 }).addTo(m);
      }
      m.attributionControl.setPrefix(false); // bez „Leaflet“ — stačí povinné uvedení OpenStreetMap
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [lat, lng, exact]);

  return <div ref={el} role="img" aria-label={title} className="tainy-map absolute inset-0 z-0" />;
}
