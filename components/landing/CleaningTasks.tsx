"use client";

import { useEffect, useRef, useState } from "react";

// Úkoly úklidu na úvodní stránce: uklízečka je jeden po druhém odškrtá,
// pak se úklid označí jako hotový. Chvíli počká a jede znovu.
// Spustí se, až je vidět; při omezení pohybu ukáže rovnou hotový stav.

const TASKS = ["Povléct postele (3×)", "Vytřít podlahy", "Doplnit dřevo do kamen", "Vynést koš"];

const STEP_MS = 900; // mezi odškrtnutím úkolů
const HOLD_MS = 2600; // hotový úklid před dalším kolem

export function CleaningTasks() {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(TASKS.length);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const clear = () => timers.splice(0).forEach((t) => window.clearTimeout(t));

    function run() {
      clear();
      setDone(0);
      TASKS.forEach((_, n) => at(700 + n * STEP_MS, () => setDone(n + 1)));
      at(700 + TASKS.length * STEP_MS + HOLD_MS, run);
    }

    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? run() : clear()), { threshold: 0.4 });
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, []);

  const finished = done === TASKS.length;

  return (
    <div ref={ref}>
      <ul className="mt-4 space-y-2.5">
        {TASKS.map((t, n) => {
          const checked = n < done;
          return (
            <li key={t} className="flex items-center gap-2.5 text-sm">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] transition-colors duration-300 ${
                  checked ? "bg-pine text-white" : "border-2 border-line"
                }`}
                style={checked ? { animation: "pop .35s cubic-bezier(.2,.7,.2,1.4)" } : undefined}
              >
                {checked ? "✓" : ""}
              </span>
              {/* přeškrtnutí se protáhne zleva doprava */}
              <span className={`relative transition-colors duration-300 ${checked ? "text-soft" : ""}`}>
                {t}
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-px w-full origin-left bg-current transition-transform duration-500"
                  style={{ transform: `scaleX(${checked ? 1 : 0})` }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <div
        className={`mt-4 flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-500 ${finished ? "bg-pine text-white" : "bg-bg"}`}
      >
        <span className={`text-xs transition-colors duration-500 ${finished ? "text-white/85" : "text-soft"}`}>
          {finished ? "✓ Uklizeno · odměna" : "Odměna"}
        </span>
        <span className="text-sm font-semibold">600 Kč</span>
      </div>
    </div>
  );
}
