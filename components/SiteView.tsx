"use client";

import Link from "next/link";
import { czk, type PriceRuleInput, type PricingMode } from "@/lib/pricing";
import { BookingWidget } from "@/components/BookingWidget";
import { Wordmark } from "@/components/Logo";

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
  weekendPct: number;
  maxGuests: number;
  amenities: string;
  contactEmail: string;
  contactPhone: string;
  priceRules: PriceRuleInput[];
};

const GALLERY = ["🌲", "🛁", "🔥", "🌄", "☕️", "🌙"];

export function SiteView({ site, preview = false }: { site: SiteViewData; preview?: boolean }) {
  const perPerson = site.pricingMode === "person";
  const priceSuffix = perPerson ? "/ os. / noc" : "/ noc";
  const amenities = site.amenities
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  return (
    <div className="min-h-dvh bg-cream pb-24 sm:pb-0">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5">
          <span className="font-display text-xl font-semibold tracking-tight">
            {site.name || "Tvůj web"}
          </span>
          <a href="#rezervace" className="btn-primary hidden !px-5 !py-2 text-sm sm:inline-flex">
            Rezervovat
          </a>
        </div>
      </header>

      <section className="paper relative overflow-hidden border-b border-line">
        <div className="mx-auto max-w-4xl px-5 pb-12 pt-12 sm:pt-16">
          <p className="rise text-xs font-semibold uppercase tracking-widest text-soft">
            {site.propertyType} · až {site.maxGuests} hostů
          </p>
          <h1 className="rise rise-1 mt-3 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {site.name || "Tvůj web"}
          </h1>
          {site.tagline && (
            <p className="rise rise-2 mt-3 max-w-xl font-display text-xl italic text-soft">
              {site.tagline}
            </p>
          )}
          <p className="rise rise-3 mt-5 text-lg font-semibold">
            od {czk(site.pricePerNight)} <span className="font-normal text-soft">{priceSuffix}</span>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 pt-8">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {GALLERY.map((g, i) => (
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
        <p className="mt-2 text-xs text-soft">Sem přijdou tvoje fotky — v demu zatím nálada.</p>
      </section>

      <section className="mx-auto grid max-w-4xl gap-10 px-5 py-10 sm:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="font-display text-2xl font-semibold">O místě</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-soft">
            {site.description || "Popis místa zatím čeká na svá slova."}
          </p>
          {(site.contactEmail || site.contactPhone) && (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-display text-lg font-semibold">Kontakt</h3>
              <div className="mt-2 space-y-1 text-[15px] text-soft">
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
              </div>
            </div>
          )}
        </div>
        <div>
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
      </section>

      <section id="rezervace" className="border-t border-line bg-bg">
        <div className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Rezervace</h2>
          <p className="mt-2 text-soft">
            Vyber termín a počet hostů — platba proběhne bezpečně přes Stripe.
          </p>
          <div className="mt-6">
            <BookingWidget
              preview={preview}
              site={{
                slug: site.slug ?? "",
                name: site.name,
                pricePerNight: site.pricePerNight,
                pricingMode: site.pricingMode,
                weekendPct: site.weekendPct,
                priceRules: site.priceRules,
                maxGuests: site.maxGuests,
              }}
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-cream">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-6 text-sm text-soft">
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
