"use client";

import { parseSleeping, serializeSleeping, sleepsTotal, type Sleeping } from "@/lib/sleeping";
import { plural } from "@/lib/pricing";

// Ložnice a lůžka v nastavení webu: počítadla −/+ (stejně jako počty hostů
// v rezervaci). Pod nimi kolik lidí se vyspí a návrh maximálního počtu hostů.

type Row = { key: Exclude<keyof Sleeping, "sofaSleeps">; label: string; hint?: string };

const ROWS: Row[] = [
  { key: "bedrooms", label: "Ložnice" },
  { key: "double", label: "Manželská postel", hint: "pro 2 osoby" },
  { key: "single", label: "Jednolůžko", hint: "pro 1 osobu" },
  { key: "extra", label: "Přistýlka", hint: "pro 1 osobu" },
  { key: "sofa", label: "Rozkládací pohovka" },
];

export function SleepingField({
  value,
  onChange,
  maxGuests,
  onMaxGuests,
}: {
  value: string;
  onChange: (value: string) => void;
  maxGuests: number;
  onMaxGuests: (n: number) => void;
}) {
  const s = parseSleeping(value);
  const update = (patch: Partial<Sleeping>) => onChange(serializeSleeping({ ...s, ...patch }));
  const total = sleepsTotal(s);

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">Ložnice a lůžka</p>
      <div className="divide-y divide-line rounded-xl border border-line">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.label}</p>
              {r.key === "sofa" && s.sofa > 0 ? (
                <div className="mt-1 inline-flex rounded-lg border border-line bg-bg p-0.5" role="radiogroup" aria-label="Kolik lidí se vyspí na pohovce">
                  {([1, 2] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={s.sofaSleeps === n}
                      onClick={() => update({ sofaSleeps: n })}
                      className={`whitespace-nowrap rounded-md px-2.5 py-0.5 text-xs font-medium transition ${
                        s.sofaSleeps === n ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"
                      }`}
                    >
                      pro {n}
                    </button>
                  ))}
                </div>
              ) : (
                r.hint && <p className="mt-0.5 text-xs text-soft">{r.hint}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                aria-label={`Ubrat: ${r.label}`}
                className="btn-ghost !px-4 !py-1.5"
                disabled={s[r.key] <= 0}
                onClick={() => update({ [r.key]: s[r.key] - 1 })}
              >
                −
              </button>
              <span className="w-6 text-center font-display text-lg font-semibold tabular-nums">{s[r.key]}</span>
              <button
                type="button"
                aria-label={`Přidat: ${r.label}`}
                className="btn-ghost !px-4 !py-1.5"
                disabled={s[r.key] >= 50}
                onClick={() => update({ [r.key]: s[r.key] + 1 })}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-soft">
            Spaní pro <strong className="text-ink">{total} {plural(total, "osobu", "osoby", "osob")}</strong>
          </span>
          {total !== maxGuests && (
            <button
              type="button"
              onClick={() => onMaxGuests(Math.min(50, total))}
              className="font-medium text-pine hover:underline"
            >
              Nastavit max. hostů na {Math.min(50, total)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
