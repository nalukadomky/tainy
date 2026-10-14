"use client";

import { useEffect, useRef, useState } from "react";
import { THEMES, readable } from "@/lib/theme";

// Hlavní vizualizace s výběrem barvy: tři předvolby a vlastní barva z malého
// okénka (odstín + tón, pár připravených barev). Klik přebarví web i telefon
// (přepíše --pine jen uvnitř téhle části stránky). Vlastní barvu hlídáme stejně
// jako v editoru webu — příliš světlou ztmavíme, aby bílé písmo zůstalo čitelné.

const PICKS = ["pine", "noc", "terakota"].map((k) => THEMES.find((t) => t.key === k)!);
const EXTRA = ["#1f5a56", "#4c5d22", "#3b3f8f", "#5e2b55", "#7a2232", "#b45309", "#6e4a2c", "#2f343b"];

/** HSL (0–360, 0–100, 0–100) → #rrggbb */
function hslHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function ThemeSwitch({ children }: { children: React.ReactNode }) {
  const [hex, setHex] = useState(PICKS[0].hex);
  const [open, setOpen] = useState(false);
  const [hue, setHue] = useState(28);
  const [tone, setTone] = useState(38); // světlost
  const box = useRef<HTMLDivElement>(null);
  const preset = PICKS.find((t) => t.hex === hex);
  const isCustom = !preset;

  // Zavřít klikem mimo okénko nebo klávesou Esc
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const pickHsl = (h: number, l: number) => {
    setHue(h);
    setTone(l);
    setHex(readable(hslHex(h, 55, l)));
  };

  return (
    <div style={{ "--pine": hex, "--pine-dark": `color-mix(in srgb, ${hex} 80%, #000)` } as React.CSSProperties}>
      {children}
      <div className="mt-6 flex items-center justify-center sm:mt-8">
        <div ref={box} className="relative flex items-center gap-3 rounded-full border border-line bg-surface/90 py-2 pl-4 pr-2 shadow-sm backdrop-blur">
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
                onClick={() => {
                  setHex(t.hex);
                  setOpen(false);
                }}
                className={`h-7 w-7 rounded-full transition hover:scale-110 ${t.hex === hex ? "ring-2 ring-offset-2" : ""}`}
                style={{ background: t.hex, ["--tw-ring-color" as string]: t.hex }}
              />
            ))}
            <button
              type="button"
              aria-label="Vlastní barva"
              aria-expanded={open}
              title="Vlastní barva"
              onClick={() => setOpen((o) => !o)}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition hover:scale-110 ${isCustom ? "ring-2 ring-offset-2" : ""}`}
              style={{
                background: isCustom ? hex : "conic-gradient(from 180deg, #ef5b3c, #f59e0b, #4c9a2a, #1f8a8a, #3b3f8f, #9b3a8a, #ef5b3c)",
                ["--tw-ring-color" as string]: hex,
              }}
            >
              {!isCustom && <span className="text-sm font-bold leading-none text-white drop-shadow">+</span>}
            </button>
          </div>
          <span className="w-16 text-xs font-medium">{preset?.label ?? "Vlastní"}</span>

          {open && (
            <div
              role="dialog"
              aria-label="Vlastní barva webu"
              className="absolute bottom-full left-1/2 z-20 mb-3 w-[264px] -translate-x-1/2 rounded-2xl border border-line bg-surface p-4 text-ink shadow-[0_20px_50px_-12px_rgba(30,42,32,0.35)]"
              style={{ animation: "rise .2s cubic-bezier(.2,.7,.2,1) both" }}
            >
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl shadow-inner" style={{ background: hex }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Vlastní barva</p>
                  <p className="font-mono text-xs uppercase text-soft">{hex}</p>
                </div>
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-soft">Odstín</span>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={hue}
                  onChange={(e) => pickHsl(Number(e.target.value), tone)}
                  className="color-range w-full"
                  style={{ background: "linear-gradient(to right, #c33, #c93, #9c3, #3c6, #3cc, #36c, #63c, #c3c, #c33)" }}
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-soft">Tón</span>
                <input
                  type="range"
                  min={15}
                  max={45}
                  value={tone}
                  onChange={(e) => pickHsl(hue, Number(e.target.value))}
                  className="color-range w-full"
                  style={{ background: `linear-gradient(to right, ${hslHex(hue, 55, 15)}, ${hslHex(hue, 55, 45)})` }}
                />
              </label>

              <div className="mt-4 grid grid-cols-8 gap-1.5">
                {EXTRA.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setHex(c)}
                    className={`aspect-square rounded-lg transition hover:scale-110 ${hex === c ? "ring-2 ring-ink ring-offset-1" : ""}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-snug text-soft">Příliš světlou barvu ztmavíme, aby text na tlačítkách zůstal čitelný.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
