"use client";

import { useEffect } from "react";

// Zavírací křížek stránky otevřené ve widgetu na cizím webu (rezervace /r/…, objednávka poukazu /darek/…).
// Dá widgetu vědět, že okno už neukazuje rezervaci — příště ji načte znovu.
export function EmbedClose() {
  useEffect(() => {
    if (window.parent !== window) window.parent.postMessage({ type: "tainy:away" }, "*");
  }, []);
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
