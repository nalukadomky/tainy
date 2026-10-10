"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAdminData, type Site } from "@/lib/admin";
import { toSiteViewData } from "@/lib/siteView";
import { parsePhotoLines } from "@/lib/photos";
import { AMENITY_SUGGESTIONS } from "@/lib/listing";
import { DeviceStage, DeviceSwitch, type Device } from "@/components/DeviceStage";
import { usePreviewFrame } from "@/components/LivePreview";
import { BuilderHint, BuilderPanel } from "@/components/BuilderPanel";
import type { EditableField, EditableSection } from "@/components/EditableText";
import { HeroPicker } from "@/components/HeroPicker";
import { PhotoManager } from "@/components/PhotoManager";
import { AmenityPicker } from "@/components/AmenityPicker";
import { LocationSettings } from "@/components/LocationSettings";
import { ThemePicker } from "@/components/ThemePicker";
import { AboutSettings } from "@/components/AboutSettings";
import { PropertyTypePicker } from "@/components/PropertyTypePicker";
import type { BookedRange } from "@/components/DayPicker";
import { SITES_CHANGED } from "@/components/AdminNav";
import { FLASH_KEY } from "@/components/Toast";
import { Skeleton } from "@/components/Skeleton";

// Builder (varianta B): web se upravuje přímo v sobě. Texty se přepisují
// kliknutím do webu, sekce mají „Upravit", které otevře boční panel.
// Všechno se ukládá samo. Ceník záměrně zůstává v klasickém editoru.

type SaveState = "idle" | "saving" | "saved" | "error";

const PANEL_TITLE: Record<EditableSection, string> = {
  uvod: "Úvod webu",
  galerie: "Fotky",
  "o-miste": "Popis a kontakt",
  vybaveni: "Vybavení",
  poloha: "Kde nás najdete",
  "o-nas": "O nás",
  paticka: "Patička",
  rezervace: "Ceník a pobyt",
};

export default function BuilderPage() {
  const { slug, site, loading, error } = useAdminData();
  const [form, setForm] = useState<Site | null>(null);
  const [mounted, setMounted] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [panel, setPanel] = useState<EditableSection | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [leaving, setLeaving] = useState(false);
  const confirmDlg = useConfirm();
  const router = useRouter();
  const [hint, setHint] = useState(false);
  const [booked, setBooked] = useState<BookedRange[]>([]);
  const pending = useRef<Partial<Site>>({});
  const timer = useRef<number | null>(null);
  // Právě běžící uložení — při odchodu na něj počkáme. Vrací, jestli se povedlo.
  const inflight = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (site) setForm(site);
  }, [site]);

  useEffect(() => {
    setMounted(true);
    if (!window.matchMedia("(min-width: 1024px)").matches) setDevice("mobile");
    // ?panel=galerie — rovnou otevřená sekce (např. „Přidat fotky“ po založení webu)
    const initial = new URLSearchParams(window.location.search).get("panel");
    if (initial && initial in PANEL_TITLE) setPanel(initial as EditableSection);
    try {
      setHint(localStorage.getItem("tainy.builder.hint") !== "0");
    } catch {}
    // Builder je přes celou obrazovku — stránka pod ním se nemá posouvat.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // --- Ukládání: změny se sbírají a po chvilce klidu odešlou najednou ---
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (inflight.current) await inflight.current;
    const patch = pending.current;
    if (!slug || !Object.keys(patch).length) return true;
    pending.current = {};
    setSave("saving");
    const run = (async () => {
      try {
        const res = await fetch(`/api/sites/${slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error();
        // Nová adresa: server dohledal souřadnice — mapa ve webu se hned překreslí
        if ("arrivalAddress" in patch) {
          const saved = await res.json().catch(() => null);
          if (saved && typeof saved.geo === "string") setForm((f) => (f ? { ...f, geo: saved.geo } : f));
        }
        setSave("saved");
        setSavedAt(new Date());
        if ("name" in patch) window.dispatchEvent(new Event(SITES_CHANGED));
        return true;
      } catch {
        // Neuložené změny vrátíme do fronty — odejdou s další úpravou nebo tlačítkem „Zkusit znovu".
        pending.current = { ...patch, ...pending.current };
        setSave("error");
        return false;
      }
    })();
    inflight.current = run;
    const ok = await run;
    inflight.current = null;
    return ok;
  }, [slug]);

  const update = useCallback(
    (patch: Partial<Site>, persist = true) => {
      setForm((f) => (f ? { ...f, ...patch } : f));
      if (!persist) return;
      pending.current = { ...pending.current, ...patch };
      setSave("saving");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 800);
    },
    [flush],
  );

  // Při odchodu ze stránky dopsat, co ještě čeká.
  useEffect(() => {
    const onLeave = () => {
      if (!slug || !Object.keys(pending.current).length) return;
      // keepalive: požadavek doběhne i po zavření záložky
      fetch(`/api/sites/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.current),
        keepalive: true,
      });
    };
    // Zavření záložky nebo obnovení stránky s neuloženými změnami — prohlížeč se zeptá.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || inflight.current) e.preventDefault();
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onBeforeUnload);
      flush();
    };
  }, [slug, flush]);

  // Odchod zpět do administrace: nejdřív dopsat změny, pak potvrdit, že jsou uložené.
  async function leave(to = "/admin") {
    if (leaving) return;
    setLeaving(true);
    const ok = await flush();
    if (
      !ok &&
      !(await confirmDlg.ask({
        title: "Některé změny se neuložily",
        message: "Když teď odejdeš, neuložené úpravy se ztratí.",
        confirmLabel: "Odejít i tak",
        cancelLabel: "Zůstat",
      }))
    ) {
      setLeaving(false);
      return;
    }
    try {
      sessionStorage.setItem(FLASH_KEY, ok ? "Změny webu jsou uložené." : "");
    } catch {}
    router.push(to);
  }

  // --- Komunikace s webem v iframe ---
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/availability?site=${slug}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setBooked)
      .catch(() => {});
  }, [slug]);

  const siteView = useMemo(() => (form ? toSiteViewData(form) : null), [form]);
  const frameRef = usePreviewFrame({
    site: siteView,
    booked,
    editable: true,
    focus: panel,
    onEdit: (field, value) => update({ [field]: value } as Pick<Site, EditableField>),
    onSelect: setPanel,
  });

  const closePanel = useCallback(() => setPanel(null), []);

  function dismissHint() {
    setHint(false);
    try {
      localStorage.setItem("tainy.builder.hint", "0");
    } catch {}
  }

  if (!mounted) return null;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  // Do <body>: předek s CSS transformací by jinak rozbil `fixed` přes celé okno.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg">
      {confirmDlg.node}
      {/* Horní lišta */}
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={() => leave()}
          disabled={leaving}
          className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium text-soft hover:bg-line/50 hover:text-ink disabled:opacity-60"
        >
          ← <span className="max-sm:hidden">{leaving ? "Ukládám a odcházím…" : "Administrace"}</span>
        </button>
        <p className="mr-auto min-w-0 truncate font-display text-base font-semibold leading-tight">
          Můj web{form ? ` · ${form.name || "bez názvu"}` : ""}
        </p>
        <SaveIndicator state={save} savedAt={savedAt} onRetry={() => flush()} />
        <DeviceSwitch value={device} onChange={setDevice} />
        {slug && (
          <a
            href={`/w/${slug}`}
            target="_blank"
            className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium text-pine hover:bg-pine/10 max-lg:hidden"
          >
            Zobrazit web ↗
          </a>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Nápověda je v toku stránky, ne nad iframe — jinak ji některé prohlížeče schovají pod web */}
          {hint && (
            <BuilderHint onDismiss={dismissHint}>
              ✍️ Klikni na text a piš. Fotky a další nastavení sekce otevřeš tlačítkem <strong>Upravit</strong>.
            </BuilderHint>
          )}
          {loading || !form ? (
            <div className="paper flex flex-1 items-start justify-center p-6" role="status" aria-label="Načítám web">
              <Skeleton className="h-[70%] w-full max-w-3xl rounded-xl" />
            </div>
          ) : (
            <DeviceStage device={device} slug={form.slug} frameRef={frameRef} title="Úpravy webu" />
          )}
        </div>

        {/* Boční panel sekce (na mobilu spodní sheet) */}
        {panel && form && (
          <BuilderPanel title={PANEL_TITLE[panel]} onClose={closePanel}>
            <SectionPanel section={panel} form={form} update={update} onLeave={leave} />
          </BuilderPanel>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Stav ukládání v horní liště builderu — ať je pořád vidět, že se změny ukládají. */
function SaveIndicator({ state, savedAt, onRetry }: { state: SaveState; savedAt: Date | null; onRetry: () => void }) {
  const time = savedAt?.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const base =
    "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-xs font-semibold";
  return (
    <div aria-live="polite" className="shrink-0">
      {state === "saving" ? (
        <span className={`${base} border-amber/40 bg-amber/10 text-[#92600a]`}>
          <span
            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
          Ukládám…
        </span>
      ) : state === "error" ? (
        <span className={`${base} border-coral/40 bg-coral/10 text-coral`}>
          ⚠ <span className="max-sm:hidden">Neuloženo</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-coral px-2 py-0.5 text-white hover:bg-coral/90"
          >
            Zkusit znovu
          </button>
        </span>
      ) : state === "saved" ? (
        <span
          className={`${base} border-pine/30 bg-pine/10 text-pine`}
          title="Změny jsou uložené a hosté je vidí na webu"
        >
          ✓ Uloženo<span className="max-sm:hidden"> v {time}</span>
        </span>
      ) : (
        <span className={`${base} border-line bg-bg text-soft`} title="Každá úprava se uloží automaticky">
          ✓ <span className="max-sm:hidden">Ukládá se automaticky</span>
        </span>
      )}
    </div>
  );
}

function SectionPanel({
  section,
  form,
  update,
  onLeave,
}: {
  section: EditableSection;
  form: Site;
  update: (patch: Partial<Site>, persist?: boolean) => void;
  onLeave: (to: string) => void;
}) {
  const amenities = form.amenities
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  switch (section) {
    case "uvod":
      return (
        <>
          <p className="text-sm text-soft">Název a slogan přepíšeš kliknutím přímo do webu.</p>
          <div>
            <span className="mb-2 block text-sm font-medium">Typ ubytování</span>
            <PropertyTypePicker value={form.propertyType} onChange={(t) => update({ propertyType: t })} />
          </div>
          <div>
            <span className="mb-2 block text-sm font-medium">Barva webu</span>
            <ThemePicker value={form.themeColor} onChange={(key) => update({ themeColor: key })} />
          </div>
          {/* HeroPicker si změny ukládá sám — do formuláře je jen propíšeme */}
          <HeroPicker
            slug={form.slug}
            siteName={form.name}
            tagline={form.tagline}
            propertyType={form.propertyType}
            heroStyle={form.heroStyle === "photo" ? "photo" : "text"}
            heroPhoto={form.heroPhoto ?? ""}
            gallery={parsePhotoLines(form.photos)}
            onChange={(patch) => update(patch, false)}
          />
          <SettingsLinks
            onLeave={onLeave}
            links={[
              {
                label: "Počet hostů a ložnice",
                hint: "„až 4 hostů · 2 ložnice“ v úvodu",
                to: "/admin/nastaveni?sekce=cenik&pole=luzka",
              },
            ]}
          />
        </>
      );
    case "galerie":
      return (
        <>
          <p className="text-sm text-soft">Přetažením změníš pořadí. Změny se ukládají hned.</p>
          <PhotoManager slug={form.slug} value={form.photos} onChange={(photos) => update({ photos }, false)} />
        </>
      );
    case "o-miste":
      return (
        <>
          <p className="text-sm text-soft">Popis můžeš psát i přímo ve webu.</p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Popis</span>
            <textarea
              className="field min-h-48"
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Kontaktní e-mail</span>
            <input
              className="field"
              type="email"
              value={form.contactEmail}
              onChange={(e) => update({ contactEmail: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Telefon</span>
            <input
              className="field"
              type="tel"
              value={form.contactPhone}
              onChange={(e) => update({ contactPhone: e.target.value })}
            />
          </label>
          <SettingsLinks
            onLeave={onLeave}
            links={[
              {
                label: "Check-in a check-out",
                hint: "Štítky s časy pod popisem",
                to: "/admin/nastaveni?sekce=cenik&pole=casy",
              },
              {
                label: "Ložnice a lůžka",
                hint: "Štítky s postelemi pod popisem",
                to: "/admin/nastaveni?sekce=cenik&pole=luzka",
              },
            ]}
          />
        </>
      );
    case "vybaveni":
      return (
        <>
          <p className="text-sm text-soft">Klikni na položku z nabídky, nebo napiš vlastní.</p>
          <AmenityPicker
            value={amenities}
            onChange={(next) => update({ amenities: next.join(", ") })}
            suggestions={AMENITY_SUGGESTIONS}
            placeholder="Další vybavení…"
          />
        </>
      );
    case "o-nas":
      return <AboutSettings value={form} onChange={(patch) => update(patch)} inlineText />;
    case "poloha":
      // Souřadnice (ručně určené) ukládá okno se špendlíkem samo — do formuláře je jen propíšeme
      return <LocationSettings value={form} onChange={(patch) => update(patch, !("geo" in patch))} compact />;
    case "paticka":
      return (
        <>
          <p className="text-sm text-soft">
            Kontakt v patičce je stejný jako u popisu místa. Provozovatel a dokumenty se nastavují v Nastavení.
          </p>
          <SettingsLinks
            onLeave={onLeave}
            links={[
              {
                label: "Provozovatel a IČ",
                hint: "Údaje o provozovateli a řádek dole v patičce",
                to: "/admin/nastaveni?sekce=pravni&pole=provozovatel",
              },
              {
                label: "Obchodní podmínky a ochrana údajů",
                hint: "Odkazy v části Dokumenty",
                to: "/admin/nastaveni?sekce=pravni&pole=dokumenty",
              },
              {
                label: "Název a kontakt",
                hint: "Název webu, e-mail a telefon",
                to: "/admin/nastaveni?sekce=zakladni&pole=kontakt",
              },
            ]}
          />
        </>
      );
    case "rezervace":
      return (
        <>
          <p className="text-sm text-soft">
            Ceny, počty hostů, pravidla pobytu a poplatky se nastavují zvlášť v části{" "}
            <strong className="text-ink">Nastavení → Ceník a pobyt</strong>, ať je cenotvorba přehledně na jednom místě.
          </p>
          <button type="button" onClick={() => onLeave("/admin/nastaveni?sekce=cenik")} className="btn-primary w-full">
            Upravit ceník a pobyt →
          </button>
          <button
            type="button"
            onClick={() => onLeave("/admin/nastaveni?sekce=pravni&pole=provozovatel")}
            className="btn-ghost w-full"
          >
            Provozovatel a obchodní podmínky →
          </button>
        </>
      );
  }
}

/** Odkazy do Nastavení u věcí, které se ve webu zobrazují, ale nastavují se jinde. */
function SettingsLinks({
  links,
  onLeave,
}: {
  links: { label: string; hint: string; to: string }[];
  onLeave: (to: string) => void;
}) {
  return (
    <div className="space-y-2 border-t border-line pt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-soft">Upravuje se v nastavení</p>
      {links.map((l) => (
        <button
          key={l.label}
          type="button"
          onClick={() => onLeave(l.to)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition hover:border-pine/40"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{l.label}</span>
            <span className="block text-xs text-soft">{l.hint}</span>
          </span>
          <span aria-hidden className="shrink-0 text-pine">
            →
          </span>
        </button>
      ))}
    </div>
  );
}
