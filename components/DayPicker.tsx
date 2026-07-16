"use client";

import { useMemo, useState } from "react";

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

export function DayPicker({ booked, start, end, onChange }: Props) {
  const today = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);
  const todayIso = isoLocal(today);
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [hint, setHint] = useState("");

  // Poloviny dne: dopoledne (am) a odpoledne (pm)
  function halves(day: string): { am: HalfState; pm: HalfState } {
    let am: HalfState = "free";
    let pm: HalfState = "free";
    for (const b of booked) {
      if (day > b.start && day < b.end) { am = "booked"; pm = "booked"; }
      else if (day === b.start) pm = "booked";
      else if (day === b.end) am = am === "booked" ? am : "booked";
    }
    if (start) {
      const sel = { s: start, e: end ?? start };
      if (day > sel.s && end && day < end) { am = "selected"; pm = "selected"; }
      else {
        if (day === sel.s) pm = "selected";
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
    if (day < todayIso || fullyBooked) return;

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
    onChange({ start, end: day });
  }

  // Mřížka měsíce (týden začíná pondělím)
  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(isoLocal(new Date(view.getFullYear(), view.getMonth(), d)));
    }
    return out;
  }, [view]);

  const canGoBack = view > new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <div>
      {/* Hlavička měsíce */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Předchozí měsíc"
          disabled={!canGoBack}
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-soft transition hover:border-pine/40 hover:text-ink disabled:opacity-30"
        >
          ←
        </button>
        <span className="font-display text-lg font-semibold capitalize">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </span>
        <button
          type="button"
          aria-label="Další měsíc"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-soft transition hover:border-pine/40 hover:text-ink"
        >
          →
        </button>
      </div>

      {/* Dny v týdnu */}
      <div
        className="mt-3 grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-soft"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">{w}</span>
        ))}
      </div>

      {/* Mřížka dnů */}
      <div
        className="grid grid-cols-7 gap-y-1"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {cells.map((day, i) => {
          if (!day) return <span key={`x${i}`} />;
          const h = halves(day);
          const past = day < todayIso;
          const fullyBooked = h.am === "booked" && h.pm === "booked";
          const fullySelected = h.am === "selected" && h.pm === "selected";
          const isEdgeSelected = h.am === "selected" || h.pm === "selected";
          const disabled = past || fullyBooked;
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => clickDay(day)}
              aria-label={day}
              className={`relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-sm transition sm:h-11 sm:w-11 ${
                past ? "text-line" : fullyBooked ? "text-soft/50" : "text-ink hover:ring-2 hover:ring-pine/25"
              } ${fullySelected || isEdgeSelected ? "font-semibold" : ""} ${
                fullySelected ? "!text-white" : ""
              } ${day === todayIso ? "ring-1 ring-line" : ""}`}
              style={{
                background:
                  h.am === "free" && h.pm === "free"
                    ? undefined
                    : `linear-gradient(135deg, ${HALF_COLOR[h.am]} 50%, ${HALF_COLOR[h.pm]} 50%)`,
              }}
            >
              <span className={isEdgeSelected && !fullySelected ? "drop-shadow-[0_0_2px_rgba(255,255,255,0.9)]" : ""}>
                {Number(day.slice(8))}
              </span>
            </button>
          );
        })}
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
            style={{ background: "linear-gradient(135deg, #ddd3c1 50%, transparent 50%)" }}
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
