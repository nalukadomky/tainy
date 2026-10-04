"use client";

import { useEffect, useState, type RefObject } from "react";

// Plocha s webem v rámu zařízení (okno prohlížeče / telefon). Web běží v iframe
// (/nahled) ve skutečné šířce zařízení a zmenší se do plochy — breakpointy
// i výška okna tak odpovídají tomu, co uvidí hosté. Používá živý náhled
// v editoru i builder.

export type Device = "desktop" | "mobile";
export const DEVICES: Record<Device, { label: string; width: number; height: number }> = {
  desktop: { label: "Počítač", width: 1280, height: 800 },
  mobile: { label: "Mobil", width: 390, height: 844 },
};

const PAD = 24;

// Ořezové prvky kolem iframe se nesmí posunout (např. scrollIntoView z webu
// v iframe posouvá i předky) — jinak web v rámu „uteče" nahoru.
const unscroll = (e: React.UIEvent<HTMLElement>) => {
  e.currentTarget.scrollTop = 0;
  e.currentTarget.scrollLeft = 0;
};
const CHROME_H = 36; // lišta okna prohlížeče
const BEZEL = 10; // rám telefonu

export function DeviceStage({
  device,
  slug,
  frameRef,
  title,
}: {
  device: Device;
  slug: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  title: string;
}) {
  // Callback ref: plocha s rámem a bez rámu jsou různé prvky, měřit se musí ten aktuální.
  const [stageEl, stageRef] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!stageEl) return;
    const ro = new ResizeObserver(([entry]) => setStage({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);

  // Na telefonu (úzká plocha) ukážeme web rovnou přes celou plochu, bez rámu —
  // telefon v telefonu by jen ubral místo.
  if (device === "mobile" && stage.w > 0 && stage.w < 500) {
    return (
      <div ref={stageRef} onScroll={unscroll} className="relative flex flex-1 overflow-hidden">
        <iframe ref={frameRef} src="/nahled" title={title} className="block h-full w-full border-0 bg-cream" />
      </div>
    );
  }

  const dev = DEVICES[device];
  let scale: number;
  let screenW: number;
  let screenH: number;
  if (device === "desktop") {
    // Na širokém monitoru web nezvětšujeme nad skutečnou velikost.
    scale = Math.max(0, Math.min(1, (stage.w - 2 * PAD) / dev.width));
    screenW = dev.width * scale;
    screenH = Math.max(0, stage.h - 2 * PAD - CHROME_H);
  } else {
    scale = Math.max(0, Math.min(1, (stage.w - 2 * PAD - 2 * BEZEL) / dev.width, (stage.h - 2 * PAD - 2 * BEZEL) / dev.height));
    screenW = dev.width * scale;
    screenH = dev.height * scale;
  }

  const iframe = (
    <iframe
      ref={frameRef}
      src="/nahled"
      title={title}
      className="block origin-top-left border-0 bg-cream"
      style={{ width: dev.width, height: scale ? screenH / scale : 0, transform: `scale(${scale})` }}
    />
  );

  return (
    <div ref={stageRef} onScroll={unscroll} className="paper relative flex flex-1 items-start justify-center overflow-hidden" style={{ padding: PAD }}>
      {device === "desktop" ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-2xl" style={{ width: screenW }}>
          <div className="flex items-center gap-3 border-b border-line bg-bg px-3" style={{ height: CHROME_H }}>
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-coral/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-pine/60" />
            </span>
            <span className="mx-auto max-w-[60%] truncate rounded-md bg-surface px-3 py-0.5 text-center text-[11px] text-soft">
              🔒 tainy.cz/w/{slug}
            </span>
            <span className="w-[42px]" aria-hidden />
          </div>
          <div className="overflow-hidden" onScroll={unscroll} style={{ width: screenW, height: screenH }}>
            {iframe}
          </div>
        </div>
      ) : (
        <div
          className="relative self-center bg-ink shadow-2xl"
          style={{ padding: BEZEL, width: screenW + 2 * BEZEL, borderRadius: 48 * scale + BEZEL }}
        >
          <span
            aria-hidden
            className="absolute left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink"
            style={{ top: BEZEL + 11 * scale, width: 110 * scale, height: 30 * scale }}
          />
          <div className="overflow-hidden" onScroll={unscroll} style={{ width: screenW, height: screenH, borderRadius: 48 * scale }}>
            {iframe}
          </div>
        </div>
      )}
    </div>
  );
}

const ICONS: Record<Device, React.ReactNode> = {
  desktop: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
  mobile: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  ),
};

/** Přepínač Počítač / Mobil. */
export function DeviceSwitch({ value, onChange }: { value: Device; onChange: (d: Device) => void }) {
  return (
    <div className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-line bg-bg p-0.5" role="tablist" aria-label="Zařízení">
      {(Object.keys(DEVICES) as Device[]).map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          aria-selected={value === d}
          aria-label={DEVICES[d].label}
          title={DEVICES[d].label}
          onClick={() => onChange(d)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
            value === d ? "bg-ink text-white" : "text-soft hover:text-ink"
          }`}
        >
          {ICONS[d]}
          <span className="max-sm:hidden">{DEVICES[d].label}</span>
        </button>
      ))}
    </div>
  );
}
