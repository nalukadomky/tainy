"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AddressInput } from "@/components/AddressInput";
import { useAdminData } from "@/lib/admin";
import { cleanLocationMode, parseGeo, type LocationMode } from "@/lib/location";

// Mapa se špendlíkem (Leaflet) se načte, až když ji majitel otevře
const LocationPicker = dynamic(() => import("@/components/LocationPicker"), { ssr: false });

// Adresa ubytování a jak ji ukázat na webu (sekce „Kde nás najdete“).
// Stejná adresa jde do e-mailu před příjezdem — tam vždy přesně.
// Používá se v Můj web, v úpravách přímo ve webu a v Automatizaci (jen adresa).

type Value = { arrivalAddress: string; locationMode: string; geo: string };

const OPTIONS: [LocationMode, string, string][] = [
  ["area", "Přibližně na mapě", "Obec a kruh v okolí, bez čísla domu"],
  ["area-text", "Přibližně textem", "Jen název obce, bez mapy"],
  ["exact", "Přesně na mapě", "Celá adresa a špendlík"],
  ["none", "Nezobrazovat", "Na webu poloha nebude"],
];

export function LocationSettings({
  value,
  onChange,
  compact = false,
}: {
  value: Value;
  onChange: (patch: Partial<Value>) => void;
  /** Užší panel (úpravy přímo ve webu) — volby pod sebou. */
  compact?: boolean;
}) {
  const mode = cleanLocationMode(value.locationMode);
  const geo = parseGeo(value.geo);
  const area = geo.area;
  const { slug } = useAdminData();
  const [picking, setPicking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const hasAddress = !!value.arrivalAddress.trim();
  // Adresa zadaná, ale mapa ji nenašla přesně (ani přibližně, nebo jen obec)
  const notFound = hasAddress && !geo.exact;

  const [failed, setFailed] = useState("");

  // Ručně určený bod: hned v náhledu (obec ze špendlíku, střed přibližně),
  // server dopočítá střed obce na pozadí. Při chybě se vrátí původní poloha.
  async function savePoint(point: { lat: number; lng: number }, town: string) {
    if (!slug) return;
    const before = value.geo;
    setFailed("");
    onChange({
      geo: JSON.stringify({
        exact: point,
        area: { lat: Math.round(point.lat * 75) / 75, lng: Math.round(point.lng * 50) / 50, label: town || area?.label || "Okolí ubytování" },
        manual: true,
      }),
    });
    const res = await fetch(`/api/sites/${slug}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ point }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok && typeof data?.geo === "string") onChange({ geo: data.geo });
    else {
      onChange({ geo: before });
      setFailed("Polohu se nepodařilo uložit — zkus to prosím znovu.");
    }
  }

  async function resetToAddress() {
    if (!slug) return;
    setResetting(true);
    const res = await fetch(`/api/sites/${slug}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ point: null }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setResetting(false);
    if (res?.ok && typeof data?.geo === "string") onChange({ geo: data.geo });
  }
  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1.5 block text-sm font-medium">Adresa ubytování</span>
        <AddressInput
          value={value.arrivalAddress}
          onChange={(v) => onChange({ arrivalAddress: v })}
          placeholder="Začni psát adresu — např. Dolní Pertoltice 12"
        />
        <span className="mt-1 block text-xs text-soft">
          Hosté ji vždy dostanou celou v e-mailu před příjezdem. Na webu ji ukážeš podle volby níže.
        </span>
        {/* Upřesnění polohy: špendlík, odkaz z map, souřadnice */}
        <div
          className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-sm ${
            notFound && !geo.manual ? "bg-amber/15" : "bg-bg"
          }`}
        >
          <span className="min-w-0 flex-1">
            {geo.manual ? (
              <>
                📍 <strong>Poloha určená ručně</strong>
                {area && <span className="text-soft"> · {area.label}</span>}
              </>
            ) : notFound ? (
              <span className="text-[#92600a]">
                {geo.area ? "Na mapě jsme našli jen obec, ne přesné místo." : "Adresu jsme na mapě nenašli."} Označ místo
                špendlíkem.
              </span>
            ) : (
              <span className="text-soft">Nesedí místo na mapě? Upřesni ho špendlíkem, odkazem z map nebo souřadnicemi.</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={!slug}
            className={notFound && !geo.manual ? "btn-primary !px-4 !py-2 text-sm" : "btn-ghost !px-4 !py-2 text-sm"}
          >
            📍 {geo.manual ? "Upravit" : "Upřesnit polohu na mapě"}
          </button>
          {geo.manual && hasAddress && (
            <button
              type="button"
              onClick={resetToAddress}
              disabled={resetting}
              className="text-sm font-medium text-soft underline-offset-4 hover:text-ink hover:underline"
            >
              {resetting ? "Hledám…" : "Podle adresy"}
            </button>
          )}
        </div>
        {failed && <p className="mt-2 text-xs font-medium text-coral">{failed}</p>}
      </div>
      {picking && slug && (
        <LocationPicker
          initial={geo.exact ?? (geo.area ? { lat: geo.area.lat, lng: geo.area.lng } : null)}
          onClose={() => setPicking(false)}
          onPick={(point, town) => {
            setPicking(false);
            savePoint(point, town);
          }}
        />
      )}
      <div>
        <span className="mb-1.5 block text-sm font-medium">Jak ukázat polohu na webu</span>
        <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`} role="radiogroup" aria-label="Jak ukázat polohu na webu">
          {OPTIONS.map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => onChange({ locationMode: id })}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                mode === id ? "border-pine bg-pine/5 ring-2 ring-pine/20" : "border-line bg-surface hover:border-pine/40"
              }`}
            >
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-0.5 block text-xs text-soft">
                {(id === "area" || id === "area-text") && area ? `${hint} — ${area.label}` : hint}
              </span>
            </button>
          ))}
        </div>
        {mode !== "none" && !value.arrivalAddress.trim() && (
          <p className="mt-2 text-xs text-[#92600a]">Doplň adresu — bez ní se poloha na webu neukáže.</p>
        )}
      </div>
    </div>
  );
}
