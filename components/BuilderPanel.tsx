"use client";

import { useEffect, useRef, useState } from "react";
import { SectionMenu, type MenuSection } from "@/components/SectionMenu";

// Panel sekce v editorech přímo ve webu (builder, onboarding): na počítači
// vpravo vedle webu, na mobilu jako spodní okno. Esc i ✕ ho zavřou.

export type { MenuSection as PanelSection } from "@/components/SectionMenu";

export function BuilderPanel({
  title,
  onClose,
  children,
  sections,
  current,
  onSwitch,
  onReorder,
  onToggle,
  move,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Přepínání mezi sekcemi webu z nadpisu panelu (v pořadí na webu). */
  sections?: MenuSection[];
  current?: string;
  onSwitch?: (key: string) => void;
  /** Přetažení sekcí v nabídce: nové pořadí zapnutých bloků. */
  onReorder?: (blocks: string[]) => void;
  /** Zapnutí / vypnutí nepovinné sekce (O nás, Recenze, Poloha). */
  onToggle?: (key: string, on: boolean) => void;
  /** Šipky pro posun sekce na webu (Úvod a Patička je nemají). */
  move?: { up: boolean; down: boolean; onMove: (by: -1 | 1) => void };
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu) setMenu(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, menu]);

  return (
    <aside
      aria-label={title}
      className="preview-in absolute inset-x-0 bottom-0 z-20 flex max-h-[75%] flex-col rounded-t-3xl border-t border-line bg-surface shadow-2xl lg:static lg:max-h-none lg:w-[400px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        {sections && onSwitch ? (
          <div ref={menuRef} className="relative min-w-0">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-haspopup="menu"
              aria-expanded={menu}
              className="-ml-2 flex items-center gap-1.5 rounded-lg px-2 py-1 font-display text-lg font-semibold transition hover:bg-bg"
            >
              {title}
              <span aria-hidden className={`text-xs text-soft transition ${menu ? "rotate-180" : ""}`}>
                ▾
              </span>
            </button>
            {menu && (
              <SectionMenu
                sections={sections}
                current={current}
                onSwitch={(key) => {
                  setMenu(false);
                  onSwitch(key);
                }}
                onReorder={onReorder}
                onToggle={onToggle}
              />
            )}
          </div>
        ) : (
          <h2 className="font-display text-lg font-semibold">{title}</h2>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {move && (
            <>
              <button
                type="button"
                onClick={() => move.onMove(-1)}
                disabled={!move.up}
                aria-label="Posunout sekci výš"
                title="Posunout sekci výš"
                className="flex h-8 w-8 items-center justify-center rounded-full text-soft hover:bg-line/60 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move.onMove(1)}
                disabled={!move.down}
                aria-label="Posunout sekci níž"
                title="Posunout sekci níž"
                className="flex h-8 w-8 items-center justify-center rounded-full text-soft hover:bg-line/60 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
              >
                ↓
              </button>
              <span aria-hidden className="mx-1 h-5 w-px bg-line" />
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít panel"
            className="flex h-8 w-8 items-center justify-center rounded-full text-soft hover:bg-line/60 hover:text-ink"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
    </aside>
  );
}

/** Nápověda nad webem v editoru („Klikni na text a piš…“), schovat jde natrvalo. */
export function BuilderHint({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3 bg-ink px-4 py-2 text-sm text-white">
      <span>{children}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25"
      >
        Rozumím
      </button>
    </div>
  );
}
