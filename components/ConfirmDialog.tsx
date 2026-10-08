"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Potvrzení nevratné akce (např. odebrání úvodní fotky). Výchozí fokus je na
// „Zrušit", Esc i klik mimo dialog akci zruší — omylem se nic nesmaže.

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Zrušit",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger = červené potvrzení (mazání, rušení), primary = běžné. */
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Do <body>: předek s CSS transformací by jinak rozbil `fixed` překryv.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="rise w-full max-w-sm rounded-t-3xl bg-surface p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {children && <div className="mt-3 space-y-3 text-sm text-soft">{children}</div>}
        <div className="mt-5 flex gap-2">
          <button ref={cancelRef} type="button" className="btn-ghost flex-1 !py-2.5" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn-primary flex-1 !py-2.5 ${tone === "danger" ? "!bg-coral hover:!bg-coral/90" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

/**
 * Náhrada za `window.confirm` v designu aplikace:
 *   const confirm = useConfirm();
 *   if (!(await confirm.ask({ title: "Smazat?", confirmLabel: "Smazat" }))) return;
 *   … {confirm.node}
 */
export function useConfirm() {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);
  const ask = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    []
  );
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const node = state && (
    <ConfirmDialog
      title={state.opts.title}
      confirmLabel={state.opts.confirmLabel}
      cancelLabel={state.opts.cancelLabel}
      tone={state.opts.tone}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    >
      {state.opts.message}
    </ConfirmDialog>
  );
  return { ask, node };
}
