"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirm, type ConfirmOptions } from "@/components/ConfirmDialog";
import { STATUS_LABEL, STATUS_STYLE, type Reservation } from "@/lib/admin";

// Štítek stavu (rezervace, dárkového poukazu), který jde rovnou přepnout: klik otevře nabídku stavů.

type Status = Reservation["status"];

// V nabídce jen to, co jde s rezervací udělat — ne výčet stavů včetně toho aktuálního
const ACTIONS: Record<Status, { status: Status; label: string }[]> = {
  paid: [
    { status: "pending", label: "Označit jako nezaplacené" },
    { status: "cancelled", label: "✕ Zrušit rezervaci (storno)" },
  ],
  pending: [
    { status: "paid", label: "✓ Označit jako zaplacené" },
    { status: "cancelled", label: "✕ Zrušit rezervaci (storno)" },
  ],
  cancelled: [
    { status: "pending", label: "↺ Obnovit (čeká na platbu)" },
    { status: "paid", label: "↺ Obnovit jako zaplacenou" },
  ],
};

export function StatusMenu({
  status,
  guestName,
  onChange,
}: {
  status: Status;
  guestName: string;
  onChange: (status: Status) => Promise<void>;
}) {
  const confirmDlg = useConfirm();
  return (
    <>
      {confirmDlg.node}
      <BadgeMenu
        label={STATUS_LABEL[status]}
        className={STATUS_STYLE[status]}
        current={status}
        options={ACTIONS[status].map((o) => ({ key: o.status, label: o.label, danger: o.status === "cancelled" }))}
        onPick={async (next) => {
          if (next === "cancelled" && !(await confirmDlg.ask(cancelReservationConfirm(guestName)))) return;
          await onChange(next as Status);
        }}
      />
    </>
  );
}

/**
 * Štítek stavu s nabídkou změny (rezervace, dárkové poukazy). Nový stav ukazuje rodič
 * hned (optimisticky), ukládá se na pozadí; chyba se ukáže pod štítkem.
 */
export function BadgeMenu({
  label,
  className,
  current,
  options,
  onPick,
}: {
  label: string;
  className: string;
  current: string;
  options: { key: string; label: string; danger?: boolean }[];
  onPick: (key: string) => Promise<void>;
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

  function pick(next: string) {
    setOpen(false);
    if (next === current) return;
    setError("");
    onPick(next).catch((e) => setError(e instanceof Error ? e.message : "Změna selhala."));
  }

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition hover:ring-2 hover:ring-line disabled:opacity-50 ${className}`}
      >
        {label}
        <span aria-hidden className="text-[9px] opacity-70">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1.5 w-max min-w-48 overflow-hidden whitespace-nowrap rounded-xl border border-line bg-surface py-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.key}
              role="menuitem"
              type="button"
              onClick={() => pick(o.key)}
              className={`flex w-full items-center justify-between gap-4 px-3.5 py-2 text-left text-sm transition hover:bg-bg ${o.danger ? "text-coral" : "text-ink"}`}
            >
              {o.label}
              {o.key === current && <span className="text-xs text-soft">aktuální</span>}
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
