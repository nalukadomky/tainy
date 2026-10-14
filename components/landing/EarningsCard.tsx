"use client";

import { useEffect, useRef } from "react";

// Přehled výdělků na úvodní stránce: když se karta objeví, čísla napočítají
// od nuly, sloupce postupně vyrostou a pruh zdrojů rezervací se rozjede.
// Všechno řídí jedna smyčka requestAnimationFrame, která píše rovnou do DOMu
// (transform místo výšky/šířky = plynulé i na slabším telefonu, žádné
// překreslování Reactu 60× za sekundu). Pokaždé, když se ke kartě znovu
// doscrolluje, začne to nanovo. Při omezení pohybu zůstane konečný stav.

const MONTHS: [string, number][] = [
  ["čvn", 42],
  ["čvc", 78],
  ["srp", 92],
  ["zář", 61],
  ["říj", 54],
  ["lis", 70],
];
const SOURCES: [string, number][] = [
  ["bg-pine", 55],
  ["bg-[#e0484d]", 30],
  ["bg-[#1f5fbf]", 15],
];
const REVENUE = 48200;
const OCCUPANCY = 74;
const DIRECT = 55;

const NUMBERS_MS = 1800; // napočítání čísel
const BAR_MS = 1300; // růst jednoho sloupce
const BAR_STAGGER = 110; // zpoždění mezi sloupci
const SOURCES_FROM = 500; // pruh zdrojů začne o něco později
const SOURCES_MS = 1500;

/** Plynulý doběh bez škubnutí na konci. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const czk = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;

export function EarningsCard() {
  const root = useRef<HTMLDivElement>(null);
  const revenue = useRef<HTMLSpanElement>(null);
  const occupancy = useRef<HTMLSpanElement>(null);
  const direct = useRef<HTMLSpanElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const sources = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;

    function paint(elapsed: number) {
      const n = easeOut(clamp(elapsed / NUMBERS_MS));
      if (revenue.current) revenue.current.textContent = czk(REVENUE * n);
      if (occupancy.current) occupancy.current.textContent = `${Math.round(OCCUPANCY * n)} %`;
      if (direct.current) direct.current.textContent = `${Math.round(DIRECT * n)} %`;
      bars.current.forEach((b, i) => {
        if (b) b.style.transform = `scaleY(${easeOut(clamp((elapsed - i * BAR_STAGGER) / BAR_MS))})`;
      });
      if (sources.current) sources.current.style.transform = `scaleX(${easeOut(clamp((elapsed - SOURCES_FROM) / SOURCES_MS))})`;
    }

    function run() {
      cancelAnimationFrame(raf);
      const start = performance.now();
      const total = Math.max(NUMBERS_MS, (MONTHS.length - 1) * BAR_STAGGER + BAR_MS, SOURCES_FROM + SOURCES_MS);
      const tick = (now: number) => {
        const elapsed = now - start;
        paint(elapsed);
        if (elapsed < total) raf = requestAnimationFrame(tick);
      };
      paint(0);
      raf = requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver(([e]) => e.isIntersecting && run(), { threshold: 0.45 });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={root} className="rounded-3xl border border-line bg-surface p-6 text-ink shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)]">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-soft">Tržby v listopadu</p>
          <p className="font-display text-3xl font-semibold tabular-nums">
            <span ref={revenue}>{czk(REVENUE)}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-soft">Obsazenost</p>
          <p className="font-display text-3xl font-semibold tabular-nums">
            <span ref={occupancy}>{OCCUPANCY} %</span>
          </p>
        </div>
      </div>
      <div className="mt-6 flex h-32 items-end gap-3">
        {MONTHS.map(([m, h], i) => (
          <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span
              ref={(b) => {
                bars.current[i] = b;
              }}
              className={`w-full origin-bottom rounded-t-lg will-change-transform ${i === MONTHS.length - 1 ? "bg-pine" : "bg-pine/20"}`}
              style={{ height: `${h}%` }}
            />
            <span className="text-[10px] text-soft">{m}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-bg">
        <div ref={sources} className="flex h-full origin-left will-change-transform">
          {SOURCES.map(([cls, w]) => (
            <span key={cls} className={cls} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-soft">
        <span ref={direct} className="tabular-nums">
          {DIRECT} %
        </span>{" "}
        rezervací přímo přes web · bez provize
      </p>
    </div>
  );
}
