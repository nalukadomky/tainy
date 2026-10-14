"use client";

import { useEffect, useRef, useState } from "react";

// Časová osa e-mailů hostovi na úvodní stránce: body se postupně přidávají
// a jeden po druhém se odškrtnou jako odeslané. Pak chvíli počká a jede znovu.
// Spustí se, až je vidět; při omezení pohybu ukáže rovnou hotový stav.

const MAILS: [string, string][] = [
  ["Potvrzení rezervace", "hned po rezervaci · s QR platbou"],
  ["Platba přijata", "po zaplacení"],
  ["Před příjezdem", "3 dny předem · kód k zámku a Wi-Fi"],
  ["Poděkování", "den po odjezdu · prosba o recenzi"],
];

const APPEAR_MS = 600; // od objevení bodu k odškrtnutí
const NEXT_MS = 1100; // od odškrtnutí k dalšímu bodu
const HOLD_MS = 2600; // hotový seznam před dalším kolem

export function MailSteps() {
  const ref = useRef<HTMLOListElement>(null);
  // shown = kolik bodů je vidět, done = kolik je odškrtnutých
  const [state, setState] = useState({ shown: MAILS.length, done: MAILS.length });

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const clear = () => timers.splice(0).forEach((t) => window.clearTimeout(t));

    function run() {
      clear();
      setState({ shown: 0, done: 0 });
      let t = 300;
      MAILS.forEach((_, n) => {
        at(t, () => setState({ shown: n + 1, done: n }));
        at(t + APPEAR_MS, () => setState({ shown: n + 1, done: n + 1 }));
        t += NEXT_MS;
      });
      at(t + HOLD_MS, run);
    }

    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? run() : clear()), { threshold: 0.4 });
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, []);

  return (
    <ol ref={ref} className="relative mt-5 space-y-5">
      {MAILS.map(([title, when], n) => {
        const visible = n < state.shown;
        const done = n < state.done;
        return (
          <li
            key={title}
            className="relative flex gap-4 transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
            style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(10px)" }}
          >
            {/* spojnice k dalšímu bodu */}
            {n < MAILS.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[9px] top-[22px] h-[calc(100%-2px)] w-px origin-top bg-line transition-transform duration-500"
                style={{ transform: `scaleY(${n + 1 < state.shown ? 1 : 0})` }}
              />
            )}
            <span
              className={`relative z-10 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full text-[10px] transition-all duration-300 ${
                done ? "scale-100 bg-pine text-white" : "border-2 border-line bg-surface"
              }`}
              style={done ? { animation: "pop .35s cubic-bezier(.2,.7,.2,1.4)" } : undefined}
            >
              {done ? "✓" : ""}
            </span>
            <span>
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-xs text-soft">{when}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
