"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AddressInput } from "@/components/AddressInput";
import { MiniMap } from "@/components/MiniMap";
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
  // Kde je špendlík teď (přesný bod, případně aspoň obec)
  const pinPoint = geo.exact ?? (geo.area ? { lat: geo.area.lat, lng: geo.area.lng } : null);

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
        {/* Upřesnění polohy: náhled se špendlíkem — klik otevře mapu, kde jde špendlík posunout */}
        {hasAddress && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={!slug || resetting}
            className={`mt-3 flex w-full items-center gap-3 rounded-xl border p-2 pr-4 text-left transition hover:border-pine/40 ${
              notFound && !geo.manual ? "border-amber/50 bg-amber/10" : "border-line bg-surface"
            }`}
          >
            {pinPoint ? (
              <MiniMap lat={pinPoint.lat} lng={pinPoint.lng} width={compact ? 96 : 120} height={compact ? 68 : 80} />
            ) : (
              <span className="flex shrink-0 items-center justify-center rounded-lg bg-bg text-soft" style={{ width: compact ? 96 : 120, height: compact ? 68 : 80 }}>
                <PinIcon />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {resetting
                  ? "Hledám polohu podle adresy…"
                  : geo.manual
                    ? "Špendlík umístěný ručně"
                    : notFound
                      ? "Umísti špendlík na mapu"
                      : "Sedí špendlík na přesném místě?"}
              </span>
              <span className={`mt-0.5 block text-xs ${notFound && !geo.manual ? "text-[#92600a]" : "text-soft"}`}>
                {geo.manual
                  ? "Kliknutím ho můžeš posunout jinam."
                  : notFound
                    ? geo.area
                      ? "Na mapě jsme našli jen obec — označ přesné místo."
                      : "Adresu jsme na mapě nenašli — označ místo ručně."
                    : "Pokud ne, posuň ho ručně, vlož odkaz z map nebo souřadnice."}
              </span>
              <span className="mt-1 inline-block text-xs font-semibold text-pine">
                {geo.manual ? "Posunout špendlík →" : "Umístit špendlík →"}
              </span>
            </span>
          </button>
        )}
        {failed && <p className="mt-2 text-xs font-medium text-coral">{failed}</p>}
      </div>
      {picking && slug && (
        <LocationPicker
          initial={geo.exact ?? (geo.area ? { lat: geo.area.lat, lng: geo.area.lng } : null)}
          onReset={
            geo.manual && hasAddress
              ? () => {
                  setPicking(false);
                  resetToAddress();
                }
              : undefined
          }
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

/** Malý špendlík v barvě webu (místo emoji). */
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-pine">
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
