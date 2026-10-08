import type { KeyboardEvent } from "react";

// Enter v jednořádkovém poli formuláře = stejné jako kliknout na uložit.
// Dává se na obal formuláře (onKeyDown). Víceřádkový text a pole, která Enter
// používají po svém a zavolají preventDefault (štítky vybavení, popisky fotek,
// voucher), se nechají být.

const SINGLE_LINE = new Set(["text", "number", "email", "tel", "url", "search", "date", "time", "password"]);

export function submitOnEnter(submit: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.defaultPrevented || e.shiftKey || e.altKey || e.nativeEvent.isComposing) return;
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !SINGLE_LINE.has(t.type)) return;
    e.preventDefault();
    submit();
  };
}
