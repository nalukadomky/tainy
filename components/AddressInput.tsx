"use client";

import { useEffect, useRef, useState } from "react";

// Pole adresy s našeptávačem (adresy v Česku přes /api/address). Psát jde
// i volně — nabídka jen pomáhá; šipky + Enter vyberou, Esc zavře.

export function AddressInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [results, setResults] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Hledat jen po psaní, ne po výběru z nabídky nebo při načtení uložené adresy
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/address?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (ctrl.signal.aborted) return;
      setResults(Array.isArray(data?.results) ? data.results : []);
      setActive(-1);
      setLoading(false);
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(address: string) {
    typed.current = false;
    onChange(address);
    setOpen(false);
    setResults([]);
  }

  const showList = open && value.trim().length >= 3 && (results.length > 0 || loading);

  return (
    <div ref={boxRef} className="relative">
      <input
        className="field"
        placeholder={placeholder}
        maxLength={300}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          typed.current = true;
          setOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {showList && (
        <ul
          role="listbox"
          aria-label="Návrhy adres"
          className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-lg"
        >
          {results.map((r, i) => (
            <li key={r}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-bg ${
                  i === active ? "bg-bg" : ""
                }`}
              >
                <span aria-hidden className="text-soft">
                  ⌖
                </span>
                {r}
              </button>
            </li>
          ))}
          {loading && results.length === 0 && <li className="px-3 py-2.5 text-sm text-soft">Hledám adresy…</li>}
        </ul>
      )}
    </div>
  );
}
