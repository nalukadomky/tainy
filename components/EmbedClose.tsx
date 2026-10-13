"use client";

// Zavírací křížek stránky rezervace otevřené ve widgetu na cizím webu (public/widget.js).
export function EmbedClose() {
  return (
    <button
      type="button"
      onClick={() => window.parent !== window && window.parent.postMessage({ type: "tainy:close" }, "*")}
      aria-label="Zavřít"
      className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-soft transition hover:bg-bg hover:text-ink"
    >
      ×
    </button>
  );
}
