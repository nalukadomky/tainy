"use client";

import { useMemo } from "react";
import { addDays, nightsOf, todayISO } from "@/lib/stay";

// Měsíční mřížka obsazenosti (Po–Ne) s pobyty jako pruhy přes dny — sdílená
// administrací (Kalendář) a stránkou uklízečky. Pruh začíná v polovině dne
// příjezdu a končí v polovině dne odjezdu (jako v hotelu), takže odjezd
// a příjezd tentýž den se nepřekrývají.

export type CalendarBar = {
  id: string;
  start: string;
  /** Den odjezdu (pobyt) / den po posledním blokovaném dni (blokace). */
  end: string;
  label: string;
  /** stay = zaplacený / obsazený pobyt, pending = čeká na platbu, block = blokace (šrafovaně) */
  variant: "stay" | "pending" | "block";
};

export type MonthCursor = { y: number; m: number };

export const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

export const HATCH = {
  backgroundImage: "repeating-linear-gradient(135deg, rgba(90,101,87,.28) 0 6px, rgba(90,101,87,.12) 6px 12px)",
};

export function monthTitle(y: number, m: number): string {
  const t = new Date(y, m, 1).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** První den měsíce a první den dalšího měsíce (ISO). */
export function monthBounds({ y, m }: MonthCursor) {
  const next = new Date(y, m + 1, 1);
  return {
    monthStart: `${y}-${String(m + 1).padStart(2, "0")}-01`,
    monthEnd: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`,
  };
}

export const currentMonth = (): MonthCursor => ({ y: new Date().getFullYear(), m: new Date().getMonth() });

/** Krátký rozsah dat. Pobyt se píše příjezd–odjezd, blokace první–poslední blokovaný den. */
export function shortRange(start: string, endExclusive: string, kind: "stay" | "block" = "block"): string {
  const last = kind === "stay" ? endExclusive : addDays(endExclusive, -1);
  const [, sm, sd] = start.split("-").map(Number);
  const [, lm, ld] = last.split("-").map(Number);
  if (start === last) return `${sd}. ${sm}.`;
  return sm === lm ? `${sd}.–${ld}. ${lm}.` : `${sd}. ${sm}. – ${ld}. ${lm}.`;
}

export function Legend({ className = "", style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-5 rounded-full ${className}`} style={style} />
      {children}
    </span>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-sm transition hover:border-ink/30"
    >
      {children}
    </button>
  );
}

export function StayCalendar({
  cursor,
  onCursor,
  bars,
  onBarClick,
  onDayClick,
  dayClass,
  dayDisabled,
  marks,
  notice,
  legend,
}: {
  cursor: MonthCursor;
  onCursor: (c: MonthCursor) => void;
  bars: CalendarBar[];
  onBarClick: (id: string) => void;
  /** Klik na den (administrace: výběr blokace). Bez něj jsou dny jen k prohlížení. */
  onDayClick?: (day: string) => void;
  /** Doplňkové třídy buňky dne (zvýraznění výběru). */
  dayClass?: (day: string) => string;
  dayDisabled?: (day: string) => boolean;
  /** Značka u dne (např. 🧹 = úklid). */
  marks?: Record<string, React.ReactNode>;
  /** Pruh s nápovědou nad mřížkou. */
  notice?: React.ReactNode;
  legend: React.ReactNode;
}) {
  const today = todayISO();
  const { weeks, monthStart, monthEnd } = useMemo(() => {
    const { monthStart, monthEnd } = monthBounds(cursor);
    const dow = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7;
    const weeks: string[] = [];
    for (let w = addDays(monthStart, -dow); w < monthEnd; w = addDays(w, 7)) weeks.push(w);
    return { weeks, monthStart, monthEnd };
  }, [cursor]);

  const shift = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    onCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold sm:text-xl">{monthTitle(cursor.y, cursor.m)}</h2>
        <div className="flex items-center gap-1">
          <NavButton label="Předchozí měsíc" onClick={() => shift(-1)}>
            ←
          </NavButton>
          <button
            type="button"
            onClick={() => onCursor(currentMonth())}
            className="h-8 rounded-lg px-3 text-sm font-medium text-soft transition hover:bg-line/40 hover:text-ink"
          >
            Dnes
          </button>
          <NavButton label="Další měsíc" onClick={() => shift(1)}>
            →
          </NavButton>
        </div>
      </div>

      {notice}

      <div className="grid grid-cols-7 border-b border-line pb-1.5">
        {WEEKDAYS.map((d, i) => (
          <span key={d} className={`text-center text-[11px] font-semibold uppercase tracking-wide ${i > 4 ? "text-ink" : "text-soft"}`}>
            {d}
          </span>
        ))}
      </div>

      <div className="divide-y divide-line">
        {weeks.map((ws) => {
          const weekEnd = addDays(ws, 7);
          const segments = bars.filter((b) => b.start < weekEnd && b.end > ws);
          return (
            <div key={ws} className="relative grid grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => {
                const day = addDays(ws, i);
                const outside = day < monthStart || day >= monthEnd;
                const past = day < today;
                const extra = dayClass?.(day) ?? "";
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onDayClick?.(day)}
                    disabled={!onDayClick || !!dayDisabled?.(day)}
                    className={`relative flex h-16 flex-col items-start justify-start border-line p-1 text-left transition disabled:cursor-default sm:h-20 sm:p-1.5 ${
                      i > 0 ? "border-l" : ""
                    } ${extra || (past ? "bg-bg/60" : onDayClick ? "hover:bg-bg" : "")}`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        day === today
                          ? "bg-ink font-semibold text-white"
                          : outside
                            ? "text-soft/40"
                            : past
                              ? "text-soft/70"
                              : "font-medium text-ink"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {marks?.[day] && (
                      <span aria-hidden className="absolute right-1 top-1 text-xs sm:right-1.5 sm:top-1.5 sm:text-sm">
                        {marks[day]}
                      </span>
                    )}
                  </button>
                );
              })}

              {segments.map((bar) => {
                const segStart = bar.start > ws ? bar.start : ws;
                const segEnd = bar.end < weekEnd ? bar.end : weekEnd;
                const startsHere = segStart === bar.start;
                const endsHere = segEnd === bar.end;
                const left = (nightsOf(ws, segStart) + (startsHere ? 0.5 : 0)) / 7;
                // Odjezd v pondělí dalšího týdne: půlden navíc by vyjel z mřížky,
                // pruh proto končí na konci neděle.
                const right = Math.min(1, (nightsOf(ws, segEnd) + (endsHere ? 0.5 : 0)) / 7);
                const color =
                  bar.variant === "block" ? "text-ink" : bar.variant === "pending" ? "bg-amber text-ink" : "bg-pine text-white";
                return (
                  <button
                    key={`${bar.id}-${ws}`}
                    type="button"
                    onClick={() => onBarClick(bar.id)}
                    title={`${bar.label} · ${shortRange(bar.start, bar.end, bar.variant === "block" ? "block" : "stay")}`}
                    style={{
                      left: `calc(${left * 100}% + 1px)`,
                      width: `calc(${(right - left) * 100}% - 2px)`,
                      ...(bar.variant === "block" ? HATCH : {}),
                    }}
                    className={`absolute top-8 flex h-6 items-center overflow-hidden px-1.5 text-left text-[11px] font-semibold shadow-sm transition hover:brightness-95 sm:top-10 sm:h-7 sm:px-2 sm:text-xs ${color} ${
                      startsHere ? "rounded-l-full" : ""
                    } ${endsHere ? "rounded-r-full" : ""}`}
                  >
                    {/* Jméno jen na začátku úseku a jen když je pruh dost široký */}
                    {(startsHere || segStart === ws) && right - left > 0.2 && <span className="truncate">{bar.label}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">{legend}</div>
    </div>
  );
}
