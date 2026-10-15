"use client";

import { useEffect } from "react";

// Sekce rezervace vložená do stránky majitele (iframe z public/widget.js):
// posílá vkládající stránce svou výšku, ať iframe roste a zmenšuje se s obsahem
// (kroky rezervace, objednávka poukazu) a nemá vlastní posuvník.
export function EmbedHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    let last = 0;
    const send = () => {
      const h = Math.ceil(document.body.getBoundingClientRect().height);
      if (h === last) return;
      last = h;
      window.parent.postMessage({ type: "tainy:height", height: h }, "*");
    };
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    send();
    return () => ro.disconnect();
  }, []);
  return null;
}
