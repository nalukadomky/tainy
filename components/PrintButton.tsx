"use client";

/** Tlačítko „Vytisknout“ (stránka poukazu). */
export function PrintButton({ label = "Vytisknout" }: { label?: string }) {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      {label}
    </button>
  );
}
