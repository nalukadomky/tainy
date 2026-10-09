"use client";

import { useEffect } from "react";

// Panel sekce v editorech přímo ve webu (builder, onboarding): na počítači
// vpravo vedle webu, na mobilu jako spodní okno. Esc i ✕ ho zavřou.

export function BuilderPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      aria-label={title}
      className="preview-in absolute inset-x-0 bottom-0 z-20 flex max-h-[75%] flex-col rounded-t-3xl border-t border-line bg-surface shadow-2xl lg:static lg:max-h-none lg:w-[400px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zavřít panel"
          className="flex h-8 w-8 items-center justify-center rounded-full text-soft hover:bg-line/60 hover:text-ink"
        >
          ✕
        </button>
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
