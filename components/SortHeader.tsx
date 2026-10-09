"use client";

// Hlavička sloupce tabulky, která řadí: první klik nastaví výchozí směr,
// další obrací. `active` = podle tohoto sloupce se právě řadí.
export function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
  className = "",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition hover:text-ink ${
        active ? "text-ink" : "text-soft"
      } ${align === "right" ? "justify-end" : ""} ${className}`}
    >
      {label}
      <span aria-hidden className={`text-[10px] ${active ? "opacity-100" : "opacity-0"}`}>
        {dir === "asc" ? "▲" : "▼"}
      </span>
    </button>
  );
}
