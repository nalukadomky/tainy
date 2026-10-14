"use client";

import { useEffect, useState } from "react";

// Střídající se řádek nadpisu („Tvoje chata." → „Tvůj tiny." …). Všechny varianty
// leží ve stejné buňce mřížky, takže řádek drží šířku té nejdelší a stránka
// při střídání neposkakuje. Čtečky obrazovky dostanou celý výčet najednou.

export function RotatingWord({ words, interval = 2400 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => window.clearInterval(t);
  }, [words.length, interval]);

  return (
    <>
      <span className="sr-only">{words.join(" ")}</span>
      <span aria-hidden className="inline-grid align-bottom">
        {words.map((w, n) => (
          <span
            key={w}
            className="[grid-area:1/1] transition-all ease-[cubic-bezier(0.2,0.7,0.2,1)]"
            style={{
              // Staré slovo rychle zmizí, nové naběhne až po něm — nikdy nejsou vidět obě naráz
              transitionDuration: n === i ? "450ms" : "200ms",
              transitionDelay: n === i ? "180ms" : "0ms",
              opacity: n === i ? 1 : 0,
              transform: n === i ? "translateY(0)" : n === (i - 1 + words.length) % words.length ? "translateY(-0.35em)" : "translateY(0.35em)",
              filter: n === i ? "blur(0)" : "blur(4px)",
            }}
          >
            {w}
          </span>
        ))}
      </span>
    </>
  );
}
