"use client";

import { useMemo, useState } from "react";
import { addDays, nightsOf, todayISO } from "@/lib/stay";
import { plural } from "@/lib/pricing";

// Kalendář výběru termínu. Den má dvě poloviny (dopoledne / odpoledne):
// den odjezdu je obsazený jen dopoledne, den příjezdu jen odpoledne.
// Krajní dny výběru i existujících rezervací se proto kreslí jako půldny
// (diagonálně rozdělená buňka) a rezervace na sebe mohou plynule navazovat.

export type BookedRange = { start: string; end: string }; // ISO yyyy-mm-dd, end exklusivně (den odjezdu)

type Props = {
  booked: BookedRange[];
  start: string | null;
  end: string | null;
  onChange: (range: { start: string | null; end: string | null }) => void;
  /** Nejkratší možný pobyt v nocích. */
  minNights?: number;
  /** Nejdřívější možný den příjezdu (ISO) — plyne z `leadTimeDays` webu. */
  earliest?: string;
  /** Cena jedné noci začínající daným dnem; null = cenu nezobrazovat. */
  priceOf?: (iso: string) => number | null;
  /** Měsíc, který se ukáže jako první (ISO datum v něm); výchozí je nejbližší volný den. */
  initialMonth?: string;
};

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const MONTHS = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
];

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type HalfState = "free" | "booked" | "selected";

const HALF_COLOR: Record<HalfState, string> = {
  free: "transparent",
  booked: "#ddd3c1",
  selected: "var(--pine)",
};

/** Zkrácená cena do buňky kalendáře: 2 900 → „2,9k". */
function shortPrice(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(".", ",")}k` : String(n);
}

export function DayPicker({ booked, start, end, onChange, minNights = 1, earliest, priceOf, initialMonth }: Props) {
  const today = useMemo(() => todayISO(), []);
  const firstBookable = earliest && earliest > today ? earliest : today;
  const [view, setView] = useState(() => {
    const [y, m] = (initialMonth && initialMonth > firstBookable ? initialMonth : firstBookable).split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [hint, setHint] = useState("");

  // Obsazenost se z rozsahů rozbalí jednou do množin, takže dotaz na den
  // je konstantní — jinak by se pro každou buňku procházely všechny rezervace.
  const occupied = useMemo(() => {
    const am = new Set<string>(); // dopoledne obsazeno (den odjezdu a dny uvnitř)
    const pm = new Set<string>(); // odpoledne obsazeno (den příjezdu a dny uvnitř)
    for (const b of booked) {
      for (let d = b.start; d < b.end; d = addDays(d, 1)) {
        pm.add(d);
        if (d !== b.start) am.add(d);
      }
      am.add(b.end); // den odjezdu je obsazený jen dopoledne
    }
    return { am, pm };
  }, [booked]);

  function halves(day: string): { am: HalfState; pm: HalfState } {
    let am: HalfState = occupied.am.has(day) ? "booked" : "free";
    let pm: HalfState = occupied.pm.has(day) ? "booked" : "free";
    if (start) {
      if (end && day > start && day < end) { am = "selected"; pm = "selected"; }
      else {
        if (day === start) pm = "selected";
        if (end && day === end) am = "selected";
      }
    }
    return { am, pm };
  }

  function rangeIsFree(s: string, e: string): boolean {
    return !booked.some((b) => b.start < e && b.end > s);
  }

  function clickDay(day: string) {
    setHint("");
    const h = halves(day);
    const fullyBooked = h.am === "booked" && h.pm === "booked";
    if (day < firstBookable || fullyBooked) return;

    // Klik na už vybraný příjezd nebo odjezd výběr zruší — cesta zpět, když host překlikl.
    if (day === start || day === end) {
      onChange({ start: null, end: null });
      return;
    }

    if (!start || (start && end)) {
      // nový výběr — den příjezdu nesmí mít obsazené odpoledne
      if (h.pm === "booked") {
        setHint("V tento den už večer spí jiný host — vyber ho jako den odjezdu, nebo zvol jiný příjezd.");
        return;
      }
      onChange({ start: day, end: null });
      return;
    }
    if (day <= start) {
      if (h.pm === "booked") return;
      onChange({ start: day, end: null });
      return;
    }
    if (!rangeIsFree(start, day)) {
      setHint("Vybraný termín zasahuje do obsazených dnů — zkus kratší pobyt nebo jiné datum.");
      return;
    }
    if (nightsOf(start, day) < minNights) {
      setHint(`Nejkratší možný pobyt je ${minNights} ${plural(minNights, "noc", "noci", "nocí")}.`);
      return;
    }
    onChange({ start, end: day });
  }

  const canGoBack =
    view.y * 12 + view.m > Number(firstBookable.slice(0, 4)) * 12 + Number(firstBookable.slice(5, 7)) - 1;

  function shift(by: number) {
    const total = view.y * 12 + view.m + by;
    setView({ y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 });
  }

  function renderMonth(offset: number) {
    const total = view.y * 12 + view.m + offset;
    const y = Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12;

    const lead = (new Date(y, m, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(isoLocal(new Date(y, m, d)));

    return (
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-center font-display text-base font-semibold capitalize">
          {MONTHS[m]} {y}
        </p>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-soft">
          {WEEKDAYS.map((w) => (
            <span key={w} className="py-1">{w}</span>
          ))}
        </div>
        {/* Den zabírá nejvýš 88 % sloupce — mezera mezi čtverečky zůstane při jakékoli šířce */}
        <div className="grid grid-cols-7 gap-y-1.5">
          {cells.map((day, i) => {
            if (!day) return <span key={`x${i}`} />;
            const h = halves(day);
            const past = day < firstBookable;
            const fullyBooked = h.am === "booked" && h.pm === "booked";
            const isEdgeSelected = h.am === "selected" || h.pm === "selected";
            const disabled = past || fullyBooked;
            const cisloNaTmave = h.am === "selected";
            const cenaNaTmave = h.pm === "selected";
            const price = !disabled && h.pm !== "booked" && priceOf ? priceOf(day) : null;

            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => clickDay(day)}
                aria-label={day}
                className={`relative mx-auto flex aspect-square w-[88%] max-w-10 flex-col items-center justify-center rounded-lg leading-none transition sm:max-w-[43px] sm:rounded-xl ${
                  past ? "text-line" : fullyBooked ? "text-soft/50" : "text-ink hover:ring-2 hover:ring-pine/25"
                } ${isEdgeSelected ? "font-semibold" : ""} ${
                  day === today ? "ring-1 ring-line" : ""
                }`}
                style={{
                  background:
                    h.am === "free" && h.pm === "free"
                      ? undefined
                      : `linear-gradient(to bottom right, ${HALF_COLOR[h.am]} 50%, ${HALF_COLOR[h.pm]} 50%)`,
                }}
              >
                <span
                  className={`text-sm ${
                    cisloNaTmave
                      ? "text-white drop-shadow-[0_1px_2px_rgba(30,42,32,0.9)]"
                      : isEdgeSelected
                        ? "drop-shadow-[0_0_2px_rgba(255,255,255,0.9)]"
                        : ""
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                {price !== null && (
                  <span
                    className={`mt-0.5 text-[9px] ${
                      cenaNaTmave
                        ? "text-white/85 drop-shadow-[0_1px_2px_rgba(30,42,32,0.9)]"
                        : "text-soft"
                    }`}
                  >
                    {shortPrice(price)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Hlavička s přepínáním měsíců */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Předchozí měsíc"
          disabled={!canGoBack}
          onClick={() => shift(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-soft transition hover:border-pine/40 hover:text-ink disabled:opacity-30"
        >
          ←
        </button>
        <span className="text-xs font-medium uppercase tracking-wider text-soft">
          {!start ? "Vyber den příjezdu" : !end ? "Vyber den odjezdu" : "Vybraný termín"}
        </span>
        <button
          type="button"
          aria-label="Další měsíc"
          onClick={() => shift(1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-soft transition hover:border-pine/40 hover:text-ink"
        >
          →
        </button>
      </div>

      {/* Jeden měsíc na mobilu, dva vedle sebe na širší obrazovce */}
      <div className="mt-3 flex gap-6">
        {renderMonth(0)}
        <div className="hidden min-w-0 flex-1 sm:block">{renderMonth(1)}</div>
      </div>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-soft">
        <span className="flex items-center gap-1.5">
          <i className="h-3.5 w-3.5 rounded-[4px] bg-pine" /> tvůj pobyt
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-3.5 w-3.5 rounded-[4px]" style={{ background: "#ddd3c1" }} /> obsazeno
        </span>
        <span className="flex items-center gap-1.5">
          <i
            className="h-3.5 w-3.5 rounded-[4px] border border-line"
            style={{ background: "linear-gradient(to bottom right, #ddd3c1 50%, transparent 50%)" }}
          />
          půlden — příjezd / odjezd
        </span>
      </div>

      {hint && (
        <p className="mt-3 rounded-xl bg-amber/15 px-4 py-2.5 text-sm font-medium text-[#92600a]">
          {hint}
        </p>
      )}
    </div>
  );
}
