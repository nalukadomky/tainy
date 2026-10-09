"use client";

import { useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { MIN_CONTRAST, THEMES, contrastWithWhite, normalizeHex, readable, themeHex } from "@/lib/theme";

// Primární barva webu: předvolby jako rychlá volba a vlastní barva (kapátko
// nebo kód #hex). Příliš světlou barvu ztmavíme na nejbližší odstín, na kterém
// je bílé písmo v tlačítkách dobře čitelné. Rozměry jsou ve stylu přímo,
// ať výběr vypadá správně bez ohledu na načtenou verzi CSS.

const SWATCH = 26;

export function ThemePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const current = themeHex(value);
  const preset = THEMES.find((t) => t.key === value);
  const [text, setText] = useState(current);
  // Barva, kterou majitel zadal, ale museli jsme ji ztmavit
  const [adjustedFrom, setAdjustedFrom] = useState<string | null>(null);
  // Rozbalený výběr vlastní barvy; `raw` = co majitel táhne (může být světlejší než uložená)
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(current);
  useEffect(() => setText(current), [current]);

  function pickCustom(raw: string) {
    const hex = normalizeHex(raw);
    if (!hex) return;
    const ok = readable(hex);
    setAdjustedFrom(ok === hex ? null : hex);
    onChange(ok);
  }

  const ratio = contrastWithWhite(current);

  const ring = (color: string) => `0 0 0 2px var(--surface), 0 0 0 4px ${color}`;

  return (
    <div className="space-y-2.5">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }} role="radiogroup" aria-label="Barva webu">
        {THEMES.map((t) => {
          const on = preset?.key === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t.label}
              title={t.label}
              onClick={() => {
                setAdjustedFrom(null);
                onChange(t.key);
              }}
              style={{
                width: SWATCH,
                height: SWATCH,
                flex: "none",
                borderRadius: "50%",
                background: t.hex,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: on ? ring(t.hex) : "inset 0 0 0 1px rgba(0,0,0,.1)",
              }}
            >
              {on && (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12.5 10 17 19 7.5" />
                </svg>
              )}
            </button>
          );
        })}
        {/* Vlastní barva — rozbalí výběr pod kolečky */}
        <button
          type="button"
          title="Vlastní barva"
          aria-label="Vlastní barva"
          aria-expanded={open}
          onClick={() => {
            setRaw(current);
            setOpen((o) => !o);
          }}
          style={{
            width: SWATCH,
            height: SWATCH,
            flex: "none",
            borderRadius: "50%",
            background: !preset ? current : "conic-gradient(#e74c3c, #f1c40f, #2ecc71, #3498db, #9b59b6, #e74c3c)",
            boxShadow: !preset || open ? ring(!preset ? current : "var(--ink)") : "inset 0 0 0 1px rgba(0,0,0,.1)",
          }}
        />
      </div>

      {open && (
        <div className="theme-picker rounded-xl border border-line bg-surface p-3 shadow-sm">
          <HexColorPicker
            color={raw}
            onChange={(hex) => {
              setRaw(hex);
              pickCustom(hex);
            }}
          />
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-soft">
            <span className="flex items-center gap-2">
              <span aria-hidden style={{ width: 16, height: 16, borderRadius: 5, background: current, display: "inline-block" }} />
              {raw.toLowerCase() === current ? "Bílé písmo je dobře čitelné" : "Ztmaveno pro čitelné písmo"}
            </span>
            <button type="button" onClick={() => setOpen(false)} className="font-semibold text-ink hover:underline">
              Hotovo
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px" }} className="text-xs text-soft">
        <input
          className="rounded-lg border border-line bg-surface font-mono uppercase text-ink outline-none focus:border-pine"
          style={{ width: 84, padding: "4px 8px", fontSize: 12 }}
          aria-label="Kód barvy"
          maxLength={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => (normalizeHex(text) ? pickCustom(text) : setText(current))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (normalizeHex(text)) pickCustom(text);
            }
          }}
        />
        <span>
          {preset ? preset.label : "Vlastní"} · kontrast {ratio.toFixed(1).replace(".", ",")} : 1
          {ratio >= MIN_CONTRAST && " ✓"}
        </span>
        {value !== "pine" && (
          <button
            type="button"
            onClick={() => {
              setAdjustedFrom(null);
              onChange("pine");
            }}
            className="font-medium underline-offset-4 hover:text-ink hover:underline"
          >
            ↺ Výchozí
          </button>
        )}
      </div>

      {adjustedFrom && (
        <p className="rounded-lg bg-amber/15 px-3 py-2 text-xs text-[#92600a]">
          {adjustedFrom.toUpperCase()} je pro bílé písmo moc světlá — použili jsme nejbližší čitelný odstín{" "}
          <strong>{current.toUpperCase()}</strong>.
        </p>
      )}
    </div>
  );
}
