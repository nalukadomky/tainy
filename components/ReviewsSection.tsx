"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { reviewSource, type Review, type ReviewsLayout } from "@/lib/reviews";

// Sekce Recenze na webu: karty s hvězdičkami, textem, jménem a fotkou (nebo
// iniciálou). Vzhled volí majitel: mřížka (na mobilu posuvný pás), nebo
// posuvník do stran se šipkami i na počítači.

function Stars({ n }: { n: number }) {
  if (!n) return null;
  return (
    <p className="flex gap-0.5 text-pine" aria-label={`Hodnocení ${n} z 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" width="16" height="16" aria-hidden fill={i < n ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4">
          <path d="m10 2.2 2.4 4.9 5.4.8-3.9 3.8.9 5.4L10 14.6l-4.8 2.5.9-5.4L2.2 7.9l5.4-.8Z" strokeLinejoin="round" />
        </svg>
      ))}
    </p>
  );
}

function ReviewCard({ r }: { r: Review }) {
  return (
    <figure className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <Stars n={r.rating} />
      <blockquote className="mt-3 flex-1 whitespace-pre-line text-[15px] leading-relaxed text-ink/85">„{r.text}“</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <span className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-pine/10 font-display text-base font-semibold text-pine" style={{ width: 40, height: 40 }}>
          {r.photo ? <Image src={r.photo} alt="" fill sizes="40px" className="object-cover" /> : (r.name || "?").charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{r.name}</span>
          {r.meta && <span className="block truncate text-xs text-soft">{r.meta}</span>}
        </span>
      </figcaption>
      <SourceLink link={r.link} />
    </figure>
  );
}

const SOURCE_LABEL = { google: "Zobrazit na Googlu", booking: "Zobrazit na Bookingu", airbnb: "Zobrazit na Airbnb", other: "Zobrazit originál" };

/** Odkaz na původní recenzi (Google, Booking…) dole na kartě. */
function SourceLink({ link }: { link?: string }) {
  const source = link ? reviewSource(link) : null;
  if (!link || !source) return null;
  return (
    <a
      href={link.trim()}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="mt-4 inline-flex items-center gap-1.5 self-start border-t border-line pt-3 text-xs font-semibold text-soft transition hover:text-pine"
    >
      {source === "google" && <GoogleG />}
      {SOURCE_LABEL[source]} ↗
    </a>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="14" height="14" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.5 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.9-6.2C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/**
 * Přechod do ztracena na okrajích pásu tam, kde karty pokračují — místo
 * ostře useknuté karty. Na začátku / konci pásu je okraj ostrý.
 */
function fade(edge: { start: boolean; end: boolean }): React.CSSProperties {
  if (edge.start && edge.end) return {};
  const W = "clamp(48px, 9vw, 96px)";
  const mask = `linear-gradient(to right, ${edge.start ? "#000" : "transparent"} 0, #000 ${W}, #000 calc(100% - ${W}), ${
    edge.end ? "#000" : "transparent"
  } 100%)`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

export function ReviewsSection({
  reviews,
  layout = "grid",
  sample = false,
  title = "Co říkají hosté",
}: {
  title?: React.ReactNode;
  reviews: Review[];
  layout?: ReviewsLayout;
  sample?: boolean;
}) {
  const slider = layout === "slider";
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const [active, setActive] = useState(0);

  // Stav pásu: šipky neaktivní na začátku / konci, tečka u karty, která je vidět
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const sync = () => {
      const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      setEdge({ start: el.scrollLeft <= 4, end });
      const card = el.firstElementChild as HTMLElement | null;
      const step = card ? card.offsetWidth + 16 : 1;
      setActive(end ? reviews.length - 1 : Math.min(reviews.length - 1, Math.round(el.scrollLeft / step)));
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [slider, reviews.length]);

  /** Šipky: posun o jednu „stránku“ karet (po celých kartách díky snap). */
  const scroll = (dir: -1 | 1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };
  /** Tečky: posun na danou kartu. */
  const goTo = (i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - (el.firstElementChild as HTMLElement).offsetLeft, behavior: "smooth" });
  };

  return (
    <section id="recenze" className="relative scroll-mt-20 border-t border-line">
      {sample && (
        <span className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white shadow">
          Ukázka — recenze vložíš v panelu
        </span>
      )}
      <div className="mx-auto max-w-4xl py-12 sm:py-16 lg:max-w-6xl 2xl:max-w-7xl">
        <h2 className="px-5 font-display text-3xl font-semibold tracking-tight lg:px-8">{title}</h2>
        {/* Mřížka: na mobilu posuvný pás, od tabletu mřížka. Posuvník: pás na všech šířkách. */}
        <div className="relative">
        <div
          ref={track}
          className={`mt-6 flex snap-x snap-mandatory scroll-pl-5 gap-4 overflow-x-auto px-5 pb-2 lg:scroll-pl-8 lg:px-8 ${
            slider ? "" : "sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3"
          }`}
          style={{ scrollbarWidth: "none", ...fade(edge) }}
        >
          {reviews.map((r) => (
            <div
              key={r.id}
              className={`shrink-0 snap-start ${slider ? "review-slide" : "sm:!w-auto"}`}
              style={{ width: "82%" }}
            >
              <ReviewCard r={r} />
            </div>
          ))}
        </div>
        {/* Posuvník: šipky po stranách pásu, svisle na středu, na konci zešednou (na mobilu se swipuje).
            Na širokých obrazovkách mimo karty — vedle obsahu je dost místa. */}
        {slider &&
          reviews.length > 1 &&
          ([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => scroll(dir)}
              disabled={dir < 0 ? edge.start : edge.end}
              aria-label={dir < 0 ? "Předchozí recenze" : "Další recenze"}
              className={`absolute top-1/2 z-10 hidden items-center justify-center rounded-full border border-line bg-surface text-lg text-ink shadow-md transition hover:border-pine/40 hover:text-pine disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none sm:flex ${
                dir < 0 ? "left-0 lg:left-1 xl:-left-6" : "right-0 lg:right-1 xl:-right-6"
              }`}
              style={{ width: 44, height: 44, transform: "translateY(calc(-50% - 4px))" }}
            >
              {dir < 0 ? "←" : "→"}
            </button>
          ))}
        </div>
        {/* Mobil: tečky ukazují, kolik recenzí je a kde jsem — pás se posouvá prstem */}
        {reviews.length > 1 && (
          <div className="mt-4 flex justify-center gap-1.5 sm:hidden" aria-hidden>
            {reviews.map((r, i) => (
              <button
                key={r.id}
                type="button"
                tabIndex={-1}
                onClick={() => goTo(i)}
                className={`rounded-full transition-all ${i === active ? "bg-pine" : "bg-line"}`}
                style={{ width: i === active ? 18 : 6, height: 6 }}
              />
            ))}
          </div>
        )}
      </div>
      {/* Šířka karet v posuvníku: mobil 82 %, tablet dvě, počítač tři v řadě (kousek další naznačí pokračování) */}
      {slider && (
        <style>{`@media (min-width:640px){.review-slide{width:calc((100% - 1rem) / 2.15)!important}}@media (min-width:1024px){.review-slide{width:calc((100% - 2rem) / 3.2)!important}}`}</style>
      )}
    </section>
  );
}

/** Úpravy přímo ve webu: výzva k přidání, dokud je sekce vypnutá. */
export function ReviewsPlaceholder() {
  return (
    <section id="recenze" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-4xl px-5 py-12 lg:max-w-6xl lg:px-8 2xl:max-w-7xl">
        <div className="rounded-3xl border-2 border-dashed border-line px-6 py-10 text-center">
          <p className="font-display text-xl font-semibold">+ Přidat recenze hostů</p>
          <p className="mt-1 text-sm text-soft">Karty s hodnocením, textem, jménem a fotkou — z Googlu, Bookingu nebo e-mailů.</p>
        </div>
      </div>
    </section>
  );
}
