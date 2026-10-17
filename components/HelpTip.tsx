"use client";

import { useEffect, useId, useRef, useState } from "react";

// Nápověda „?“ vedle nadpisu: vysvětlující text, který dřív visel pod nadpisem.
// Na počítači se ukáže po najetí myší, všude po kliknutí; zavře se klikem vedle nebo Escape.

export function HelpTip({ children, label = "Nápověda", align = "left" }: { children: React.ReactNode; label?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative ml-2 inline-flex shrink-0 align-middle"
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && !pinned && setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => {
          const close = open && pinned;
          setOpen(!close);
          setPinned(!close);
        }}
        className={`flex h-5 w-5 items-center justify-center rounded-full border font-sans text-[11px] font-semibold leading-none tracking-normal transition ${
          open ? "border-pine bg-pine text-white" : "border-line bg-surface text-soft hover:border-pine/50 hover:text-pine"
        }`}
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-3.5 font-sans text-sm font-normal leading-relaxed tracking-normal text-soft shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
