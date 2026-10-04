"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Krátká notifikace dole uprostřed obrazovky, sama zmizí.
// Použití: const toast = useToast(); … toast.show("Doplň výši slevy.") … {toast.node}

type Tone = "error" | "success";

/** Zpráva pro další stránku (sessionStorage) — např. „Změny jsou uložené" po odchodu z builderu. */
export const FLASH_KEY = "tainy.flash";

export function useToast() {
  const [message, setMessage] = useState<{ text: string; tone: Tone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: Tone = "error") => {
    if (timer.current) clearTimeout(timer.current);
    setMessage({ text, tone, id: Date.now() });
    timer.current = setTimeout(() => setMessage(null), 3500);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Zpráva, kterou nechala předchozí stránka
  useEffect(() => {
    try {
      const flash = sessionStorage.getItem(FLASH_KEY);
      if (flash === null) return;
      sessionStorage.removeItem(FLASH_KEY);
      if (flash) show(flash, "success");
    } catch {}
  }, [show]);

  const node = message && (
    <div
      key={message.id}
      role={message.tone === "error" ? "alert" : "status"}
      className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-8"
    >
      <div
        className={`rise flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${
          message.tone === "error" ? "bg-ink text-white" : "bg-pine text-white"
        }`}
      >
        <span aria-hidden>{message.tone === "error" ? "⚠️" : "✓"}</span>
        {message.text}
        <button
          type="button"
          aria-label="Zavřít"
          className="ml-1 opacity-60 hover:opacity-100"
          onClick={() => setMessage(null)}
        >
          ✕
        </button>
      </div>
    </div>
  );

  return { show, node };
}
