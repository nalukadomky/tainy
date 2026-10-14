"use client";

import { useState } from "react";
import { THEMES, readable } from "@/lib/theme";

// Hlavní vizualizace s výběrem barvy: tři předvolby a libovolná vlastní barva.
// Klik přebarví web i telefon (přepíše --pine jen uvnitř téhle části stránky).
// Vlastní barvu hlídáme stejně jako v editoru webu — příliš světlou ztmavíme.

const PICKS = ["pine", "noc", "terakota"].map((k) => THEMES.find((t) => t.key === k)!);

export function ThemeSwitch({ children }: { children: React.ReactNode }) {
  const [hex, setHex] = useState(PICKS[0].hex);
  const [custom, setCustom] = useState<string | null>(null);
  const preset = PICKS.find((t) => t.hex === hex);
  const isCustom = !preset;

  return (
    <div style={{ "--pine": hex, "--pine-dark": `color-mix(in srgb, ${hex} 80%, #000)` } as React.CSSProperties}>
      {children}
      <div className="mt-6 flex items-center justify-center sm:mt-8">
        <div className="flex items-center gap-3 rounded-full border border-line bg-surface/90 py-2 pl-4 pr-2 shadow-sm backdrop-blur">
          <span className="text-xs font-medium text-soft">Barva webu</span>
          <div role="radiogroup" aria-label="Barva webu" className="flex items-center gap-2">
            {PICKS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={t.hex === hex}
                aria-label={t.label}
                title={t.label}
                onClick={() => setHex(t.hex)}
                className={`h-7 w-7 rounded-full transition hover:scale-110 ${t.hex === hex ? "ring-2 ring-offset-2" : ""}`}
                style={{ background: t.hex, ["--tw-ring-color" as string]: t.hex }}
              />
            ))}
            {/* Vlastní barva: duhové kolečko, po výběru ukáže zvolený odstín */}
            <label
              title="Vlastní barva"
              className={`relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition hover:scale-110 ${isCustom ? "ring-2 ring-offset-2" : ""}`}
              style={{
                background: isCustom ? hex : "conic-gradient(#ef5b3c, #f59e0b, #4c9a2a, #1f8a8a, #3b3f8f, #9b3a8a, #ef5b3c)",
                ["--tw-ring-color" as string]: hex,
              }}
            >
              {!isCustom && <span className="text-sm font-bold leading-none text-white drop-shadow">+</span>}
              <input
                type="color"
                aria-label="Vlastní barva"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={custom ?? "#c2410c"}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setHex(readable(e.target.value));
                }}
              />
            </label>
          </div>
          <span className="w-20 text-xs font-medium">{preset?.label ?? "Vlastní"}</span>
        </div>
      </div>
    </div>
  );
}
