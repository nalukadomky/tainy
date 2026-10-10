"use client";

import { useEffect, useRef, useState } from "react";

// Výběr s nabídkou vždy pod polem. Nativní <select> na macOS otevírá
// nabídku přes pole se zvolenou položkou na jeho místě, což v liště filtrů působí zmateně.

export type DropdownItem = { value: string; label: string } | { group: string };

export function Dropdown({
  value,
  items,
  onChange,
  label,
  align = "left",
  size = "md",
  actions,
}: {
  value: string;
  items: DropdownItem[];
  onChange: (value: string) => void;
  /** Popisek pro čtečky obrazovky. */
  label: string;
  align?: "left" | "right";
  /** sm = kompaktní varianta do horní lišty. */
  size?: "md" | "sm";
  /** Akce pod seznamem (např. „+ Přidat nemovitost“). */
  actions?: { label: string; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const options = items.filter((i): i is { value: string; label: string } => "value" in i);
  const current = options.find((o) => o.value === value)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    // Dlouhý seznam (měsíce) otevřít na zvolené položce
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`control control-select w-full text-left ${
          size === "sm" ? "!h-8 max-w-44 truncate !pl-3 !text-xs font-semibold sm:max-w-60" : ""
        } ${open ? "border-pine ring-2 ring-pine/15" : ""}`}
      >
        {current}
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={label}
          className={`absolute top-full z-30 mt-1.5 max-h-72 min-w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item) =>
            "group" in item ? (
              <p
                key={`g-${item.group}`}
                className="mt-1 border-t border-line px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-soft"
              >
                {item.group}
              </p>
            ) : (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={item.value === value}
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-4 whitespace-nowrap px-3.5 py-2 text-left text-sm transition hover:bg-bg ${
                  item.value === value ? "font-semibold text-pine" : "text-ink"
                }`}
              >
                {item.label}
                {item.value === value && <span aria-hidden>✓</span>}
              </button>
            )
          )}
          {actions && actions.length > 0 && (
            <div className="mt-1 border-t border-line pt-1">
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    a.onClick();
                  }}
                  className="flex w-full whitespace-nowrap px-3.5 py-2 text-left text-sm font-medium text-pine transition hover:bg-bg"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
