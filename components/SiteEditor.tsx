"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useAdminData, type Site, type PriceRule } from "@/lib/admin";
import { TaxSourceCard } from "@/components/TaxSourceCard";
import { applyAdjust, czk } from "@/lib/pricing";
import { AdjustField } from "@/components/AdjustField";
import { NumberField } from "@/components/NumberField";
import { parseCategories, serializeCategories, type GuestCategory } from "@/lib/guests";
import { isTime } from "@/lib/stay";
import { LivePreview, type PreviewSection } from "@/components/LivePreview";
import { SITES_CHANGED } from "@/components/AdminNav";
import { useToast } from "@/components/Toast";
import { FormPageSkeleton } from "@/components/Skeleton";
import { submitOnEnter } from "@/lib/enter";
import { SleepingField } from "@/components/SleepingField";
import {
  LegalSettings,
  ProviderSavedDialog,
  providerChangeOf,
  withProviderInDocs,
  type ProviderChange,
} from "@/components/LegalSettings";
import { DEFAULT_CANCELLATION, isValidIco, isValidVatId, type LegalKind } from "@/lib/legal";
import { AutomationSettings } from "@/components/AutomationSettings";
import { ExternalCalendars } from "@/components/ExternalCalendars";
import { parseEmailSettings, parseLocks, serializeEmailSettings } from "@/lib/email-templates";
import { Icon } from "@/components/Icon";
import { DomainSettings } from "@/components/DomainSettings";
import { WidgetSettings } from "@/components/WidgetSettings";
import { BookingMode } from "@/components/BookingMode";
import { HelpTip } from "@/components/HelpTip";

type Tab = "zakladni" | "cenik" | "pravni" | "domena" | "portaly" | "automatizace" | "widget";
const TABS: Record<Tab, { label: string; short: string; hint: string }> = {
  zakladni: { label: "Název a kontakt", short: "Název", hint: "Název, e-mail a telefon" },
  cenik: { label: "Ceník a pobyt", short: "Ceník", hint: "Ceny, hosté, pravidla a poplatky" },
  pravni: { label: "Firma a platby", short: "Firma", hint: "IČ, účet, DPH, podmínky a GDPR" },
  domena: { label: "Web a doména", short: "Web", hint: "Adresa webu, nebo jen widget" },
  portaly: { label: "Externí rezervace", short: "Portály", hint: "Airbnb, Booking.com a iCal" },
  automatizace: { label: "Automatizace", short: "E-maily", hint: "E-maily hostům a zámky" },
  widget: { label: "Widget na web", short: "Widget", hint: "Rezervace na tvém vlastním webu" },
};
const isTab = (v: string | null): v is Tab => !!v && v in TABS;

// Nastavení webu (název, ceník, firma, portály, e-maily). Vzhled a obsah webu
// se upravuje přímo ve webu (/admin/web/builder).
// area="widget" = samostatná stránka Widget (účet jen s widgetem ji má v menu místo Můj web).
export type EditorArea = "settings" | "widget";
// Hlavní záložky vlevo; méně časté jsou vpravo pod „Další“
const MAIN_TABS: Tab[] = ["zakladni", "cenik", "pravni", "automatizace", "domena"];
// Na telefonu se všechny hlavní záložky do řádku nevejdou — Doména je tam v „Další“
const MOBILE_MORE: Tab[] = ["domena"];
// Widget má vlastní stránku v menu (jen u účtu bez webu v tainy) — v nastavení se přepíná ve Web a doména
const MORE_TABS: Tab[] = ["portaly"];
const TAB_ORDER: Tab[] = [...MAIN_TABS, ...MORE_TABS];

export function SiteEditor({ area = "settings" }: { area?: EditorArea }) {
  const router = useRouter();
  const tabs = TAB_ORDER;
  const { slug, site, setSite, loading, error, reload } = useAdminData();
  const widgetPage = area === "widget";
  // Účet jen s widgetem nemá web v tainy: bez domény a náhledu webu, widget má v menu
  const widgetOnly = !!site?.widgetOnly;
  const mainTabs = MAIN_TABS;
  const moreTabs = MORE_TABS;
  const [form, setForm] = useState<Site | null>(null);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  // Uložit až po dalším vykreslení — hodnoty právě doplněné z ARES už budou ve formuláři
  const [saveRequested, setSaveRequested] = useState(false);
  // Potvrzení po změně IČ — co se propsalo samo a co upravit ručně
  const [icoSaved, setIcoSaved] = useState<ProviderChange | null>(null);

  // Formulář převezme data ze serveru — ale nepřepíše, co majitel mezitím
  // napsal po kliknutí na „Uložit" (ukládá se na pozadí).
  const sentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!site) return;
    setForm((f) => (!f || f.id !== site.id || !sentRef.current || JSON.stringify(f) === sentRef.current ? site : f));
  }, [site]);

  // Záložka se drží v adrese (?sekce=cenik), ať ji jde poslat odkazem a přežije obnovení.
  const [tab, setTab] = useState<Tab>(widgetPage ? "widget" : tabs[0]);
  useEffect(() => {
    if (widgetPage) return;
    const sekce = new URLSearchParams(window.location.search).get("sekce");
    if (isTab(sekce) && tabs.includes(sekce)) setTab(sekce);
  }, [tabs, widgetPage]);
  // Sekce, kterou majitel právě upravuje — živý náhled na ni odscrolluje.
  const [focus, setFocus] = useState<{ section: PreviewSection; at: number } | null>(null);
  const lastFocus = useRef({ section: "", at: 0 });
  const point = useCallback((section: PreviewSection) => {
    const now = Date.now();
    // Klik do pole vyvolá pointerdown i focus — stačí jedno zvýraznění.
    if (lastFocus.current.section === section && now - lastFocus.current.at < 600) return;
    lastFocus.current = { section, at: now };
    setFocus({ section, at: now });
  }, []);
  const watch = (section: PreviewSection) => ({
    onPointerDownCapture: () => point(section),
    onFocusCapture: () => point(section),
  });

  // Odkaz z úprav webu (?pole=luzka…) sjede přímo ke konkrétnímu poli a krátce ho zvýrazní
  const fieldShown = useRef(false);
  useEffect(() => {
    if (!form || fieldShown.current) return;
    const pole = new URLSearchParams(window.location.search).get("pole");
    if (!pole) return;
    fieldShown.current = true;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`pole-${pole}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.transition = "box-shadow .4s";
      el.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--pine) 40%, transparent)";
      window.setTimeout(() => (el.style.boxShadow = ""), 2200);
    }, 250);
    return () => window.clearTimeout(t);
  }, [form, tab]);

  function switchTab(t: Tab) {
    setTab(t);
    point(t === "zakladni" ? "uvod" : "rezervace");
    const url = new URL(window.location.href);
    if (t !== tabs[0]) url.searchParams.set("sekce", t);
    else url.searchParams.delete("sekce");
    window.history.replaceState(null, "", url);
  }

  const set = <K extends keyof Site>(key: K, value: Site[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  // PDF podmínek/zásad se ukládá hned po nahrání — zapíše se do formuláře
  // i do uložených dat, ať se nepočítá jako neuložená změna.
  const setDoc = useCallback(
    (kind: LegalKind, doc: { url: string; name: string; updatedAt: string | null } | null) => {
      const patch =
        kind === "terms"
          ? { termsPdf: doc?.url ?? "", termsName: doc?.name ?? "", ...(doc && { termsUpdatedAt: doc.updatedAt }) }
          : {
              privacyPdf: doc?.url ?? "",
              privacyName: doc?.name ?? "",
              ...(doc && { privacyUpdatedAt: doc.updatedAt }),
            };
      setForm((f) => (f ? { ...f, ...patch } : f));
      setSite((s) => (s ? { ...s, ...patch } : s));
    },
    [setSite],
  );

  const setRule = (index: number, patch: Partial<PriceRule>) =>
    setForm((f) => (f ? { ...f, priceRules: f.priceRules.map((r, i) => (i === index ? { ...r, ...patch } : r)) } : f));

  /** Uloží formulář; vrací, jestli se uložení povedlo (kvůli „Uložit a odejít"). */
  async function save(): Promise<boolean> {
    if (!form) return false;
    // Check-in a check-out musí být vždy vyplněné — kopírují se do každé nové rezervace.
    if (!isTime(form.checkInTime) || !isTime(form.checkOutTime)) {
      switchTab("cenik");
      toast.show("Vyplň čas check-inu i check-outu (Ceník a pobyt).");
      return false;
    }
    if (form.businessId.trim() && !isValidIco(form.businessId)) {
      switchTab("pravni");
      toast.show("IČ není platné — zkontroluj ho (Firma a platby).");
      return false;
    }
    if (form.vatId.trim() && !isValidVatId(form.vatId)) {
      switchTab("pravni");
      toast.show("DIČ má tvar CZ a 8–10 číslic (Firma a platby).");
      return false;
    }
    if (form.vatPayer && !form.vatId.trim()) {
      switchTab("pravni");
      toast.show("Plátce DPH musí mít vyplněné DIČ (Firma a platby).");
      return false;
    }
    // „Uloženo" hned, ukládá se na pozadí. Při chybě se změny označí jako
    // neuložené (zůstanou ve formuláři) a ozve se toast.
    // Nové IČ / jméno / sídlo se propíše i do vlastního znění podmínek a zásad
    const providerChange = site ? providerChangeOf(site, form) : null;
    const withDocs = site ? withProviderInDocs(site, form) : form;
    // E-maily a zámky ve stejném tvaru, v jakém je uloží server (jinak by formulář
    // po uložení vypadal pořád jako neuložený)
    const automation = {
      emailSettings: serializeEmailSettings(parseEmailSettings(form.emailSettings)),
      locks: JSON.stringify(parseLocks(form.locks)),
    };
    const sent =
      withDocs.termsText === form.termsText &&
      withDocs.privacyText === form.privacyText &&
      automation.emailSettings === form.emailSettings &&
      automation.locks === form.locks
        ? form
        : { ...withDocs, ...automation };
    if (sent !== form) setForm(sent);
    sentRef.current = JSON.stringify(sent);
    setFailed(false);
    setSite(sent);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    // Potvrzení o novém IČ hned (ukládá se na pozadí); při chybě zmizí
    if (providerChange) setIcoSaved(providerChange);
    const res = await fetch(`/api/sites/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sent),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setIcoSaved(null);
      setSaved(false);
      setFailed(true);
      toast.show(data?.error ?? "Změny se nepodařilo uložit — zkus to znovu.");
      return false;
    }
    window.dispatchEvent(new Event(SITES_CHANGED));
    reload(); // potichu doplní data ze serveru (např. ID nových sezón)
    return true;
  }

  useEffect(() => {
    if (!saveRequested) return;
    setSaveRequested(false);
    save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveRequested]);

  const categories = parseCategories(form?.guestCategories ?? "", form?.pricingMode);
  // Náhled víkendové ceny počítá stejnou funkcí jako ostrý ceník.
  const vikendovaCena = form
    ? applyAdjust(form.pricePerNight, { value: form.weekendValue, unit: form.weekendUnit })
    : 0;

  function setCategory(key: GuestCategory["key"], patch: Partial<GuestCategory>) {
    const next = categories.map((c) => (c.key === key ? { ...c, ...patch } : c));
    set("guestCategories", serializeCategories(next));
  }

  // Neuložené změny formuláře. Fotky a úvod se ukládají hned samy, ty nepočítáme.
  const dirty = useMemo(() => {
    if (!form || !site) return false;
    const pick = ({
      photos,
      heroStyle,
      heroPhoto,
      termsPdf,
      termsName,
      termsUpdatedAt,
      privacyPdf,
      privacyName,
      privacyUpdatedAt,
      geo, // souřadnice dohledává server z adresy
      ...rest
    }: Site) => JSON.stringify(rest);
    return failed || pick(form) !== pick(site);
  }, [form, site, failed]);

  // Potvrzení po návratu z builderu („Změny webu jsou uložené.")
  const toast = useToast();

  // Odchod s neuloženými změnami: odkaz v administraci otevře okno „Uložit / Neukládat /
  // Zůstat“. Zavření nebo obnovení záložky umí hlídat jen prohlížeč sám (jeho dotaz).
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname && a.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(a.pathname + a.search);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  if (loading || !form) return <FormPageSkeleton label="Načítám web" />;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    // pb-20: plovoucí „Uložit změny“ nesmí zakrýt poslední pole
    <div className="space-y-5 pb-20" onKeyDown={submitOnEnter(save)}>
      {toast.node}
      <SaveBar dirty={dirty} saved={saved} onSave={save} />
      {leaveTo && (
        <LeaveDialog
          onSave={async () => {
            if (await save()) router.push(leaveTo);
            setLeaveTo(null);
          }}
          onDiscard={() => {
            const to = leaveTo;
            setLeaveTo(null);
            router.push(to);
          }}
          onStay={() => setLeaveTo(null)}
        />
      )}
      {icoSaved && <ProviderSavedDialog change={icoSaved} onClose={() => setIcoSaved(null)} />}
      {!widgetPage && !widgetOnly && <LivePreview site={form} dirty={dirty} focus={focus} />}
      {widgetPage ? (
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex flex-wrap items-center">
            Widget na web
            <HelpTip>Rezervace na tvém vlastním webu — plovoucí tlačítko, nebo sekce přímo ve stránce.</HelpTip>
          </h1>
        </div>
      ) : (
      <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex flex-wrap items-center">
            Nastavení
            <HelpTip>Ceny a pravidla pobytu, údaje o firmě, platby, dokumenty a e-maily hostům.</HelpTip>
          </h1>
        </div>
        <Link href="/admin/nastaveni/nemovitosti" className="btn-ghost !px-4 !py-2 text-sm">
          Spravovat nemovitosti →
        </Link>
      </div>

      <div className="flex items-stretch gap-2">
        {/* Na mobilu se hlavní záložky posouvají do strany (všechny se nevejdou) */}
        <div
          className="flex min-w-0 flex-1 rounded-2xl border border-line bg-bg p-1 max-sm:overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
          role="tablist"
          aria-label="Části nastavení"
        >
          {mainTabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => switchTab(t)}
              className={`min-w-0 flex-1 rounded-xl px-2 py-2.5 text-left transition max-sm:flex-none max-sm:px-3 max-sm:text-center sm:px-4 ${
                MOBILE_MORE.includes(t) ? "max-sm:hidden" : ""
              } ${tab === t ? "bg-surface shadow-sm" : "hover:bg-surface/50"}`}
            >
              <span className={`block text-sm font-semibold ${tab === t ? "text-ink" : "text-soft"}`}>
                <span className="whitespace-nowrap sm:hidden">{TABS[t].short}</span>
                <span className="hidden sm:inline">{TABS[t].label}</span>
              </span>
              <span className="hidden text-xs text-soft sm:block">{TABS[t].hint}</span>
            </button>
          ))}
        </div>
        {/* Méně časté části — vpravo, oddělené */}
        <MoreTabs tabs={moreTabs} mobileTabs={mainTabs.filter((t) => MOBILE_MORE.includes(t))} current={tab} onPick={switchTab} />
      </div>
      </>
      )}

      {tab === "zakladni" ? (
        <div id="pole-kontakt" className="scroll-mt-24 space-y-4 rounded-2xl border border-line bg-surface p-5">
          <div>
            <h2 className="font-display text-lg font-semibold flex flex-wrap items-center">
              Název a kontakt
              <HelpTip>Jak se ubytování jmenuje a jak se ti hosté ozvou — ukáže se na webu, v rezervacích i e-mailech.</HelpTip>
            </h2>
          </div>
          <label className="block" {...watch("uvod")}>
            <span className="mb-1.5 block text-sm font-medium">Název</span>
            <input
              className="field"
              placeholder="Chata Meduňka"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2" {...watch("o-miste")}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Kontaktní e-mail</span>
              <input
                className="field"
                type="email"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Telefon</span>
              <input
                className="field"
                type="tel"
                value={form.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </label>
          </div>
        </div>
      ) : tab === "pravni" ? (
        <>
          <LegalSettings
            form={form}
            saved={site ?? form}
            set={set}
            setDoc={setDoc}
            toast={toast}
            requestSave={() => setSaveRequested(true)}
          />
        </>
      ) : tab === "domena" ? (
        <div className="space-y-4">
        <BookingMode form={form} />
        {!widgetOnly && <DomainSettings
          slug={slug ?? form.slug}
          domain={form.customDomain}
          status={form.domainStatus}
          onChange={(patch) => {
            // Doménu ukládá API samo — tady ji jen propíšeme do dat administrace
            setSite((s) => (s ? { ...s, ...patch } : s));
            setForm((f) => (f ? { ...f, ...patch } : f));
          }}
        />}
        </div>
      ) : tab === "portaly" ? (
        <ExternalCalendars />
      ) : tab === "automatizace" ? (
        <AutomationSettings form={form} set={set} />
      ) : tab === "widget" ? (
        <WidgetSettings form={form} set={set} />
      ) : (
        <>
          {/* Ceník */}
          <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
            <div>
              <h2 className="font-display text-lg font-semibold flex flex-wrap items-center">
                Ceník
                <HelpTip>Cena se počítá noc po noci — procenta víkendu a sezón se sčítají.</HelpTip>
              </h2>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium">Jak účtuješ cenu?</span>
              <div className="flex gap-2">
                {(
                  [
                    ["unit", "Za celou nemovitost / noc"],
                    ["person", "Za osobu / noc"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set("pricingMode", mode)}
                    className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      form.pricingMode === mode
                        ? "border-pine bg-pine/5 text-ink ring-2 ring-pine/20"
                        : "border-line text-soft hover:border-pine/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  Základní cena / noc {form.pricingMode === "person" && <span className="text-soft">(za osobu)</span>}
                </span>
                <NumberField
                  className="field"
                  value={form.pricePerNight}
                  onChange={(v) => set("pricePerNight", v)}
                />
              </label>
              <AdjustField
                label="Víkend (pá–ne)"
                value={{ value: form.weekendValue, unit: form.weekendUnit }}
                onChange={(a) => {
                  set("weekendValue", a.value);
                  set("weekendUnit", a.unit);
                }}
              />
            </div>

            <p className="rounded-xl bg-bg px-4 py-2.5 text-sm text-soft">
              Všední noc: <strong className="text-ink">{czk(form.pricePerNight)}</strong> · Víkendová noc:{" "}
              <strong className="text-ink">{czk(vikendovaCena)}</strong>
              {form.pricingMode === "person" && " (za osobu)"}
            </p>

            {/* Sezónní období */}
            <div>
              <span className="mb-1.5 block text-sm font-medium">Sezónní období</span>
              <div className="space-y-2">
                {form.priceRules.map((r, i) => (
                  <div key={r.id ?? i} className="space-y-2 rounded-xl border border-line p-3">
                    <div className="flex items-end gap-2">
                      <label className="block min-w-0 flex-1">
                        <span className="mb-1 block text-xs text-soft">Název</span>
                        <input
                          className="field !py-2 text-sm"
                          placeholder="např. Hlavní sezóna"
                          value={r.label}
                          onChange={(e) => setRule(i, { label: e.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        className="mb-2 shrink-0 text-soft transition hover:text-coral"
                        title="Smazat období"
                        aria-label={`Smazat období ${r.label}`}
                        onClick={() =>
                          setForm((f) => (f ? { ...f, priceRules: f.priceRules.filter((_, j) => j !== i) } : f))
                        }
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block min-w-0">
                        <span className="mb-1 block text-xs text-soft">Od</span>
                        <input
                          className="field !px-2.5 !py-2 text-sm"
                          type="date"
                          value={r.startDate.slice(0, 10)}
                          onChange={(e) => setRule(i, { startDate: e.target.value })}
                        />
                      </label>
                      <label className="block min-w-0">
                        <span className="mb-1 block text-xs text-soft">Do (včetně)</span>
                        <input
                          className="field !px-2.5 !py-2 text-sm"
                          type="date"
                          value={r.endDate.slice(0, 10)}
                          onChange={(e) => setRule(i, { endDate: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="max-w-56">
                      <AdjustField
                        compact
                        label="Úprava ceny"
                        value={{ value: r.value, unit: r.unit }}
                        onChange={(a) => setRule(i, { value: a.value, unit: a.unit })}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn-ghost mt-2 !px-4 !py-2 text-sm"
                onClick={() =>
                  setForm((f) => {
                    if (!f) return f;
                    const today = new Date();
                    const iso = (d: Date) => d.toISOString().slice(0, 10);
                    const in30 = new Date(today.getTime() + 30 * 86_400_000);
                    return {
                      ...f,
                      priceRules: [
                        ...f.priceRules,
                        {
                          label: "Nové období",
                          startDate: iso(today),
                          endDate: iso(in30),
                          value: 10,
                          unit: "pct" as const,
                        },
                      ],
                    };
                  })
                }
              >
                + Přidat období
              </button>
              <p className="mt-2 text-xs text-soft">
                Procenta cenu upravují (kladná zvyšují, záporná fungují jako sleva), koruny nastaví pevnou cenu noci.
                Pevná cena přebíjí procenta i víkend.
              </p>
            </div>
          </div>

          {/* Skladba hostů */}
          <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
            <div>
              <h2 className="font-display text-lg font-semibold flex flex-wrap items-center">
                Skladba hostů
                <HelpTip>Buď se hosté nedělí a host zadá jen počet osob, nebo si vybere po kategoriích a každá může mít vlastní
                cenu.</HelpTip>
              </h2>
            </div>

            <div id="pole-luzka" className="scroll-mt-24 rounded-xl">
              <SleepingField
                value={form.sleeping}
                onChange={(v) => set("sleeping", v)}
                maxGuests={form.maxGuests}
                onMaxGuests={(n) => set("maxGuests", n)}
              />
            </div>

            <label className="block sm:max-w-48">
              <span className="mb-1.5 block text-sm font-medium">Maximální počet hostů</span>
              <NumberField
                className="field"
                value={form.maxGuests}
                onChange={(v) => set("maxGuests", v)}
              />
            </label>

            <div className="flex gap-2">
              {(
                [
                  ["total", "Jen počet osob"],
                  ["split", "Rozdělit kategorie"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set("guestMode", mode)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                    form.guestMode === mode
                      ? "border-pine bg-pine/5 text-ink ring-2 ring-pine/20"
                      : "border-line text-soft hover:border-pine/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {form.guestMode === "split" && (
              <div className="space-y-2">
                {categories.map((c) => (
                  <div
                    key={c.key}
                    className={`space-y-3 rounded-xl border p-3.5 transition ${
                      c.enabled ? "border-line" : "border-line/60 bg-bg/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="accent-[var(--pine)]"
                        checked={c.enabled}
                        aria-label={`Nabízet kategorii ${c.label}`}
                        onChange={(e) => setCategory(c.key, { enabled: e.target.checked })}
                      />
                      <input
                        className="field min-w-0 flex-1 !py-2 text-sm"
                        aria-label={`Název kategorie ${c.label}`}
                        value={c.label}
                        onChange={(e) => setCategory(c.key, { label: e.target.value })}
                      />
                    </div>

                    {c.enabled && (
                      <>
                        <div className="max-w-56">
                          <AdjustField
                            compact
                            label={form.pricingMode === "person" ? "Cena za noc" : "Příplatek za noc"}
                            value={c.adjust}
                            onChange={(adjust) => setCategory(c.key, { adjust })}
                          />
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-soft">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              className="accent-[var(--pine)]"
                              checked={c.capacity}
                              onChange={(e) => setCategory(c.key, { capacity: e.target.checked })}
                            />
                            počítá se do kapacity
                          </label>
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              className="accent-[var(--pine)]"
                              checked={c.tax}
                              onChange={(e) => setCategory(c.key, { tax: e.target.checked })}
                            />
                            platí poplatek z pobytu
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <p className="text-xs text-soft">
                  {form.pricingMode === "person"
                    ? "Procenta se počítají z ceny za dospělou osobu (−50 % = poloviční cena), koruny nastaví pevnou cenu za osobu a noc."
                    : "Procenta se počítají z ceny za nemovitost, koruny jsou pevný příplatek za osobu a noc. Nula = v ceně."}{" "}
                  Poplatek z pobytu ze zákona neplatí osoby do 18 let.
                </p>
              </div>
            )}
          </div>

          {/* Pravidla pobytu a poplatky */}
          <div id="pole-pravidla" className="scroll-mt-24 space-y-4 rounded-2xl border border-line bg-surface p-5">
            <div>
              <h2 className="font-display text-lg font-semibold flex flex-wrap items-center">
                Pravidla pobytu a poplatky
                <HelpTip>Podle tohohle nastavení hosté vidí konečnou cenu a nemůžou rezervovat termín, který ti nevyhovuje.</HelpTip>
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Nejkratší pobyt (nocí)</span>
                <NumberField
                  className="field"
                  value={form.minNights}
                  onChange={(v) => set("minNights", v)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Rezervovat nejdříve (dní předem)</span>
                <NumberField
                  className="field"
                  value={form.leadTimeDays}
                  onChange={(v) => set("leadTimeDays", v)}
                />
              </label>
              <label id="pole-casy" className="block scroll-mt-24 rounded-xl">
                <span className="mb-1.5 block text-sm font-medium">Check-in (příjezd od)</span>
                <input
                  className={`field field-time ${isTime(form.checkInTime) ? "" : "!border-coral"}`}
                  type="time"
                  required
                  value={form.checkInTime}
                  onChange={(e) => set("checkInTime", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Check-out (odjezd do)</span>
                <input
                  className={`field field-time ${isTime(form.checkOutTime) ? "" : "!border-coral"}`}
                  type="time"
                  required
                  value={form.checkOutTime}
                  onChange={(e) => set("checkOutTime", e.target.value)}
                />
              </label>
              <p className="-mt-1 text-xs text-soft sm:col-span-2">
                Platí pro nové rezervace. U jednotlivé rezervace čas změníš v jejím detailu v kalendáři.
              </p>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Úklidový poplatek (Kč za pobyt)</span>
                <NumberField
                  className="field"
                  value={form.cleaningFee}
                  onChange={(v) => set("cleaningFee", v)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Poplatek z pobytu (Kč / osoba / noc)</span>
                <NumberField
                  className="field"
                  value={form.touristTax}
                  onChange={(v) => set("touristTax", v)}
                />
                <span className="mt-1 block text-xs text-soft">Sazbu určuje obec vyhláškou — nejvýš 50 Kč.</span>
              </label>
              {slug && (
                <TaxSourceCard
                  slug={slug}
                  address={site?.arrivalAddress ?? ""}
                  taxSource={form.taxSource}
                  touristTax={form.touristTax}
                  taxPeriod={form.taxPeriod}
                  // Výsledek hledání se ukládá na serveru hned — ve formuláři není neuloženou změnou
                  onSource={(taxSource, touristTax) => {
                    // Server mohl doplnit sazbu (jen když byla 0) — uložené, ne neuložená změna
                    const fill = form.touristTax === 0 && site?.touristTax === 0 ? { touristTax } : {};
                    setForm((f) => (f ? { ...f, taxSource, ...fill } : f));
                    setSite((s) => (s ? { ...s, taxSource, ...fill } : s));
                  }}
                  onRate={(v) => set("touristTax", v)}
                  onPeriod={(v) => set("taxPeriod", v)}
                />
              )}
            </div>

            <CancellationField
              value={form.cancellationPolicy}
              onChange={(v) => set("cancellationPolicy", v)}
              onTerms={() => {
                switchTab("pravni");
                const url = new URL(window.location.href);
                url.searchParams.set("pole", "dokumenty");
                window.history.replaceState(null, "", url);
                window.setTimeout(() => document.getElementById("pole-dokumenty")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Plovoucí „Uložit změny“ dole na obrazovce — ukáže se, jakmile je co ukládat
 * (na mobilu vlevo nad navigací, vpravo je tlačítko náhledu webu).
 */
/**
 * Storno podmínky. Bez vlastního textu ukazuje výchozí znění jako skutečný text
 * (to platí v obchodních podmínkách) — po úpravě se uloží verze majitele.
 */
function CancellationField({ value, onChange, onTerms }: { value: string; onChange: (v: string) => void; onTerms: () => void }) {
  // Během psaní držíme text tak, jak je — i prázdný, ať jde začít úplně od nuly
  const [draft, setDraft] = useState<string | null>(null);
  const usingDefault = draft === null && !value.trim();
  const shown = draft ?? (usingDefault ? DEFAULT_CANCELLATION : value);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="storno" className="text-sm font-medium">
          Storno podmínky
        </label>
        {usingDefault ? (
          <span className="rounded-full bg-pine/10 px-2 py-0.5 text-[11px] font-semibold text-pine">Výchozí znění</span>
        ) : (
          <button type="button" className="text-xs font-medium text-pine hover:underline" onClick={() => (setDraft(null), onChange(""))}>
            Obnovit výchozí
          </button>
        )}
      </div>
      <textarea
        id="storno"
        className="field min-h-44 sm:min-h-32"
        rows={5}
        value={shown}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          onChange(v.trim() === DEFAULT_CANCELLATION ? "" : v);
        }}
        onBlur={() => setDraft(null)}
      />
      <p className="text-xs text-soft">
        {usingDefault ? "Platí, dokud ho neupravíš. " : ""}Hosté storno podmínky uvidí v obchodních podmínkách.{" "}
        <button type="button" className="font-medium text-pine hover:underline" onClick={onTerms}>
          Podrobněji je rozvedeš v obchodních podmínkách →
        </button>
      </p>
    </div>
  );
}

function SaveBar({ dirty, saved, onSave }: { dirty: boolean; saved: boolean; onSave: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || (!dirty && !saved)) return null;
  // Do <body>: předek s CSS transformací by jinak rozbil `fixed`.
  return createPortal(
    <div className="rise fixed bottom-28 left-5 z-40 sm:bottom-8 sm:left-1/2 sm:-translate-x-1/2">
      {dirty ? (
        <div className="flex items-center gap-3 rounded-full bg-surface py-1.5 pl-4 pr-1.5 shadow-xl ring-1 ring-line">
          <span className="hidden items-center gap-2 text-sm text-soft sm:flex">
            <span className="h-2 w-2 rounded-full bg-amber" aria-hidden />
            Neuložené změny
          </span>
          <span className="h-2 w-2 rounded-full bg-amber sm:hidden" aria-hidden />
          <button type="button" className="btn-primary !px-5 !py-2 text-sm" onClick={onSave}>
            Uložit změny
          </button>
        </div>
      ) : (
        <div className="rounded-full bg-pine px-5 py-2.5 text-sm font-semibold text-white shadow-xl">✓ Uloženo</div>
      )}
    </div>,
    document.body,
  );
}

/** Odchod ze stránky s neuloženými změnami: uložit, neukládat, nebo zůstat. */
function LeaveDialog({
  onSave,
  onDiscard,
  onStay,
}: {
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    saveRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onStay();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onStay]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onStay}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Máš neuložené změny"
        className="rise w-full max-w-sm rounded-t-3xl bg-surface p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-semibold">Máš neuložené změny</h2>
        <p className="mt-2 text-sm text-soft">Chceš je před odchodem uložit?</p>
        <div className="mt-5 space-y-2">
          <button
            ref={saveRef}
            type="button"
            className="btn-primary w-full !py-2.5"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSave();
              setSaving(false);
            }}
          >
            {saving ? "Ukládám…" : "Uložit a odejít"}
          </button>
          <button type="button" className="btn-ghost w-full !py-2.5 !text-coral" disabled={saving} onClick={onDiscard}>
            Odejít bez uložení
          </button>
          <button
            type="button"
            className="w-full py-2 text-sm font-medium text-soft hover:text-ink"
            disabled={saving}
            onClick={onStay}
          >
            Zůstat na stránce
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Záložka „Další ▾“ vpravo: méně časté části nastavení (teď Externí rezervace). */
function MoreTabs({
  tabs,
  mobileTabs = [],
  current,
  onPick,
}: {
  tabs: Tab[];
  /** Hlavní záložky, které se na telefonu nevejdou do řádku — v menu jen tam */
  mobileTabs?: Tab[];
  current: Tab;
  onPick: (t: Tab) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const active = tabs.includes(current);
  const activeMobile = active || mobileTabs.includes(current);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-full items-center gap-1.5 rounded-2xl border border-line px-3 text-sm font-semibold transition sm:px-4 ${
          activeMobile ? "max-sm:bg-surface max-sm:text-ink max-sm:shadow-sm" : "max-sm:bg-bg max-sm:text-soft"
        } ${active ? "sm:bg-surface sm:text-ink sm:shadow-sm" : "sm:bg-bg sm:text-soft sm:hover:text-ink"}`}
      >
        <span className="max-w-[9rem] truncate sm:hidden">{activeMobile ? TABS[current].short : "Další"}</span>
        <span className="max-w-[9rem] truncate max-sm:hidden">{active ? TABS[current].label : "Další"}</span>
        <span aria-hidden className={`text-xs transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
          {[...mobileTabs, ...tabs].map((t) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(t);
              }}
              className={`block w-full rounded-xl px-3 py-2 text-left transition hover:bg-bg ${current === t ? "bg-bg" : ""} ${
                mobileTabs.includes(t) ? "sm:hidden" : ""
              }`}
            >
              <span className="block text-sm font-semibold">{TABS[t].label}</span>
              <span className="block text-xs text-soft">{TABS[t].hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
