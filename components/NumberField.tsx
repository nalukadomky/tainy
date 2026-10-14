"use client";

import { useState } from "react";

// Číselné pole pro hodnotu uloženou jako číslo. Obyčejný <input type="number">
// s value={číslo} po smazání hned ukáže 0 a další číslice se připíše za ni („02“).
// Tady se během psaní drží text — pole jde vymazat a 0 na začátku se zahodí.

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (value: number) => void;
  /** Povolit záporná čísla (sleva v %) */
  negative?: boolean;
};

function clean(s: string, negative: boolean) {
  const minus = negative && /^\s*[-−–]/.test(s) ? "-" : "";
  return minus + s.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

export function NumberField({ value, onChange, onBlur, negative = false, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  // Mimo psaní ukazujeme uloženou hodnotu (může ji změnit i něco jiného než pole)
  const shown = draft ?? String(value);

  return (
    <input
      {...rest}
      type="text"
      // Na iPhonu numerická klávesnice nemá minus — u záporných čísel necháme plnou
      inputMode={negative ? "text" : "numeric"}
      pattern={negative ? undefined : "[0-9]*"}
      autoComplete="off"
      value={shown}
      onChange={(e) => {
        const s = clean(e.target.value, negative);
        setDraft(s);
        onChange(s === "" || s === "-" ? 0 : Number(s));
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}
