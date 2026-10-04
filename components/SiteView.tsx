"use client";

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

  return (
    <div className="min-h-dvh bg-cream pb-24 sm:pb-0">
      {editing && <EditStyles />}
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
          <div className={`w-full pb-28 pt-24 text-white sm:pb-16 lg:pb-20 ${EDGE}`}>
            <p className="rise text-xs font-semibold uppercase tracking-widest text-white/80">
              {site.propertyType} · až {site.maxGuests} hostů
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
            <div className="rise rise-3 mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
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
            <div className="rise rise-3 mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
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
      <section id="galerie" className="mx-auto max-w-4xl scroll-mt-20 lg:max-w-6xl 2xl:max-w-7xl px-5 lg:px-8 pt-8">
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
          {site.checkInTime && site.checkOutTime && (
            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border border-line bg-surface px-3.5 py-1.5">
                Check-in <strong className="font-semibold">od {site.checkInTime}</strong>
              </span>
              <span className="rounded-full border border-line bg-surface px-3.5 py-1.5">
                Check-out <strong className="font-semibold">do {site.checkOutTime}</strong>
              </span>
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
          <ul className="mt-3 space-y-2">
            {amenities.length ? (
              amenities.map((a) => (
                <li key={a} className="flex items-center gap-2.5 text-[15px] text-soft">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pine/10 text-xs text-pine">
                    ✓
                  </span>
                  {a}
                </li>
              ))
            ) : (
              <li className="text-[15px] text-soft">Vybavení zatím není vyplněné.</li>
            )}
          </ul>
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
                guestMode: site.guestMode ?? "total",
                categories: site.categories ?? defaultCategories(site.pricingMode),
              }}
            />
          </div>
        </div>
      </section>
      </EditSection>

      <footer className="border-t border-line bg-cream">
        <div className="mx-auto flex max-w-4xl lg:max-w-6xl 2xl:max-w-7xl items-center justify-between px-5 lg:px-8 py-6 text-sm text-soft">
          <span>© {new Date().getFullYear()} {site.name || "Tvůj web"}</span>
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-ink">
            vytvořeno s <Wordmark className="text-base" />
          </Link>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur sm:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-soft">od</p>
            <p className="font-display text-lg font-semibold leading-none">
              {czk(site.pricePerNight)}{" "}
              <span className="text-xs font-normal text-soft">{priceSuffix}</span>
            </p>
          </div>
          <a href="#rezervace" className="btn-primary flex-1 !py-3 text-sm">
            Rezervovat termín
          </a>
        </div>
      </div>
    </div>
  );
}
