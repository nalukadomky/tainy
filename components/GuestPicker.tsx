"use client";

import { capacityCount, type GuestCategory, type GuestCounts } from "@/lib/guests";
import { plural } from "@/lib/pricing";

// Výběr hostů. Když se skladba nedělí, je to jeden čítač jako dřív;
// v rozdělené skladbě řádek na kategorii s cenou, aby host viděl,
// co která osoba stojí, ještě než klikne dál.

const NEPOCITANE_MAX = 5; // kojenci a psi neberou lůžko, ale ani jich nemá být deset

export function GuestPicker({
  categories,
  counts,
  onChange,
  maxGuests,
  priceHint,
}: {
  categories: GuestCategory[];
  counts: GuestCounts;
  onChange: (counts: GuestCounts) => void;
  maxGuests: number;
  /** Popisek ceny za jednu osobu a noc, např. „2 900 Kč / noc". */
  priceHint?: (category: GuestCategory) => string | null;
}) {
  const obsazenost = capacityCount(counts, categories);
  const jedina = categories.length === 1;

  function set(key: GuestCategory["key"], value: number) {
    onChange({ ...counts, [key]: Math.max(0, value) });
  }

  function maxProKategorii(c: GuestCategory): number {
    if (!c.capacity) return NEPOCITANE_MAX;
    // Kolik ještě zbývá do kapacity, plus to, co už je vybrané u této kategorie
    return maxGuests - obsazenost + (counts[c.key] ?? 0);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">{jedina ? "Počet hostů" : "Kdo přijede"}</span>
        {!jedina && (
          <span className="text-xs text-soft">
            {obsazenost} z {maxGuests} {plural(maxGuests, "místa", "míst", "míst")}
          </span>
        )}
      </div>

      <div className={jedina ? "" : "divide-y divide-line rounded-xl border border-line"}>
        {categories.map((c) => {
          const value = counts[c.key] ?? 0;
          const max = maxProKategorii(c);
          const hint = priceHint?.(c);
          const minimum = c.key === "adult" && !jedina ? 1 : 0;

          return (
            <div
              key={c.key}
              className={`flex items-center justify-between gap-3 ${jedina ? "" : "px-4 py-3"}`}
            >
              {!jedina && (
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  {hint && <p className="mt-0.5 text-xs text-soft">{hint}</p>}
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  aria-label={`Ubrat: ${c.label}`}
                  className="btn-ghost !px-5 !py-2"
                  disabled={value <= minimum}
                  onClick={() => set(c.key, value - 1)}
                >
                  −
                </button>
                <span
                  className={`text-center font-display font-semibold tabular-nums ${
                    jedina ? "w-8 text-2xl" : "w-6 text-lg"
                  }`}
                >
                  {value}
                </span>
                <button
                  type="button"
                  aria-label={`Přidat: ${c.label}`}
                  className="btn-ghost !px-5 !py-2"
                  disabled={value >= max}
                  onClick={() => set(c.key, value + 1)}
                >
                  +
                </button>
                {jedina && <span className="text-sm text-soft">max. {maxGuests}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
