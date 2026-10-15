"use client";

import { useCallback, useEffect, useState } from "react";
import { BookingWidget } from "@/components/BookingWidget";
import type { BookedRange } from "@/components/DayPicker";
import { LegalModal } from "@/components/LegalModal";
import { bookingSiteOf, type SiteViewData } from "@/components/SiteView";
import { Wordmark } from "@/components/Logo";
import { GiftShop, type ShopOffer } from "@/components/GiftShop";
import { Icon } from "@/components/Icon";
import { EmbedHeight } from "@/components/EmbedHeight";
import { providerLine, type LegalKind } from "@/lib/legal";
import { themeVars } from "@/lib/theme";
import { sectionTitle } from "@/lib/sections";

// Rezervace v okně nad cizím webem (iframe z public/widget.js): jen formulář
// v barvách webu, zavírací křížek a provozovatel. Když majitel prodává dárkové
// poukazy, je nahoře přepínač Rezervace | Dárkový poukaz (web ho přepne zprávou
// tainy:tab, např. vlastním tlačítkem „Koupit poukaz“). Vkládající stránce posílá
// zprávy přes postMessage (zavřít, rezervace dokončena).

const toParent = (msg: Record<string, unknown>) => window.parent !== window && window.parent.postMessage(msg, "*");

export type EmbedTab = "rezervace" | "poukaz";

export function EmbedView({
  site,
  booked,
  offers = [],
  initialTab = "rezervace",
  inline = false,
}: {
  site: SiteViewData;
  booked: BookedRange[];
  offers?: ShopOffer[];
  initialTab?: EmbedTab;
  /** Sekce přímo ve stránce majitele: bez hlavičky s křížkem, výška podle obsahu. */
  inline?: boolean;
}) {
  const [openKind, setOpenKind] = useState<LegalKind | null>(null);
  const gifts = offers.length > 0;
  const [tab, setTab] = useState<EmbedTab>(gifts ? initialTab : "rezervace");
  // Vkládající web přepne záložku (Tainy.open("poukaz"), data-tainy-open="poukaz")
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.type !== "tainy:tab") return;
      if (e.data.tab === "poukaz" && gifts) setTab("poukaz");
      if (e.data.tab === "rezervace") setTab("rezervace");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [gifts]);
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

  const tabs = gifts && (
    <div className="flex rounded-full border border-line bg-bg p-1 text-sm font-medium" role="tablist" aria-label="Rezervace nebo dárkový poukaz">
      {(
        [
          ["rezervace", "Rezervace", "Rezervace", "calendar"],
          ["poukaz", "Dárkový poukaz", "Poukaz", "ticket"],
        ] as const
      ).map(([k, label, short, icon]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={tab === k}
          onClick={() => setTab(k)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition sm:px-3.5 ${tab === k ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"}`}
        >
          <Icon name={icon} size={15} />
          <span className="max-sm:hidden">{label}</span>
          <span className="sm:hidden">{short}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={inline ? "bg-bg pb-2" : "min-h-dvh bg-bg"} style={themeVars(site.themeColor, site.surfaceTone) as React.CSSProperties}>
      {inline && <EmbedHeight />}
      {openKind && doc && (
        <LegalModal kind={openKind} doc={doc} slug={site.slug} provider={provider} onClose={() => setOpenKind(null)} />
      )}
      {inline ? (
        // Ve stránce majitele: jen přepínač (když prodává poukazy), název ubytování má web sám
        tabs && <div className="flex justify-center px-5 pt-6">{tabs}</div>
      ) : (
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/70 bg-cream/90 px-5 py-3.5 backdrop-blur">
          <p className="min-w-0 truncate font-display text-xl font-semibold leading-tight">{site.name}</p>
          <div className="flex shrink-0 items-center gap-2">
            {tabs}
            <button
              type="button"
              onClick={close}
              aria-label="Zavřít"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-soft transition hover:bg-bg hover:text-ink"
            >
              ×
            </button>
          </div>
        </header>
      )}
      {/* Obě záložky zůstávají připojené — přepnutí neztratí rozepsanou rezervaci ani objednávku */}
      {gifts && (
        <div hidden={tab !== "poukaz"}>
          <GiftShop
            siteName={site.name}
            base=""
            offers={offers}
            hasTerms={!!site.docs?.terms}
            hasPrivacy={!!site.docs?.privacy}
            embed
            onOpenDoc={site.docs ? openDoc : undefined}
          />
          <EmbedFooter site={site} />
        </div>
      )}
      {/* Stejně jako sekce Rezervace na webu v tainy: nadpis, kalendář a na šířku karta s cenou */}
      <main hidden={tab !== "rezervace"} className="mx-auto max-w-[760px] px-5 pt-8 sm:pt-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-center">{sectionTitle(site.sectionTitles, "rezervace")}</h1>
        <p className="mb-6 mt-2 text-soft sm:text-center">Vyber termín a počet hostů. Uvidíš rovnou konečnou cenu včetně poplatků.</p>
        <BookingWidget site={bookingSiteOf(site)} initialBooked={booked} onOpenDoc={site.docs ? openDoc : undefined} embed />
        <EmbedFooter site={site} />
      </main>
    </div>
  );
}

function EmbedFooter({ site }: { site: SiteViewData }) {
  return (
    <footer className="mt-8 space-y-1 pb-8 text-center text-xs text-soft">
      {site.provider?.name && (
        <p>Provozovatel: {[site.provider.name, site.provider.id && `IČ ${site.provider.id}`].filter(Boolean).join(" · ")}</p>
      )}
      <p className="inline-flex items-center gap-1.5">
        Rezervace přes{" "}
        <a href="https://tainy.cz" target="_blank" rel="noopener" className="inline-flex items-center hover:opacity-80">
          <Wordmark className="text-sm text-ink" />
        </a>
      </p>
    </footer>
  );
}
