"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirm, type ConfirmOptions } from "@/components/ConfirmDialog";
import { STATUS_LABEL, STATUS_STYLE, type Reservation } from "@/lib/admin";

// Štítek stavu rezervace, který jde rovnou přepnout: klik otevře nabídku stavů.

type Status = Reservation["status"];

const OPTIONS: { status: Status; label: string }[] = [
  { status: "paid", label: "✓ Zaplaceno" },
  { status: "pending", label: "Čeká na platbu" },
  { status: "cancelled", label: "✕ Zrušit (storno)" },
];

export function StatusMenu({
  status,
  guestName,
  onChange,
}: {
  status: Status;
  guestName: string;
  onChange: (status: Status) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const confirmDlg = useConfirm();

  async function pick(next: Status) {
    setOpen(false);
    if (next === status) return;
    if (next === "cancelled" && !(await confirmDlg.ask(cancelReservationConfirm(guestName)))) return;
    // Nový stav se ukáže hned (rodič ho mění optimisticky), ukládá se na pozadí.
    setError("");
    onChange(next).catch((e) => setError(e instanceof Error ? e.message : "Změna selhala."));
  }

  return (
    <div ref={ref} className="relative inline-block text-left">
      {confirmDlg.node}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition hover:ring-2 hover:ring-line disabled:opacity-50 ${STATUS_STYLE[status]}`}
      >
        {STATUS_LABEL[status]}
        <span aria-hidden className="text-[9px] opacity-70">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.status}
              role="menuitem"
              type="button"
              onClick={() => pick(o.status)}
              className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-sm transition hover:bg-bg ${
                o.status === "cancelled" ? "text-coral" : "text-ink"
              }`}
            >
              {o.label}
              {o.status === status && <span className="text-xs text-soft">aktuální</span>}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-[11px] font-medium text-coral">{error}</p>}
    </div>
  );
}

/** Potvrzení zrušení rezervace — stejné v Přehledu, Kalendáři i Rezervacích. */
export function cancelReservationConfirm(guestName: string): ConfirmOptions {
  return {
    title: `Zrušit rezervaci hosta ${guestName}?`,
    message: "Termín se uvolní pro další hosty. Úklid po pobytu, který ještě nebyl zaplacený, se zruší taky.",
    confirmLabel: "Zrušit rezervaci",
    cancelLabel: "Ponechat",
  };
}
