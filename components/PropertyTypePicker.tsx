"use client";

import { PROPERTY_TYPES } from "@/lib/listing";

// Typ ubytování jako řada štítků (místo nativního <select>, který si každý
// prohlížeč kreslí po svém). Vlastní typ, který není v nabídce, zůstane vidět.
export function PropertyTypePicker({ value, onChange }: { value: string; onChange: (type: string) => void }) {
  const types = [...new Set([...PROPERTY_TYPES, value])].filter(Boolean);
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Typ ubytování">
      {types.map((t) => {
        const on = t === value;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              on ? "border-pine bg-pine text-white" : "border-line bg-surface text-soft hover:border-pine/40 hover:text-ink"
            }`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
