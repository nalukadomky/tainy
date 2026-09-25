"use client";

import type { Adjust } from "@/lib/pricing";

// Zadání úpravy ceny: číslo plus přepínač jednotky.
//   %  — úprava vůči základní ceně, procenta se sčítají
//   Kč — pevná cena noci, která výsledek přepíše
// Používá se u víkendu, sezónních období i kategorií hostů, aby to majitel
// všude zadával stejně.

export function AdjustField({
  label,
  hint,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  hint?: string;
  value: Adjust;
  onChange: (adjust: Adjust) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "block"}>
      <span className={`mb-1.5 block font-medium ${compact ? "text-xs text-soft" : "text-sm"}`}>
        {label}
      </span>
      <div className="flex items-stretch gap-2">
        <input
          className={`field min-w-0 flex-1 ${compact ? "!py-2 text-sm" : ""}`}
          type="number"
          aria-label={label}
          value={value.value}
          onChange={(e) => onChange({ ...value, value: Number(e.target.value) })}
        />
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-line">
          {(
            [
              ["pct", "%"],
              ["czk", "Kč"],
            ] as const
          ).map(([unit, symbol]) => (
            <button
              key={unit}
              type="button"
              aria-pressed={value.unit === unit}
              onClick={() => onChange({ ...value, unit })}
              className={`px-3 text-sm font-medium transition ${
                value.unit === unit ? "bg-ink text-white" : "text-soft hover:bg-line/50"
              }`}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>
      {hint && <span className="mt-1 block text-xs text-soft">{hint}</span>}
    </div>
  );
}
