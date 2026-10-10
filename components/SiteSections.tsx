"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import type { PublicLocation } from "@/lib/location";
import { registerNote } from "@/lib/legal";

// Mapa (Leaflet) se načte jen na webech, které polohu na mapě ukazují
const PlaceMap = dynamic(() => import("@/components/PlaceMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-bg" />,
});

// Části veřejného webu: vybavení s ikonami, mapa „Kde nás najdete“
// a spodní lišta s cenou na mobilu.

/* ---------- Ikony vybavení ---------- */

// Tenké čárové ikony (stejný styl jako navigace administrace). Přiřazují se
// podle slov v názvu vybavení; neznámé vybavení dostane fajfku.
const P = (d: string) => <path d={d} />;
const ICONS: [RegExp, React.ReactNode][] = [
  [/wi-?fi|internet/i, <>{P("M5 12.5a10 10 0 0 1 14 0")}{P("M8.5 16a5 5 0 0 1 7 0")}{P("M2 9a15 15 0 0 1 20 0")}<circle cx="12" cy="19.5" r="1" /></>],
  [/park/i, <><rect x="4" y="3" width="16" height="18" rx="3" />{P("M10 17V8h3a2.5 2.5 0 0 1 0 5h-3")}</>],
  [/kuchy|kuchyň|vařič|trouba/i, <>{P("M5 3v8a2 2 0 0 0 2 2v8")}{P("M9 3v8a2 2 0 0 1-2 2")}{P("M7 3v6")}{P("M17 21V3c-2 1.5-3 4-3 7v3h3")}</>],
  [/sauna/i, <>{P("M4 21h16")}{P("M6 21v-6h12v6")}{P("M9 11c0-1.5 1-2 1-3.5S9 5 9 4")}{P("M13 11c0-1.5 1-2 1-3.5S13 5 13 4")}{P("M17 11c0-1.5 1-2 1-3.5S17 5 17 4")}</>],
  [/vířivk|whirl|jacuzzi|bazén|pool/i, <>{P("M2 18c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1 2.5-1 4-1")}{P("M2 14c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1 2.5-1 4-1")}{P("M8 11V5a2 2 0 0 1 4 0")}{P("M16 11V5a2 2 0 0 0-4 0")}</>],
  [/krb|kamna|kamínk/i, <>{P("M12 21c-3.5 0-6-2.3-6-5.5C6 11 10 9 10 5c2.5 1.5 4 4 4 6.5.8-.6 1.3-1.6 1.5-2.5C17 10.5 18 12.8 18 15.5 18 18.7 15.5 21 12 21Z")}</>],
  [/teras|balkon|veranda/i, <>{P("M3 10h18")}{P("M12 3 3 10")}{P("M12 3l9 7")}{P("M5 10v11")}{P("M19 10v11")}{P("M5 15h14")}{P("M9 15v6")}{P("M15 15v6")}</>],
  [/gril|ohniště|barbecue/i, <>{P("M4 10h16a8 8 0 0 1-16 0Z")}{P("M8 18l-2 4")}{P("M16 18l2 4")}{P("M9 3c0 1.5 1 1.5 1 3")}{P("M14 3c0 1.5 1 1.5 1 3")}</>],
  [/klima|chlaz/i, <>{P("M12 2v20")}{P("M4.9 7l14.2 10")}{P("M19.1 7 4.9 17")}{P("M9 4l3 2 3-2")}{P("M9 20l3-2 3 2")}</>],
  [/myčk|nádob/i, <><rect x="4" y="2.5" width="16" height="19" rx="2" />{P("M4 7h16")}<circle cx="12" cy="14" r="4" /></>],
  [/pračk|sušičk/i, <><rect x="4" y="2.5" width="16" height="19" rx="2" /><circle cx="12" cy="13.5" r="4.5" />{P("M8 6h.01")}{P("M11 6h.01")}</>],
  [/tv|televiz|netflix/i, <><rect x="2.5" y="5" width="19" height="13" rx="2" />{P("M8 21h8")}{P("M12 18v3")}</>],
  [/zahrad|trávník|houpačk/i, <>{P("M12 21v-7")}{P("M12 14c-4 0-6-3-6-7 4 0 6 3 6 7Z")}{P("M12 14c4 0 6-3 6-7-4 0-6 3-6 7Z")}{P("M5 21h14")}</>],
  [/snída|káv|čaj/i, <>{P("M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z")}{P("M17 11h1.5a2.5 2.5 0 0 1 0 5H17")}{P("M8 2.5c0 1.5 1 1.5 1 3")}{P("M12 2.5c0 1.5 1 1.5 1 3")}</>],
  [/mazlí|pes|psi|zvířat/i, <><circle cx="5.5" cy="10" r="1.8" /><circle cx="9.5" cy="5.5" r="1.8" /><circle cx="14.5" cy="5.5" r="1.8" /><circle cx="18.5" cy="10" r="1.8" />{P("M12 11c-3 0-5.5 4-5.5 6.5 0 1.7 1.3 2.5 2.8 2.5 1 0 1.7-.5 2.7-.5s1.7.5 2.7.5c1.5 0 2.8-.8 2.8-2.5C17.5 15 15 11 12 11Z")}</>],
  [/bezbari|vozíč/i, <><circle cx="12" cy="4" r="1.8" />{P("M12 7v6h5l2 5")}{P("M12 9h4")}{P("M9 11.5a5.5 5.5 0 1 0 6.8 7.3")}</>],
  [/van|sprch|koupel/i, <>{P("M3 12h18v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2Z")}{P("M6 12V5a2 2 0 0 1 3.5-1.3")}{P("M7 20l-1 2")}{P("M17 20l1 2")}</>],
  [/kolo|wake|lod|kajak|paddle|sport/i, <><circle cx="5.5" cy="17" r="3.5" /><circle cx="18.5" cy="17" r="3.5" />{P("M5.5 17 9 9h6l3.5 8")}{P("M9 9 12 17h-6")}{P("M14 6h3")}</>],
  [/výhled|hvězd|les|hory/i, <>{P("M3 20 9.5 9l4 6.5 2.5-3.5 5 8H3Z")}<circle cx="17" cy="5.5" r="1.8" /></>],
  [/ložní|povleč|ručník/i, <>{P("M3 18V7")}{P("M21 18v-5a3 3 0 0 0-3-3H10v8")}{P("M3 14h18")}<circle cx="6.5" cy="10.5" r="1.5" /></>],
];

export function AmenityIcon({ name }: { name: string }) {
  const icon = ICONS.find(([re]) => re.test(name))?.[1] ?? P("M5 12.5 10 17 19 7.5");
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-pine"
    >
      {icon}
    </svg>
  );
}

const SHOWN = 8;

/** Vybavení ve dvou sloupcích s ikonami; prvních 8 a zbytek v okně „Zobrazit vše“. */
export function AmenityList({ amenities }: { amenities: string[] }) {
  const [open, setOpen] = useState(false);
  if (!amenities.length) return <p className="mt-3 text-[15px] text-soft">Vybavení zatím není vyplněné.</p>;
  return (
    <>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
        {amenities.slice(0, SHOWN).map((a) => (
          <li key={a} className="flex min-w-0 items-center gap-2.5 text-[15px] text-ink/85">
            <AmenityIcon name={a} />
            <span className="min-w-0 break-words">{a}</span>
          </li>
        ))}
      </ul>
      {amenities.length > SHOWN && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-5 rounded-full border border-ink/80 px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-ink hover:text-white"
        >
          Zobrazit všech {amenities.length} položek vybavení
        </button>
      )}
      {open && <AmenityDialog amenities={amenities} onClose={() => setOpen(false)} />}
    </>
  );
}

function AmenityDialog({ amenities, onClose }: { amenities: string[]; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vybavení"
        className="rise flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-xl font-semibold">Vybavení</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-xl text-soft outline-none transition hover:bg-bg hover:text-ink focus-visible:ring-2 focus-visible:ring-pine/40"
          >
            ×
          </button>
        </div>
        <ul className="grid gap-x-6 overflow-y-auto px-6 py-2 sm:grid-cols-2">
          {amenities.map((a) => (
            <li key={a} className="flex items-center gap-3 border-b border-line/70 py-3.5 text-[15px]">
              <AmenityIcon name={a} />
              {a}
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}

/* ---------- Kde nás najdete ---------- */

export function LocationSection({ location, theme }: { location: PublicLocation; theme?: string }) {
  const exact = location.mode === "exact";
  const town = encodeURIComponent(location.label.split(",")[0]);
  // Přesná poloha: odkazy vedou na bod (špendlík), přibližná jen na obec
  const mapyCz =
    location.mode === "exact"
      ? `https://mapy.cz/zakladni?source=coor&id=${location.lng}%2C${location.lat}&x=${location.lng}&y=${location.lat}&z=17`
      : `https://mapy.cz/zakladni?q=${town}`;
  const google =
    location.mode === "exact"
      ? `https://www.google.com/maps/search/?api=1&query=${location.lat}%2C${location.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${town}`;
  return (
    <section id="poloha" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-12 lg:max-w-6xl lg:px-8 2xl:max-w-7xl">
      <h2 className="font-display text-2xl font-semibold">Kde nás najdete</h2>
      <p className="mt-2 text-soft">
        {location.label}
        {!exact && <span className="block text-sm">Přesnou adresu a pokyny k příjezdu pošleme po rezervaci.</span>}
      </p>
      {location.mode !== "area-text" && (
        // isolate: vrstvy mapy (Leaflet) zůstanou pod hlavičkou a spodní lištou webu
        <div className="relative isolate mt-5 aspect-[4/3] max-h-[460px] w-full overflow-hidden rounded-2xl border border-line bg-bg sm:aspect-[16/9]">
          <PlaceMap key={theme} lat={location.lat} lng={location.lng} exact={exact} title={`Mapa — ${location.label}`} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={mapyCz} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-4 !py-2 text-sm">
          Otevřít v Mapy.cz ↗
        </a>
        <a
          href={google}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost !px-4 !py-2 text-sm"
        >
          Google Maps ↗
        </a>
      </div>
    </section>
  );
}

/** Úpravy přímo ve webu: místo pro polohu, dokud ji majitel nenastaví. */
export function LocationPlaceholder() {
  return (
    <section id="poloha" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-12 lg:max-w-6xl lg:px-8 2xl:max-w-7xl">
      <h2 className="font-display text-2xl font-semibold">Kde nás najdete</h2>
      <p className="mt-2 rounded-2xl border border-dashed border-line px-5 py-8 text-center text-soft">
        Doplň adresu a vyber, jak ukázat polohu — přibližně, nebo přesně na mapě.
      </p>
    </section>
  );
}

/* ---------- Spodní lišta s cenou (mobil) ---------- */

/**
 * Mobil: lišta „od … / noc · Rezervovat termín“ je vidět od začátku (cena
 * a tlačítko proto nejsou na úvodní fotce). Schová se jen nad formulářem
 * rezervace, aby nezakrývala jeho tlačítka.
 */
export function StickyBookBar({ price, suffix }: { price: string; suffix: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const booking = document.getElementById("rezervace");
    if (!booking) return;
    // Rezervace „na obrazovce“ až když zasáhne horních 60 % — ne při prvním pixelu dole
    const io = new IntersectionObserver(([e]) => setVisible(!e.isIntersecting), {
      rootMargin: "0px 0px -40% 0px",
    });
    io.observe(booking);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition duration-300 sm:hidden"
      style={{ transform: visible ? "translateY(0)" : "translateY(110%)", opacity: visible ? 1 : 0 }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-soft">od</p>
          <p className="font-display text-lg font-semibold leading-none">
            {price} <span className="text-xs font-normal text-soft">{suffix}</span>
          </p>
        </div>
        <a href="#rezervace" tabIndex={visible ? 0 : -1} className="btn-primary flex-1 !py-3 text-sm">
          Rezervovat termín
        </a>
      </div>
    </div>
  );
}

/* ---------- Údaje o provozovateli ---------- */

/** Okno s identifikací provozovatele (§ 435 OZ) — odkaz z patičky webu. */
export function ProviderDialog({
  provider,
  vatPayer,
  onClose,
}: {
  provider: { name: string; id: string; vatId: string; address: string; register?: string };
  vatPayer: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const rows: [string, string][] = [
    ["Provozovatel", provider.name],
    ["Sídlo", provider.address],
    ["IČ", provider.id],
    ["DIČ", provider.vatId],
    ["Zápis v rejstříku", registerNote(provider)],
    ["DPH", vatPayer ? "plátce DPH" : "neplátce DPH"],
  ].filter(([, v]) => v) as [string, string][];
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Údaje o provozovateli"
        className="rise w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold">Údaje o provozovateli</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-2 -mt-1 flex h-10 w-10 items-center justify-center rounded-full text-xl text-soft outline-none transition hover:bg-bg hover:text-ink focus-visible:ring-2 focus-visible:ring-pine/40"
          >
            ×
          </button>
        </div>
        <dl className="mt-4 divide-y divide-line text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-4 py-2.5">
              <dt className="w-32 shrink-0 text-soft">{k}</dt>
              <dd className="min-w-0 text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body
  );
}
