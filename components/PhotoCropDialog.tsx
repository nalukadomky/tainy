"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_CROP, MAX_ZOOM, cropStyle, parseCrop, serializeCrop, type Crop } from "@/lib/crop";

// Úprava výřezu fotky: tažením se fotka posouvá, posuvníkem (nebo kolečkem
// a dvěma prsty) se přibližuje. Rámeček má tvar jako na webu. Soubor se
// nemění — ukládá se jen výřez.

export function PhotoCropDialog({
  src,
  value,
  shape,
  onSave,
  onClose,
}: {
  src: string;
  value: string;
  /** Tvar rámečku jako na webu: poměr stran („4 / 5“), nebo kruh. */
  shape: string | "circle";
  onSave: (crop: string) => void;
  onClose: () => void;
}) {
  const [crop, setCrop] = useState<Crop>(() => parseCrop(value));
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; start: Crop } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Kolik pixelů jde fotku v rámečku posunout (vodorovně, svisle) při daném přiblížení. */
  function panRange(zoom: number) {
    const el = frame.current;
    if (!el || !natural) return { w: 1, h: 1 };
    const fw = el.clientWidth;
    const fh = el.clientHeight;
    const cover = Math.max(fw / natural.w, fh / natural.h);
    return { w: Math.max(1, natural.w * cover * zoom - fw), h: Math.max(1, natural.h * cover * zoom - fh) };
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  function onDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: crop.zoom };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, start: crop };
      setDragging(true);
    }
  }
  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const zoom = Math.max(1, Math.min(MAX_ZOOM, (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist));
      setCrop((c) => ({ ...c, zoom }));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const range = panRange(d.start.zoom);
    // Táhnu fotku doprava = ukážu víc z její levé části
    setCrop({
      ...d.start,
      x: clamp(d.start.x - ((e.clientX - d.x) / range.w) * 100),
      y: clamp(d.start.y - ((e.clientY - d.y) / range.h) * 100),
    });
  }
  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setDragging(false);
    }
  }

  const circle = shape === "circle";

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/60 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upravit výřez fotky"
        className="rise w-full max-w-md rounded-t-3xl bg-surface p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Upravit výřez fotky</h2>
            <p className="mt-0.5 text-sm text-soft">Táhni fotku na správné místo a přibliž ji.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-soft transition hover:bg-bg hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex justify-center rounded-2xl bg-ink/90 p-4">
          <div
            ref={frame}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onWheel={(e) => setCrop((c) => ({ ...c, zoom: Math.max(1, Math.min(MAX_ZOOM, c.zoom - e.deltaY * 0.002)) }))}
            className="relative overflow-hidden bg-bg select-none"
            style={{
              width: circle ? 240 : shape === "4 / 3" ? 300 : 248,
              aspectRatio: circle ? "1" : shape,
              borderRadius: circle ? "50%" : 18,
              cursor: dragging ? "grabbing" : "grab",
              touchAction: "none",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={cropStyle(crop)}
            />
            {/* Mřížka třetin při posouvání */}
            {dragging && (
              <span aria-hidden className="pointer-events-none absolute inset-0">
                {[33.33, 66.66].map((p) => (
                  <span key={`v${p}`} className="absolute bottom-0 top-0 w-px bg-white/50" style={{ left: `${p}%` }} />
                ))}
                {[33.33, 66.66].map((p) => (
                  <span key={`h${p}`} className="absolute left-0 right-0 h-px bg-white/50" style={{ top: `${p}%` }} />
                ))}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span aria-hidden className="text-lg text-soft">−</span>
          <input
            type="range"
            aria-label="Přiblížení"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            onChange={(e) => setCrop((c) => ({ ...c, zoom: Number(e.target.value) }))}
            className="flex-1 accent-[var(--pine)]"
          />
          <span aria-hidden className="text-lg text-soft">+</span>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCrop(DEFAULT_CROP)}
            className="text-sm font-medium text-soft underline-offset-4 hover:text-ink hover:underline"
          >
            Obnovit
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost !px-4 !py-2 text-sm" onClick={onClose}>
              Zrušit
            </button>
            <button type="button" className="btn-primary !px-5 !py-2 text-sm" onClick={() => onSave(serializeCrop(crop))}>
              Hotovo
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
