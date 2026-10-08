"use client";

import { useRef, useState } from "react";

// Mobil: tažením karty doleva se rezervace označí jako zaplacená. Pod kartou
// se odkrývá zelený pruh „Zaplaceno“; po překročení hranice stačí pustit.
// Svislé posouvání stránky zůstává prohlížeči (touch-action: pan-y), gesto
// se chytá jen u dotyku a jen na úzké obrazovce.

const THRESHOLD = 0.35; // podíl šířky karty, od kterého se po puštění označí zaplaceno
const LOCK = 8; // px — po kolika pixelech se rozhodne, jestli jde o vodorovné tažení

export function SwipeToPay({
  enabled,
  onPay,
  id,
  className,
  children,
}: {
  enabled: boolean;
  onPay: () => void;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; width: number; axis: "x" | "y" | null } | null>(null);
  const swiped = useRef(false); // potlačí klik (otevření detailu) po tažení

  const reset = () => {
    start.current = null;
    setDragging(false);
    setDx(0);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    swiped.current = false;
    if (!enabled || e.pointerType !== "touch" || window.matchMedia("(min-width: 640px)").matches) return;
    start.current = { x: e.clientX, y: e.clientY, width: e.currentTarget.offsetWidth, axis: null };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(mx) < LOCK && Math.abs(my) < LOCK) return;
      s.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (s.axis === "y") return reset();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    swiped.current = true;
    const next = Math.min(0, mx); // jen doleva
    const passed = -next >= s.width * THRESHOLD;
    if (passed !== -dx >= s.width * THRESHOLD) navigator.vibrate?.(10);
    setDx(next);
  };

  const onPointerUp = () => {
    const s = start.current;
    if (!s) return;
    if (dragging && -dx >= s.width * THRESHOLD) {
      // Dojet kartou až za okraj, pak označit a vrátit kartu na místo
      start.current = null;
      setDragging(false);
      setDx(-s.width);
      setTimeout(() => {
        onPay();
        setDx(0);
      }, 180);
    } else reset();
  };

  const width = start.current?.width ?? 1;
  const passed = -dx >= width * THRESHOLD;

  return (
    // Ořez jen během tažení — jinak by uřízl nabídku „⋯“, která přesahuje kartu
    <div id={id} className={`relative rounded-2xl ${className ?? ""}`} style={{ overflow: dx ? "hidden" : undefined }}>
      {enabled && dx < 0 && (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-end rounded-2xl pr-6 text-sm font-semibold text-white"
          style={{
            background: passed || !dragging ? "var(--pine)" : "color-mix(in srgb, var(--pine) 55%, var(--soft))",
            transition: "background 150ms",
          }}
        >
          <span style={{ transform: `scale(${passed ? 1.08 : 1})`, transition: "transform 150ms" }}>✓ Zaplaceno</span>
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.stopPropagation();
            e.preventDefault();
            swiped.current = false;
          }
        }}
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: dragging ? "none" : "transform 200ms ease-out",
          touchAction: enabled ? "pan-y" : undefined,
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}
