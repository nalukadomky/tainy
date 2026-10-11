"use client";

import { TONES, autoTone, cleanTone, themeHex, type ToneKey } from "@/lib/theme";

// Tón podkladu webu: jemné pozadí, linky a obsazené dny v kalendáři.
// „Automaticky“ vybere tón, který ladí k hlavní barvě. Každý vzorek ukazuje
// pozadí, obsazený den a vybraný den v hlavní barvě.

export function TonePicker({ value, theme, onChange }: { value: string; theme: string; onChange: (value: string) => void }) {
  const chosen = cleanTone(value);
  const auto = autoTone(theme);

  const swatch = (key: ToneKey) => {
    const t = TONES.find((x) => x.key === key)!;
    return (
      <span
        aria-hidden
        className="flex items-center justify-center gap-1 rounded-lg"
        style={{ width: "100%", height: 34, background: t.bg, boxShadow: `inset 0 0 0 1px ${t.line}` }}
      >
        <span className="rounded" style={{ width: 12, height: 12, background: t.booked }} />
        <span className="rounded" style={{ width: 12, height: 12, background: themeHex(theme) }} />
      </span>
    );
  };

  const option = (key: string, label: string, tone: ToneKey, hint?: string) => {
    const on = chosen === key;
    return (
      <button
        key={key || "auto"}
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => onChange(key)}
        className={`rounded-xl border p-1.5 text-left transition ${on ? "border-pine ring-2 ring-pine/20" : "border-line hover:border-pine/40"}`}
      >
        {swatch(tone)}
        <span className="mt-1 block truncate px-0.5 text-xs font-semibold">{label}</span>
        {hint && <span className="block truncate px-0.5 text-[11px] text-soft">{hint}</span>}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Tón podkladu">
      {option("", "Automaticky", auto, TONES.find((t) => t.key === auto)!.label)}
      {TONES.map((t) => option(t.key, t.label, t.key))}
    </div>
  );
}
