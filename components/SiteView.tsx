"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { czk, type PriceRuleInput, type PricingMode } from "@/lib/pricing";
import { BookingWidget } from "@/components/BookingWidget";
import type { BookedRange } from "@/components/DayPicker";
import { Gallery } from "@/components/Gallery";
import { parsePhotos } from "@/lib/photos";
import { defaultCategories, type GuestCategory } from "@/lib/guests";
import { Wordmark } from "@/components/Logo";
import { EditableText, EditSection, EditStyles, type SiteEditing } from "@/components/EditableText";
import { LEGAL_PATH, LEGAL_TITLE, providerLine, type LegalKind } from "@/lib/legal";
import { bedLabels, bedroomsLabel, type Sleeping } from "@/lib/sleeping";
import { LegalModal, type LegalDocData } from "@/components/LegalModal";
import { AmenityList, LocationPlaceholder, LocationSection, StickyBookBar } from "@/components/SiteSections";
import type { PublicLocation } from "@/lib/location";
import { themeVars } from "@/lib/theme";

// Vizuál veřejného webu nemovitosti. Používá se jednak na /w/[slug] (data z DB),
// jednak jako živý náhled v průvodci (data z draftu, preview=true).

export type SiteViewData = {
  slug?: string;
  name: string;
  tagline: string;
  description: string;
  propertyType: string;
  pricePerNight: number;
  pricingMode: PricingMode;
  weekend: import("@/lib/pricing").Adjust;
  maxGuests: number;
  amenities: string;
  contactEmail: string;
  contactPhone: string;
  priceRules: PriceRuleInput[];
  photos?: string;
  /** Úvod webu: "photo" = nadpis přes úvodní fotku, jinak jen text. */
  heroStyle?: "text" | "photo";
  heroPhoto?: string;
  guestMode?: string;
  categories?: GuestCategory[];
  // Pravidla pobytu a poplatky — v náhledu průvodce nemusí být vyplněné.
  minNights?: number;
  leadTimeDays?: number;
  checkInTime?: string;
  checkOutTime?: string;
  cleaningFee?: number;
  touristTax?: number;
  paymentMode?: string;
  cancellationPolicy?: string;
  /** Sazba DPH (0 = neplátce). */
  vatRate?: number;
  /** Ložnice a lůžka (počty). */
  sleeping?: Sleeping;
  /** Primární barva webu (klíč z lib/theme.ts). */
  themeColor?: string;
  /** Poloha na mapě podle volby majitele (přibližně / přesně); null = nezobrazovat. */
  location?: PublicLocation | null;
  /** Identifikace provozovatele do patičky. */
  provider?: { name: string; id: string; vatId: string; address: string };
  /** Má web obchodní podmínky / zásady (stránky /w/[slug]/podminky, /ochrana-udaju)? */
  hasTerms?: boolean;
  hasPrivacy?: boolean;
  /** Obsah podmínek a zásad pro okno nad webem. */
  docs?: Partial<Record<LegalKind, LegalDocData>>;
};

// Odsazení od okrajů okna pro hlavičku a úvod s fotkou přes celou šířku
const EDGE = "px-5 sm:px-8 lg:px-12 xl:px-16";

// Nálada místo fotek — dokud si majitel v průvodci žádné nenahrál
const PLACEHOLDERS = ["🌲", "🛁", "🔥", "🌄", "☕️", "🌙"];

export function SiteView({
  site,
  preview = false,
  booked = [],
  editing,
}: {
  site: SiteViewData;
  preview?: boolean;
  /** Obsazenost ze serveru, aby byl kalendář vyplněný v prvním renderu. */
  booked?: BookedRange[];
  /** Režim úprav přímo ve webu (builder) — texty jdou přepsat, sekce mají „Upravit". */
  editing?: SiteEditing;
}) {
  const perPerson = site.pricingMode === "person";
  const priceSuffix = perPerson ? "/ os. / noc" : "/ noc";
  const photos = parsePhotos(site.photos ?? "", site.name);
  const amenities = site.amenities
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  const edge = site.heroStyle === "photo" && !!site.heroPhoto;
  const beds = site.sleeping ? bedLabels(site.sleeping) : [];

  // Obchodní podmínky / zásady v okně nad webem (odkaz vede i na samostatnou stránku)
  const [openKind, setOpenKind] = useState<LegalKind | null>(null);
  const openDoc = useCallback((kind: LegalKind) => setOpenKind(kind), []);
  const closeDoc = useCallback(() => setOpenKind(null), []);
  function openDocFrom(e: React.MouseEvent, kind: LegalKind) {
    if (!site.docs?.[kind] || e.metaKey || e.ctrlKey) return; // Cmd+klik = nová karta
    e.preventDefault();
    openDoc(kind);
  }
  const openedDoc = openKind ? site.docs?.[openKind] : undefined;

  // Barva webu i pro okna mimo strom webu (galerie, vybavení, podmínky — portály do <body>)
  const theme = site.themeColor;
  useEffect(() => {
    const root = document.documentElement;
    const vars = themeVars(theme);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [theme]);

  return (
    <div className="min-h-dvh bg-cream" style={themeVars(theme) as React.CSSProperties}>
      {editing && <EditStyles />}
      {openKind && openedDoc && (
        <LegalModal
          kind={openKind}
          doc={openedDoc}
          slug={site.slug}
          provider={
            site.provider?.name
              ? providerLine({
                  businessName: site.provider.name,
                  businessId: site.provider.id,
                  vatId: site.provider.vatId,
                  businessAddress: site.provider.address,
                })
              : undefined
          }
          onClose={closeDoc}
        />
      )}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/85 backdrop-blur">
        {/* S úvodní fotkou přes celou šířku jde hlavička od okraje k okraji, ať lícuje s fotkou */}
        <div className={`mx-auto flex items-center justify-between py-3.5 ${edge ? EDGE : "max-w-4xl px-5 lg:max-w-6xl lg:px-8 2xl:max-w-7xl"}`}>
          <span className="font-display text-xl font-semibold tracking-tight">
            {site.name || "Tvůj web"}
          </span>
          <a href="#rezervace" className="btn-primary !px-5 !py-2 text-sm max-sm:!hidden">
            Rezervovat
          </a>
        </div>
      </header>

      <EditSection editing={editing} section="uvod">
      {site.heroStyle === "photo" && site.heroPhoto ? (
        <section id="uvod" className="relative isolate flex min-h-[calc(100svh-4rem)] items-end overflow-hidden bg-ink">
          {/* Fotka vyplní celou výšku okna pod hlavičkou; galerie začíná až po posunu */}
          <Image
            src={site.heroPhoto}
            alt=""
            fill
            priority
            sizes="100vw"
            className="-z-10 object-cover"
          />
          {/* Přechod zdola, aby byl bílý text čitelný na jakékoli fotce */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/80 via-ink/25 to-ink/5"
          />
          {/* Text v dolní třetině, ne nalepený na spodní hranu (víc místa nad lištou na mobilu) */}
          <div className={`w-full pt-24 text-white ${EDGE}`} style={{ paddingBottom: "clamp(8.5rem, 18vh, 12rem)" }}>
            <p className="rise text-xs font-semibold uppercase tracking-widest text-white/80">
              {site.propertyType} · až {site.maxGuests} hostů
              {site.sleeping?.bedrooms ? ` · ${bedroomsLabel(site.sleeping.bedrooms)}` : ""}
            </p>
            <EditableText
              as="h1"
              editing={editing}
              field="name"
              value={site.name}
              placeholder="Tvůj web"
              className="rise rise-1 mt-3 max-w-4xl font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl xl:text-8xl"
            />
            {(site.tagline || editing) && (
              <EditableText
                as="p"
                editing={editing}
                field="tagline"
                value={site.tagline}
                placeholder="Napiš krátký slogan…"
                className="rise rise-2 mt-4 max-w-xl font-display text-xl italic text-white/90 sm:text-2xl"
              />
            )}
            {/* Na mobilu je cena a tlačítko ve spodní liště (StickyBookBar) */}
            <div className="rise rise-3 mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 max-sm:hidden">
              <a href="#rezervace" className="btn-primary !px-6">
                Rezervovat termín
              </a>
              <span className="text-[15px] text-white/85">
                od <strong className="font-semibold text-white">{czk(site.pricePerNight)}</strong> {priceSuffix}
              </span>
            </div>
          </div>
        </section>
      ) : (
        <section id="uvod" className="paper relative overflow-hidden border-b border-line">
          <div className="mx-auto max-w-4xl lg:max-w-6xl 2xl:max-w-7xl px-5 lg:px-8 pb-12 pt-12 sm:pt-16">
            <p className="rise text-xs font-semibold uppercase tracking-widest text-soft">
              {site.propertyType} · až {site.maxGuests} hostů
              {site.sleeping?.bedrooms ? ` · ${bedroomsLabel(site.sleeping.bedrooms)}` : ""}
            </p>
            <EditableText
              as="h1"
              editing={editing}
              field="name"
              value={site.name}
              placeholder="Tvůj web"
              className="rise rise-1 mt-3 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"
            />
            {(site.tagline || editing) && (
              <EditableText
                as="p"
                editing={editing}
                field="tagline"
                value={site.tagline}
                placeholder="Napiš krátký slogan…"
                className="rise rise-2 mt-3 max-w-xl font-display text-xl italic text-soft"
              />
            )}
            <div className="rise rise-3 mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 max-sm:hidden">
              <a href="#rezervace" className="btn-primary !px-6">
                Rezervovat termín
              </a>
              <span className="text-lg font-semibold">
                od {czk(site.pricePerNight)} <span className="font-normal text-soft">{priceSuffix}</span>
              </span>
            </div>
          </div>
        </section>
      )}
      </EditSection>

      <EditSection editing={editing} section="galerie">
      <section id="galerie" className="mx-auto max-w-4xl scroll-mt-20 lg:max-w-6xl 2xl:max-w-7xl px-5 lg:px-8 pt-10">
        <h2 className="mb-4 font-display text-2xl font-semibold">Galerie</h2>
        {photos.length > 0 ? (
          <Gallery photos={photos} siteName={site.name} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {PLACEHOLDERS.map((g, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-center rounded-2xl border border-line text-4xl sm:text-5xl ${
                    i === 0 ? "col-span-2 row-span-2 aspect-square sm:aspect-[4/3]" : "aspect-square"
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${i % 2 ? "#eef2ea" : "#f3ece0"}, ${
                      i % 3 ? "#e6ecdf" : "#efe6d6"
                    })`,
                  }}
                  aria-hidden
                >
                  {g}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-soft">Sem přijdou tvoje fotky — zatím tu je jen nálada.</p>
          </>
        )}
      </section>
      </EditSection>

      <section className="mx-auto grid max-w-4xl lg:max-w-6xl 2xl:max-w-7xl gap-10 px-5 lg:px-8 py-10 sm:grid-cols-[1.4fr_1fr]">
        <EditSection editing={editing} section="o-miste">
        <div id="o-miste" className="scroll-mt-20">
          <h2 className="font-display text-2xl font-semibold">O místě</h2>
          <EditableText
            as="p"
            editing={editing}
            field="description"
            value={site.description}
            placeholder="Popis místa zatím čeká na svá slova."
            multiline
            className="mt-3 whitespace-pre-line leading-relaxed text-soft"
          />
          {((site.checkInTime && site.checkOutTime) || beds.length > 0) && (
            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              {site.checkInTime && site.checkOutTime && (
                <>
                  <span className="rounded-full border border-line bg-surface px-3.5 py-1.5">
                    Check-in <strong className="font-semibold">od {site.checkInTime}</strong>
                  </span>
                  <span className="rounded-full border border-line bg-surface px-3.5 py-1.5">
                    Check-out <strong className="font-semibold">do {site.checkOutTime}</strong>
                  </span>
                </>
              )}
              {beds.map((b) => (
                <span key={b} className="rounded-full border border-line bg-surface px-3.5 py-1.5">
                  🛏 {b}
                </span>
              ))}
            </div>
          )}
          {(site.contactEmail || site.contactPhone || editing) && (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-display text-lg font-semibold">Kontakt</h3>
              <div className="mt-2 space-y-1 text-[15px] text-soft">
                {editing ? (
                  <>
                    <p>
                      ✉️{" "}
                      <EditableText editing={editing} field="contactEmail" value={site.contactEmail} placeholder="tvuj@email.cz" />
                    </p>
                    <p>
                      📞{" "}
                      <EditableText editing={editing} field="contactPhone" value={site.contactPhone} placeholder="+420 777 123 456" />
                    </p>
                  </>
                ) : (
                  <>
                    {site.contactEmail && (
                      <p>
                        ✉️{" "}
                        <a
                          className="underline decoration-line underline-offset-4 hover:text-ink"
                          href={`mailto:${site.contactEmail}`}
                        >
                          {site.contactEmail}
                        </a>
                      </p>
                    )}
                    {site.contactPhone && <p>📞 {site.contactPhone}</p>}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        </EditSection>
        <EditSection editing={editing} section="vybaveni">
        <div id="vybaveni" className="scroll-mt-20">
          <h2 className="font-display text-2xl font-semibold">Vybavení</h2>
          <AmenityList amenities={amenities} />
        </div>
        </EditSection>
      </section>

      <EditSection editing={editing} section="rezervace">
      <section id="rezervace" className="scroll-mt-16 border-t border-line bg-bg">
        <div className="mx-auto max-w-4xl lg:max-w-6xl 2xl:max-w-7xl px-5 lg:px-8 py-10 sm:py-14">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Rezervace</h2>
          <p className="mt-2 text-soft">
            Vyber termín a počet hostů. Uvidíš rovnou konečnou cenu včetně poplatků.
          </p>
          <div className="mt-6">
            <BookingWidget
              preview={preview}
              initialBooked={booked}
              onOpenDoc={site.docs ? openDoc : undefined}
              site={{
                slug: site.slug ?? "",
                name: site.name,
                pricePerNight: site.pricePerNight,
                pricingMode: site.pricingMode,
                weekend: site.weekend,
                priceRules: site.priceRules,
                maxGuests: site.maxGuests,
                minNights: site.minNights ?? 1,
                leadTimeDays: site.leadTimeDays ?? 0,
                checkInTime: site.checkInTime ?? "15:00",
                checkOutTime: site.checkOutTime ?? "10:00",
                cleaningFee: site.cleaningFee ?? 0,
                touristTax: site.touristTax ?? 0,
                paymentMode: site.paymentMode ?? "qr",
                cancellationPolicy: site.cancellationPolicy ?? "",
                hasTerms: !!site.hasTerms,
                vatRate: site.vatRate ?? 0,
                hasPrivacy: !!site.hasPrivacy,
                guestMode: site.guestMode ?? "total",
                categories: site.categories ?? defaultCategories(site.pricingMode),
              }}
            />
          </div>
        </div>
      </section>
      </EditSection>

      {/* Poloha až pod rezervací — host se nejdřív rozhoduje o termínu */}
      {(site.location || editing) && (
        <EditSection editing={editing} section="poloha">
          {site.location ? <LocationSection location={site.location} theme={site.themeColor} /> : <LocationPlaceholder />}
        </EditSection>
      )}

      <footer className="border-t border-line bg-bg">
        <div className="mx-auto grid max-w-4xl gap-8 px-5 py-10 sm:grid-cols-[1.4fr_1fr] lg:max-w-6xl lg:px-8 2xl:max-w-7xl">
          <div>
            <p className="font-display text-xl font-semibold tracking-tight">{site.name || "Tvůj web"}</p>
            <p className="mt-1 text-sm text-soft">
              {site.propertyType} · až {site.maxGuests} {site.maxGuests === 1 ? "host" : site.maxGuests < 5 ? "hosté" : "hostů"}
            </p>
            {(site.contactEmail || site.contactPhone) && (
              <ul className="mt-5 space-y-1">
                {site.contactPhone && (
                  <li>
                    <a href={`tel:${site.contactPhone.replace(/\s/g, "")}`} className="footer-link">
                      <FooterIcon d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                      {site.contactPhone}
                    </a>
                  </li>
                )}
                {site.contactEmail && (
                  <li>
                    <a href={`mailto:${site.contactEmail}`} className="footer-link">
                      <FooterIcon d="M3 6h18v12H3zM3 7l9 6 9-6" />
                      <span className="min-w-0 break-all">{site.contactEmail}</span>
                    </a>
                  </li>
                )}
              </ul>
            )}
          </div>
          {(site.hasTerms || site.hasPrivacy) && site.slug && (
            <nav aria-label="Dokumenty" className="sm:pt-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-soft">Dokumenty</p>
              <ul className="divide-y divide-line border-y border-line sm:divide-y-0 sm:border-0">
                {site.hasTerms && (
                  <li>
                    <Link
                      href={`/w/${site.slug}/${LEGAL_PATH.terms}`}
                      onClick={(e) => openDocFrom(e, "terms")}
                      className="flex items-center justify-between py-3 text-[15px] text-ink/80 hover:text-ink sm:py-1.5"
                    >
                      {LEGAL_TITLE.terms}
                      <span aria-hidden className="text-soft sm:hidden">›</span>
                    </Link>
                  </li>
                )}
                {site.hasPrivacy && (
                  <li>
                    <Link
                      href={`/w/${site.slug}/${LEGAL_PATH.privacy}`}
                      onClick={(e) => openDocFrom(e, "privacy")}
                      className="flex items-center justify-between py-3 text-[15px] text-ink/80 hover:text-ink sm:py-1.5"
                    >
                      {LEGAL_TITLE.privacy}
                      <span aria-hidden className="text-soft sm:hidden">›</span>
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          )}
        </div>
        <div className="border-t border-line">
          {/* Na mobilu místo pod spodní lištou s cenou — pozadí patičky sahá až dolů */}
          <div className="mx-auto flex max-w-4xl flex-col gap-3 px-5 pb-28 pt-5 text-xs leading-relaxed text-soft sm:flex-row sm:items-center sm:justify-between sm:pb-5 lg:max-w-6xl lg:px-8 2xl:max-w-7xl">
            <div>
              {(site.provider?.name || site.provider?.id) && (
                <p>
                  Provozovatel: {providerLine({
                    businessName: site.provider.name,
                    businessId: site.provider.id,
                    vatId: site.provider.vatId,
                    businessAddress: site.provider.address,
                  })}
                  {!site.vatRate && " · neplátce DPH"}
                </p>
              )}
              <p>© {new Date().getFullYear()} {site.name || "Tvůj web"}</p>
            </div>
            <Link href="/" className="inline-flex shrink-0 items-center gap-1.5 hover:text-ink">
              vytvořeno s <Wordmark className="text-sm" />
            </Link>
          </div>
        </div>
      </footer>

      <StickyBookBar price={czk(site.pricePerNight)} suffix={priceSuffix} />
    </div>
  );
}

/** Tenká ikona do patičky (stejný styl čar jako ikony vybavení). */
function FooterIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-pine">
      <path d={d} />
    </svg>
  );
}
