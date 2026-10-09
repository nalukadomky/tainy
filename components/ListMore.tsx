"use client";

import { useEffect, useState } from "react";

// Dlouhé seznamy (rezervace, hosté) se nevykreslují celé — nejdřív PAGE položek
// a tlačítko „Zobrazit další“. Při změně filtru / řazení začíná seznam znovu.

export const PAGE = 20;

/** Kolik položek ukázat; `resetKey` = cokoli, při jehož změně se vrátí na první stránku. */
export function usePaged(resetKey: string) {
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [resetKey]);
  return { limit, more: () => setLimit((l) => l + PAGE), showAt: (index: number) => setLimit((l) => Math.max(l, index + 1)) };
}

export function ListMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  const next = Math.min(PAGE, total - shown);
  return (
    <div className="flex flex-col items-center gap-1.5 pt-1">
      <button type="button" onClick={onMore} className="btn-ghost !px-6 !py-2.5 text-sm">
        Zobrazit {next === total - shown ? (next === 1 ? "poslední" : `posledních ${next}`) : `dalších ${next}`}
      </button>
      <span className="text-xs text-soft">
        Zobrazeno {shown} z {total}
      </span>
    </div>
  );
}
