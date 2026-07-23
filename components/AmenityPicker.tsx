"use client";

import { useRef } from "react";

// Výběr vybavení: kliknutelné badge (nabídka běžného vybavení) + volný input,
// kde se po dopsání slova (Enter / čárka / opuštění pole) vytvoří badge.
// Pracuje s polem řetězců; vlastní i nabízené položky se ukládají stejně.

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
};

export function AmenityPicker({ value, onChange, suggestions = [], placeholder }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const has = (t: string) => value.some((v) => v.toLowerCase() === t.trim().toLowerCase());

  // Přidá jednu nebo více položek (rozdělených čárkou), bez duplicit.
  const commit = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
  };

  const remove = (t: string) => onChange(value.filter((v) => v !== t));

  const open = suggestions.filter((s) => !has(s));

  return (
    <div>
      {/* Pole s vybranými badge + input */}
      <div
        className="flex min-h-[3.25rem] cursor-text flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-2 transition focus-within:border-pine/50 focus-within:ring-2 focus-within:ring-pine/15"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 rounded-full border border-pine/30 bg-pine/10 py-1 pl-3 pr-1.5 text-sm font-medium text-ink"
          >
            {t}
            <button
              type="button"
              aria-label={`Odebrat ${t}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(t);
              }}
              className="flex h-4 w-4 items-center justify-center rounded-full text-soft transition hover:bg-pine/20 hover:text-ink"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-soft"
          defaultValue=""
          placeholder={value.length ? "Přidat další…" : placeholder}
          onChange={(e) => {
            if (e.target.value.includes(",")) {
              commit(e.target.value);
              e.target.value = "";
            }
          }}
          onKeyDown={(e) => {
            const el = e.currentTarget;
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(el.value);
              el.value = "";
            } else if (e.key === "Backspace" && !el.value && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={(e) => {
            if (e.currentTarget.value.trim()) {
              commit(e.currentTarget.value);
              e.currentTarget.value = "";
            }
          }}
        />
      </div>

      {/* Nabídka běžného vybavení k zakliknutí */}
      {open.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {open.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-soft transition hover:border-pine/40 hover:text-ink"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
