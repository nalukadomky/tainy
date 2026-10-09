"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SiteViewData } from "@/components/SiteView";
import type { BookedRange } from "@/components/DayPicker";
import { toSiteViewData, type SiteSource } from "@/lib/siteView";
import type { EditableField, EditableSection } from "@/components/EditableText";
import { DeviceStage, DeviceSwitch, type Device } from "@/components/DeviceStage";

// Živý náhled webu vedle editoru. Web běží v iframe (/nahled, viz DeviceStage)
// a editor mu posílá neuložený formulář přes postMessage.

/** Sekce webu, na které umí náhled odscrollovat (id v SiteView). */
export type PreviewSection = "uvod" | "galerie" | "o-miste" | "vybaveni" | "poloha" | "rezervace";

export type PreviewMessage =
  | { type: "ready" }
  | { type: "site"; site: SiteViewData; booked: BookedRange[]; editable?: boolean }
  | { type: "focus"; section: PreviewSection }
  // Builder: úprava textu přímo ve webu a klik na „Upravit" u sekce
  | { type: "edit"; field: EditableField; value: string }
  | { type: "select"; section: EditableSection };

/**
 * Komunikace s webem v iframe (/nahled) pro editory přímo ve webu (builder,
 * onboarding): pošle data webu, přijímá úpravy textu a klik na „Upravit" u sekce
 * a umí web odscrollovat na sekci. Při přepnutí zařízení se iframe načte znovu
 * a data dostane i podruhé.
 */
export function usePreviewFrame({
  site,
  booked,
  editable,
  focus,
  onEdit,
  onSelect,
}: {
  site: SiteViewData | null;
  booked: BookedRange[];
  editable: boolean;
  /** Otevřená sekce — web na ni sjede. */
  focus: PreviewSection | null;
  onEdit?: (field: EditableField, value: string) => void;
  onSelect?: (section: EditableSection) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(0);
  const handlers = useRef({ onEdit, onSelect });
  handlers.current = { onEdit, onSelect };

  useEffect(() => {
    function onMessage(e: MessageEvent<PreviewMessage>) {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const msg = e.data;
      if (msg?.type === "ready") setReady((n) => n + 1);
      if (msg?.type === "edit") handlers.current.onEdit?.(msg.field, msg.value);
      if (msg?.type === "select") handlers.current.onSelect?.(msg.section);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const send = useCallback(
    (msg: PreviewMessage) => frameRef.current?.contentWindow?.postMessage(msg, window.location.origin),
    []
  );

  useEffect(() => {
    if (!ready || !site) return;
    const t = window.setTimeout(() => send({ type: "site", site, booked, editable }), 60);
    return () => window.clearTimeout(t);
  }, [ready, site, booked, editable, send]);

  useEffect(() => {
    if (ready && focus) send({ type: "focus", section: focus });
  }, [ready, focus, send]);

  return frameRef;
}

// Šířka panelu na počítači; editor o ni uhne (viz .admin-shell v globals.css).
const PANEL_W = "min(46vw, 820px)";

function stored<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function LivePreview({
  site,
  dirty,
  focus,
}: {
  site: SiteSource;
  /** Formulář se liší od uloženého webu. */
  dirty: boolean;
  /** Sekce, kterou majitel právě upravuje; `at` znovu spustí zvýraznění stejné sekce. */
  focus: { section: PreviewSection; at: number } | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  // Počítadlo ohlášení iframe — při přepnutí zařízení se iframe načte znovu
  // a musí dostat data i podruhé. 0 = iframe ještě neposlouchá.
  const [ready, setReady] = useState(0);
  const [booked, setBooked] = useState<BookedRange[]>([]);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setMounted(true);
    setOpen(stored("tainy.preview.open", "0", ["0", "1"]) === "1");
    setDevice(stored<Device>("tainy.preview.device", "desktop", ["desktop", "mobile"]));
  }, []);

  function toggle(next: boolean) {
    setOpen(next);
    if (!next) setReady(0);
    store("tainy.preview.open", next ? "1" : "0");
  }
  function pickDevice(d: Device) {
    setDevice(d);
    store("tainy.preview.device", d);
  }

  // Editor uhne panelu; po zavření nebo odchodu ze stránky se vrátí.
  // Na počítači začíná panel pod navigací administrace, ať zůstane celá vidět.
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty("--preview-w", PANEL_W);
    const nav = document.querySelector<HTMLElement>("[data-admin-nav]");
    html.style.setProperty("--preview-top", `${nav?.offsetHeight ?? 0}px`);
    html.toggleAttribute("data-preview-open", open);
    return () => html.removeAttribute("data-preview-open");
  }, [open]);

  // Esc zavře náhled
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && toggle(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Skutečná obsazenost, ať kalendář v náhledu vypadá jako na webu.
  useEffect(() => {
    fetch(`/api/availability?site=${site.slug}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setBooked)
      .catch(() => {});
  }, [site.slug]);

  // Iframe ohlásí, že poslouchá.
  useEffect(() => {
    function onMessage(e: MessageEvent<PreviewMessage>) {
      if (e.origin === window.location.origin && e.source === frameRef.current?.contentWindow && e.data?.type === "ready") {
        setReady((n) => n + 1);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const send = (msg: PreviewMessage) => frameRef.current?.contentWindow?.postMessage(msg, window.location.origin);

  // Formulář → náhled (s krátkým zpožděním, ať se při psaní nepřekresluje každé písmeno)
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => send({ type: "site", site: toSiteViewData(site), booked }), 120);
    return () => window.clearTimeout(t);
  }, [ready, site, booked]);

  useEffect(() => {
    if (ready && focus) send({ type: "focus", section: focus.section });
  }, [ready, focus]);

  // Do <body>: předek s CSS transformací (animace .rise) by jinak z `fixed`
  // udělal pozicování vůči sobě a panel by nesahal přes celé okno.
  if (!mounted) return null;
  if (!open) {
    return createPortal(
      <button
        type="button"
        onClick={() => toggle(true)}
        className="rise fixed bottom-28 right-5 z-40 inline-flex items-center gap-2.5 rounded-full bg-ink py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl sm:bottom-8 sm:right-8"
      >
        <span className="relative flex h-2.5 w-2.5">
          {dirty && <span className="absolute inset-0 animate-ping rounded-full bg-amber opacity-75" />}
          <span className={`relative h-2.5 w-2.5 rounded-full ${dirty ? "bg-amber" : "bg-[#7fc49a]"}`} />
        </span>
        Náhled webu
      </button>,
      document.body
    );
  }

  return createPortal(
    <aside
      aria-label="Živý náhled webu"
      className="preview-in fixed inset-0 z-[70] flex flex-col bg-bg lg:left-auto lg:top-[var(--preview-top)] lg:w-[var(--preview-w)] lg:border-l lg:border-line lg:shadow-[-24px_0_48px_-24px_rgba(30,42,32,0.18)]"
    >

      {/* Hlavička */}
      <div className="flex items-center gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur">
        <div className="mr-auto min-w-0">
          <p className="flex items-center gap-2 font-display text-base font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-pine/50" />
              <span className="relative h-2 w-2 rounded-full bg-pine" />
            </span>
            Živý náhled
          </p>
          <p className="truncate text-xs text-soft">
            {dirty ? "Neuložené změny — hosté zatím vidí původní verzi" : "Takhle web vidí hosté"}
          </p>
        </div>

        <DeviceSwitch value={device} onChange={pickDevice} />

        <a
          href={`/w/${site.slug}`}
          target="_blank"
          className="rounded-full px-2 py-1.5 text-sm font-medium text-pine hover:bg-pine/10 max-sm:hidden"
          title="Otevřít uložený web v nové záložce"
        >
          Web ↗
        </a>
        <button
          type="button"
          onClick={() => toggle(false)}
          aria-label="Zavřít náhled"
          className="flex h-8 w-8 items-center justify-center rounded-full text-soft hover:bg-line/60 hover:text-ink"
        >
          ✕
        </button>
      </div>

      {/* Plocha se zařízením */}
      <DeviceStage device={device} slug={site.slug} frameRef={frameRef} title="Živý náhled webu" />
    </aside>,
    document.body
  );
}
