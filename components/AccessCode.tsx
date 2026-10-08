"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { accessCodeSendAt, fmtSendAt } from "@/lib/access-code";

// Kód k zámku rezervace — tlačítko se stavem odeslání a okno pro zadání.
// Používá se v Rezervacích i na Přehledu (nejbližší pobyt).

/** Hláška po uložení kódu: kdy ho host dostane. */
export function accessCodeSavedMessage(r: { startDate: string }, code: string): string {
  if (!code) return "Kód k zámku je smazaný.";
  const sendAt = accessCodeSendAt({ startDate: r.startDate, accessCode: code, accessCodeSetAt: new Date().toISOString() });
  return sendAt && sendAt > new Date()
    ? `Kód je uložený — hostovi ho pošleme e-mailem ${fmtSendAt(sendAt)}.`
    : "Kód je uložený — hostovi ho posíláme e-mailem hned.";
}

/** Kreslený klíč (stejný styl čar jako ikony v navigaci). */
export function KeyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 19 4M15.5 7.5l2.5 2.5M18 5l2 2" />
    </svg>
  );
}

/**
 * Kód k zámku / schránce s klíči pro pobyt. Bez kódu tlačítko „Doplnit“, s kódem
 * štítek s kódem. Klik otevře okno s polem pro kód; ukládá se hned (Enter / Uložit).
 */
export function AccessCode({
  code,
  sendAt,
  context,
  onSave,
  compact = false,
}: {
  code: string;
  /** Kdy se kód pošle hostovi (null = bez kódu). */
  sendAt: Date | null;
  context: string;
  onSave: (code: string) => void;
  /** Nenápadná textová varianta (karta nejbližšího pobytu na Přehledu). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sent = !!sendAt && sendAt <= new Date();
  const dialog = open && (
    <AccessCodeDialog
      code={code}
      context={context}
      onClose={() => setOpen(false)}
      onSave={(next) => {
        setOpen(false);
        if (next !== code) onSave(next);
      }}
    />
  );

  if (compact)
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-w-0 items-center gap-2 text-sm text-soft transition hover:text-ink"
        >
          <KeyIcon className="h-4 w-4 shrink-0 text-pine" />
          {code ? (
            <span className="min-w-0 text-left">
              Kód <span className="font-mono font-semibold tracking-wider text-ink">{code}</span>
              {sendAt && (
                <span className={sent ? "text-pine" : ""}>
                  {" "}
                  · {sent ? `odesláno ${fmtSendAt(sendAt)}` : `pošle se ${fmtSendAt(sendAt)}`}
                </span>
              )}
            </span>
          ) : (
            <span className="font-medium text-pine">Doplnit kód k zámku</span>
          )}
        </button>
        {dialog}
      </>
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={code ? "Upravit kód k zámku" : undefined}
        className="btn-ghost inline-flex items-center gap-1.5 !px-4 !py-1.5 text-xs"
      >
        <KeyIcon className="h-3.5 w-3.5" />
        {code ? (
          <>
            Kód k zámku: <span className="font-mono font-semibold tracking-wider text-ink">{code}</span>
          </>
        ) : (
          "Doplnit kód k zámku"
        )}
      </button>
      {/* Stav e-mailu s kódem — podle času odeslání (rozesílání se teprve chystá) */}
      {sendAt && (
        <span
          className={`inline-flex items-center gap-1.5 self-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            sent ? "bg-pine/10 text-pine" : "bg-amber/15 text-[#92600a]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${sent ? "bg-pine" : "bg-amber"}`} aria-hidden />
          {sent ? `Odesláno hostovi ${fmtSendAt(sendAt)}` : `Čeká na odeslání · pošle se ${fmtSendAt(sendAt)}`}
        </span>
      )}
      {dialog}
    </>
  );
}

export function AccessCodeDialog({
  code,
  context,
  onClose,
  onSave,
}: {
  code: string;
  context: string;
  onClose: () => void;
  onSave: (code: string) => void;
}) {
  const [draft, setDraft] = useState(code);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Do <body>: předek s CSS transformací by jinak rozbil `fixed` překryv.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kód k zámku"
        className="rise w-full max-w-sm rounded-t-3xl bg-surface p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pine/10 text-pine">
            <KeyIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">Kód k zámku</h2>
            <p className="truncate text-xs text-soft">{context}</p>
          </div>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Kód k zámku</span>
          <input
            autoFocus
            className="field text-center font-mono text-xl tracking-[0.2em]"
            placeholder="např. 4821#"
            maxLength={40}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSave(draft.trim())}
          />
        </label>
        <p className="mt-2 text-xs text-soft">
          Kód k zámku nebo schránce s klíči pro tenhle pobyt. Hostovi ho pošleme e-mailem den před příjezdem
          v 10:00 (uložený později hned).
        </p>
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-ghost flex-1 !py-2.5" onClick={onClose}>
            Zrušit
          </button>
          <button type="button" className="btn-primary flex-1 !py-2.5" onClick={() => onSave(draft.trim())}>
            Uložit
          </button>
        </div>
        {code && (
          <button
            type="button"
            className="mt-3 w-full text-center text-sm font-medium text-coral hover:underline"
            onClick={() => onSave("")}
          >
            Smazat kód
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

