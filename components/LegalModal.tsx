"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RichText } from "@/components/RichText";
import { LEGAL_PATH, LEGAL_TITLE, type LegalKind } from "@/lib/legal";

// Obchodní podmínky / zásady ochrany osobních údajů v okně nad webem — host
// nepřijde o rozpracovanou rezervaci. Text je součástí stránky, otevře se hned.

export type LegalDocData = { text: string; pdf: string; updatedAt: string | null };

export function LegalModal({
  kind,
  doc,
  slug,
  provider,
  onClose,
}: {
  kind: LegalKind;
  doc: LegalDocData;
  slug?: string;
  provider?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const title = LEGAL_TITLE[kind];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Stránka pod oknem se nemá posouvat
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
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
        aria-label={title}
        className="rise flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:max-h-[85vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold sm:text-2xl">{title}</h2>
            {(provider || doc.updatedAt) && (
              <p className="mt-1 text-xs text-soft">
                {provider}
                {provider && doc.updatedAt && " · "}
                {doc.updatedAt && `Platné od ${new Date(doc.updatedAt).toLocaleDateString("cs-CZ")}`}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-soft outline-none transition hover:bg-bg hover:text-ink focus-visible:ring-2 focus-visible:ring-pine/40"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {doc.pdf ? (
            <div className="space-y-4">
              <a href={doc.pdf} target="_blank" rel="noopener" className="btn-primary inline-flex">
                Otevřít PDF
              </a>
              {/* Telefony PDF v rámečku neumí celé zobrazit — tam stačí tlačítko */}
              <iframe src={doc.pdf} title={title} className="hidden h-[60vh] w-full rounded-xl border border-line sm:block" />
            </div>
          ) : (
            <RichText text={doc.text} />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 sm:px-6">
          {slug ? (
            <a
              href={`/w/${slug}/${LEGAL_PATH[kind]}`}
              target="_blank"
              rel="noopener"
              className="text-xs text-soft underline-offset-2 hover:text-ink hover:underline"
            >
              Otevřít jako stránku ↗
            </a>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} className="btn-ghost !px-5 !py-2 text-sm">
            Zavřít
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
