"use client";

import { useCallback, useEffect, useState } from "react";
import { BookingWidget } from "@/components/BookingWidget";
import type { BookedRange } from "@/components/DayPicker";
import { LegalModal } from "@/components/LegalModal";
import { bookingSiteOf, type SiteViewData } from "@/components/SiteView";
import { Wordmark } from "@/components/Logo";
import { providerLine, type LegalKind } from "@/lib/legal";
import { themeVars } from "@/lib/theme";

// Rezervace v okně nad cizím webem (iframe z public/widget.js): jen formulář
// v barvách webu, zavírací křížek a provozovatel. Vkládající stránce posílá
// zprávy přes postMessage (zavřít, rezervace dokončena).

const toParent = (msg: Record<string, unknown>) => window.parent !== window && window.parent.postMessage(msg, "*");

export function EmbedView({ site, booked }: { site: SiteViewData; booked: BookedRange[] }) {
  const [openKind, setOpenKind] = useState<LegalKind | null>(null);
  const openDoc = useCallback((kind: LegalKind) => setOpenKind(kind), []);
  const close = useCallback(() => toParent({ type: "tainy:close" }), []);

  // Barva webu i pro okna v portálech (podmínky, výběr hostů)
  useEffect(() => {
    const root = document.documentElement;
    const vars = themeVars(site.themeColor, site.surfaceTone);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  }, [site.themeColor, site.surfaceTone]);

  // Escape zavře okno (pokud zrovna nejsou otevřené podmínky — ty se zavřou samy)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !openKind && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openKind, close]);

  const provider = site.provider?.name
    ? providerLine({
        businessName: site.provider.name,
        businessId: site.provider.id,
        vatId: site.provider.vatId,
        businessAddress: site.provider.address,
      })
    : undefined;
  const doc = openKind ? site.docs?.[openKind] : undefined;

  return (
    <div className="min-h-dvh bg-cream" style={themeVars(site.themeColor, site.surfaceTone) as React.CSSProperties}>
      {openKind && doc && (
        <LegalModal kind={openKind} doc={doc} slug={site.slug} provider={provider} onClose={() => setOpenKind(null)} />
      )}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/70 bg-cream/90 px-5 py-3.5 backdrop-blur">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-soft">Rezervace</p>
          <h1 className="truncate font-display text-xl font-semibold leading-tight">{site.name}</h1>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Zavřít"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-soft transition hover:bg-bg hover:text-ink"
        >
          ×
        </button>
      </header>
      <main className="mx-auto max-w-xl px-5 pb-10 pt-5">
        <BookingWidget site={bookingSiteOf(site)} initialBooked={booked} onOpenDoc={site.docs ? openDoc : undefined} embed />
        <footer className="mt-8 space-y-1 text-center text-xs text-soft">
          {site.provider?.name && (
            <p>
              Provozovatel: {[site.provider.name, site.provider.id && `IČ ${site.provider.id}`].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="inline-flex items-center gap-1.5">
            Rezervace přes{" "}
            <a href="https://tainy.cz" target="_blank" rel="noopener" className="inline-flex items-center hover:opacity-80">
              <Wordmark className="text-sm text-ink" />
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
