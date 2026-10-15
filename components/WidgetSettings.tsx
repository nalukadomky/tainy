"use client";

import { useEffect, useMemo, useState } from "react";
import type { Site } from "@/lib/admin";
import { parseWidgetSettings, serializeWidgetSettings, widgetSnippet, type WidgetSettings as Settings } from "@/lib/widget";
import { themeHex } from "@/lib/theme";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { ThemePicker } from "@/components/ThemePicker";
import Link from "next/link";

// Nastavení → Widget na web: pro majitele, kteří mají vlastní web a chtějí
// jen rezervace. Vzhled plovoucího tlačítka, živý náhled a kód k vložení.

type SetField = <K extends keyof Site>(key: K, value: Site[K]) => void;

const GUIDES = [
  { name: "WordPress", text: "Vzhled → Editor motivu nebo plugin „Insert Headers and Footers“ → vlož kód do patičky (Footer)." },
  { name: "Webnode", text: "Nastavení webu → Hlavička a patička (HTML) → vlož kód do patičky. Funguje v placených tarifech." },
  { name: "Wix", text: "Nastavení → Vlastní kód → Přidat vlastní kód → vlož kód, umístění „Body – konec“, všechny stránky." },
  { name: "Squarespace", text: "Nastavení → Pokročilé → Vkládání kódu → vlož kód do pole Footer." },
  { name: "Vlastní web", text: "Vlož kód do HTML před značku </body>. Stačí jednou, tlačítko se pak ukáže na všech stránkách." },
];

const POSITIONS: { value: Settings["position"]; label: string }[] = [
  { value: "right", label: "Vpravo dole" },
  { value: "left", label: "Vlevo dole" },
];

export function WidgetSettings({ form, set }: { form: Site; set: SetField }) {
  const settings = useMemo(() => parseWidgetSettings(form.widgetSettings), [form.widgetSettings]);
  const update = (patch: Partial<Settings>) => set("widgetSettings", serializeWidgetSettings({ ...settings, ...patch }));
  // Rozepsaný text tlačítka (prázdné pole se uloží jako výchozí „Rezervovat“)
  const [label, setLabel] = useState(settings.label);
  const color = themeHex(form.themeColor);
  const toast = useToast();
  // Po založení účtu jen s widgetem (?vitej=1) — co udělat jako první
  const [welcome, setWelcome] = useState(false);
  useEffect(() => setWelcome(new URLSearchParams(window.location.search).get("vitej") === "1"), []);

  const [origin, setOrigin] = useState("https://tainy.cz");
  useEffect(() => setOrigin(window.location.origin), []);
  const section = settings.mode === "section";
  const snippet = widgetSnippet(origin, form.slug, settings.mode);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      toast.show("Kód je zkopírovaný — vlož ho do svého webu.", "success");
    } catch {
      toast.show("Kód se nepodařilo zkopírovat, označ ho a zkopíruj ručně.");
    }
  }

  const mail = `mailto:?subject=${encodeURIComponent(`Rezervace na web – ${form.name}`)}&body=${encodeURIComponent(
    `Ahoj,\n\nprosím o vložení rezervačního tlačítka na náš web. Stačí vložit tenhle kód na všechny stránky před značku </body>:\n\n${snippet}\n\nVlastní tlačítka nebo odkazy webu otevřou rezervaci atributem data-tainy-open, např. <a href="#" data-tainy-open>Rezervovat</a>.\n\nDíky!`
  )}`;

  return (
    <div className="space-y-4">
      {toast.node}
      {welcome && (
        <div className="rise rounded-2xl border border-pine/20 bg-pine/5 p-5">
          <h2 className="font-display text-xl font-semibold">
            <Icon name="sparkle" size={20} className="mr-1.5 text-pine" />
            Účet je připravený!
          </h2>
          <p className="mt-1 text-sm text-soft">
            Zkopíruj kód níž a vlož ho na svůj web. Než přijmeš první rezervaci, doplň ještě pravidla pobytu, údaje o firmě a účet pro
            platby.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/nastaveni?sekce=cenik" className="btn-ghost !px-4 !py-2 text-sm">
              Ceník a pobyt
            </Link>
            <Link href="/admin/nastaveni?sekce=pravni" className="btn-ghost !px-4 !py-2 text-sm">
              Firma a platby
            </Link>
          </div>
        </div>
      )}
      {form.widgetOnly && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-pine/30 bg-pine/5 p-4 text-sm">
          <Icon name="checkCircle" size={18} className="shrink-0 text-pine" />
          <p className="min-w-0 flex-1">
            <strong className="font-semibold">Používáš jen widget.</strong>{" "}
            <span className="text-soft">Web v tainy je vypnutý — rezervace, poukazy, e-maily i check-in běží dál přes widget.</span>
          </p>
          <Link href="/admin/nastaveni?sekce=domena" className="font-medium text-pine underline underline-offset-2">
            Zapnout web v tainy
          </Link>
        </div>
      )}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold">Rezervace na tvém vlastním webu</h2>
        <p className="mt-1 text-sm text-soft">
          Hosté si rezervují přímo na tvém webu a všechno ostatní — kalendář, platby, e-maily i kódy k zámku — běží dál tady v tainy. Když
          prodáváš dárkové poukazy, přibude i záložka Dárkový poukaz.
        </p>
      </div>

      {/* Plovoucí tlačítko, nebo sekce přímo ve stránce */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="font-semibold">Jak se rezervace ukáže na tvém webu</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Jak se rezervace ukáže">
          {(
            [
              ["button", "Plovoucí tlačítko", "Tlačítko v rohu každé stránky. Po kliknutí se nad webem otevře okno s rezervací."],
              ["section", "Sekce na stránce", "Kalendář s rezervací přímo v obsahu stránky — třeba na stránce Rezervace nebo Ceník."],
            ] as const
          ).map(([value, title, text]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={settings.mode === value}
              onClick={() => update({ mode: value })}
              className={`rounded-2xl border p-3 text-left transition ${
                settings.mode === value ? "border-pine bg-pine/5 ring-1 ring-pine" : "border-line hover:border-pine/40"
              }`}
            >
              <ModeSketch mode={value} color={color} />
              <span className="mt-3 flex items-start gap-3">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${settings.mode === value ? "border-pine" : "border-line"}`}>
                  {settings.mode === value && <span className="h-2.5 w-2.5 rounded-full bg-pine" />}
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-0.5 block text-sm text-soft">{text}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Vzhled a náhled */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          {section && (
            <>
              <h3 className="font-semibold">Sekce</h3>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" checked={settings.gifts} onChange={(e) => update({ gifts: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--pine)]" />
                <span>
                  Záložka Dárkový poukaz
                  <span className="block text-xs text-soft">Ukáže se, když máš poukazy v prodeji.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" checked={settings.floating} onChange={(e) => update({ floating: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--pine)]" />
                <span>
                  K tomu i plovoucí tlačítko
                  <span className="block text-xs text-soft">Na všech stránkách, kam vložíš kód — i tam, kde sekce není.</span>
                </span>
              </label>
            </>
          )}
          {(!section || settings.floating) && (
          <>
          <h3 className={`font-semibold ${section ? "border-t border-line pt-4" : ""}`}>{section ? "Plovoucí tlačítko" : "Tlačítko"}</h3>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Text tlačítka</span>
            <input
              className="control w-full"
              value={label}
              maxLength={30}
              placeholder="Rezervovat"
              onChange={(e) => {
                setLabel(e.target.value);
                update({ label: e.target.value });
              }}
            />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium">Umístění</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Umístění tlačítka">
              {POSITIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.position === p.value}
                  onClick={() => update({ position: p.value })}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                    settings.position === p.value ? "border-pine bg-pine/5 ring-1 ring-pine" : "border-line hover:border-ink/30"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          </>
          )}
          <div>
            <span className="mb-1 block text-sm font-medium">Barva</span>
            {/* Bez webu v tainy se barva vybírá tady (jinak ji určuje web v Můj web → Vzhled) */}
            {form.widgetOnly ? (
              <ThemePicker value={form.themeColor} onChange={(v) => set("themeColor", v)} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-soft">
                <span className="h-5 w-5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: color }} />
                Podle barvy webu v tainy — změníš ji v Můj web → Vzhled.
              </p>
            )}
          </div>
        </div>

        {section ? <SectionPreview slug={form.slug} /> : <WidgetPreview slug={form.slug} label={settings.label} position={settings.position} color={color} />}
      </div>

      {/* Kód */}
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h3 className="font-semibold">Kód pro tvůj web</h3>
          <p className="text-sm text-soft">
            {section
              ? "Vlož ho na stránku do místa, kde má rezervace být — v editoru webu jako blok „HTML“ nebo „Vložit kód“. Nastavení se pak mění tady, kód zůstává stejný."
              : "Vlož ho jednou na všechny stránky webu. Tlačítko a jeho text se pak mění tady, kód zůstává stejný."}
          </p>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-ink px-4 py-3 font-mono text-[13px] leading-relaxed text-white/90">
          {snippet}
        </pre>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="btn-primary !px-4 !py-2 text-sm">
            <Icon name="clipboard" size={15} className="mr-1.5" />
            Zkopírovat kód
          </button>
          <a href={mail} className="btn-ghost !px-4 !py-2 text-sm">
            <Icon name="mail" size={15} className="mr-1.5" />
            Poslat kód webařovi
          </a>
        </div>
      </div>

      {/* Návody */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="font-semibold">Kam kód vložit</h3>
        <div className="mt-2 divide-y divide-line">
          {GUIDES.map((g) => (
            <details key={g.name} className="group py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
                {g.name}
                <Icon name="chevronDown" size={16} className="text-soft transition group-open:rotate-180" />
              </summary>
              <p className="mt-1.5 text-sm text-soft">{g.text}</p>
            </details>
          ))}
          <details className="group py-2.5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
              Pro webaře: vlastní tlačítka a měření
              <Icon name="chevronDown" size={16} className="text-soft transition group-open:rotate-180" />
            </summary>
            <div className="mt-1.5 space-y-2 text-sm text-soft">
              <p>
                Rezervaci otevře i kterýkoli odkaz nebo tlačítko webu s atributem{" "}
                <code className="rounded bg-bg px-1 py-0.5 text-[12px] text-ink">data-tainy-open</code>, případně{" "}
                <code className="rounded bg-bg px-1 py-0.5 text-[12px] text-ink">Tainy.open()</code>. Rovnou na dárkové poukazy:{" "}
                <code className="rounded bg-bg px-1 py-0.5 text-[12px] text-ink">data-tainy-open=&quot;poukaz&quot;</code> nebo{" "}
                <code className="rounded bg-bg px-1 py-0.5 text-[12px] text-ink">Tainy.open(&quot;poukaz&quot;)</code>. Bez plovoucích tlačítek:{" "}
                <code className="rounded bg-bg px-1 py-0.5 text-[12px] text-ink">data-button=&quot;false&quot;</code> na značce skriptu.
              </p>
              <p>
                Po dokončení rezervace přijde na stránku událost{" "}
                <code className="rounded bg-bg px-1 py-0.5 text-[12px] text-ink">tainy:booked</code> a do Google Tag Manageru{" "}
                <code className="rounded bg-bg px-1 py-0.5 text-[12px] text-ink">tainy_booking</code> s cenou — hodí se pro měření konverzí.
              </p>
            </div>
          </details>
        </div>
      </div>

    </div>
  );
}

/** Ukázkový web s plovoucím tlačítkem; po kliknutí se uvnitř otevře skutečná rezervace. */
function WidgetPreview({ slug, label, position, color }: { slug: string; label: string; position: Settings["position"]; color: string }) {
  const [open, setOpen] = useState(false);
  // Křížek v rezervaci (stejně jako na cizím webu) pošle zprávu „zavřít“
  useEffect(() => {
    const onMsg = (e: MessageEvent) => e.origin === window.location.origin && e.data?.type === "tainy:close" && setOpen(false);
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line bg-bg/70 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 flex-1 truncate rounded-md bg-surface px-2.5 py-0.5 text-center text-[11px] text-soft">tvuj-web.cz</span>
      </div>
      <div className="relative h-[420px] overflow-hidden bg-white">
        {/* Zástupný obsah cizího webu */}
        <div className="space-y-4 p-5" aria-hidden>
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-24 rounded bg-black/15" />
            <div className="flex gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-2.5 w-10 rounded bg-black/10" />
              ))}
            </div>
          </div>
          <div className="h-36 rounded-xl bg-gradient-to-br from-black/[0.07] to-black/[0.03]" />
          <div className="h-4 w-2/3 rounded bg-black/15" />
          <div className="space-y-2">
            <div className="h-2.5 w-full rounded bg-black/[0.08]" />
            <div className="h-2.5 w-11/12 rounded bg-black/[0.08]" />
            <div className="h-2.5 w-4/5 rounded bg-black/[0.08]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-black/[0.06]" />
            ))}
          </div>
        </div>

        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`absolute bottom-4 inline-flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 ${
              position === "left" ? "left-4" : "right-4"
            }`}
            style={{ background: color }}
          >
            <Icon name="calendar" size={18} />
            {label}
          </button>
        )}
        {open && (
          <div className="absolute inset-0 flex items-end justify-center bg-[rgba(18,24,20,0.5)] p-3 backdrop-blur-[3px] sm:items-center" onClick={() => setOpen(false)}>
            <div className="relative h-full w-full max-w-sm overflow-hidden rounded-2xl bg-cream shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <iframe src={`/embed/${slug}`} title="Náhled rezervace" className="h-full w-full border-0" />
            </div>
          </div>
        )}
      </div>
      <p className="border-t border-line px-4 py-2.5 text-xs text-soft">
        {open ? (
          <button type="button" onClick={() => setOpen(false)} className="font-medium text-pine hover:underline">
            Zavřít náhled rezervace
          </button>
        ) : (
          "Náhled — klikni na tlačítko a vyzkoušej rezervaci."
        )}
      </p>
    </div>
  );
}

/** Malý náčrt režimu (plovoucí tlačítko / sekce ve stránce) pro výběr. */
function ModeSketch({ mode, color }: { mode: Settings["mode"]; color: string }) {
  return (
    <span className="block overflow-hidden rounded-xl border border-line bg-white" aria-hidden>
      <span className="flex gap-1 border-b border-line px-2.5 py-1.5">
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
        ))}
      </span>
      <span className="relative block h-28 space-y-1.5 p-3">
        <span className="mx-auto block h-1.5 w-1/3 rounded bg-black/10" />
        <span className="mx-auto block h-1 w-1/2 rounded bg-black/[.06]" />
        {mode === "section" ? (
          <span className="mx-auto mt-2 block w-3/4 rounded-md border border-line p-1.5">
            <span className="mb-1 flex h-1.5 overflow-hidden rounded-sm">
              <span className="w-1/4" style={{ background: color }} />
              <span className="flex-1 bg-bg" />
            </span>
            <span className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} className="h-1.5 rounded-sm" style={{ background: i === 8 || i === 9 ? color : [3, 4].includes(i) ? "#ddd3c1" : "#f3efe6" }} />
              ))}
            </span>
          </span>
        ) : (
          <>
            <span className="mt-2 block h-10 rounded-md bg-black/[.04]" />
            <span className="absolute bottom-2.5 right-3 rounded-full px-2.5 py-1 text-[9px] font-semibold text-white" style={{ background: color }}>
              Rezervovat
            </span>
          </>
        )}
      </span>
    </span>
  );
}

/** Náhled sekce: skutečná rezervace vložená do zástupné stránky, výška podle obsahu. */
function SectionPreview({ slug }: { slug: string }) {
  const [height, setHeight] = useState(560);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "tainy:height" && e.data.height > 0) setHeight(e.data.height);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line bg-bg/70 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 flex-1 truncate rounded-md bg-surface px-2.5 py-0.5 text-center text-[11px] text-soft">tvuj-web.cz/rezervace</span>
      </div>
      <div className="max-h-[640px] overflow-y-auto bg-white">
        <div className="space-y-2 p-5 pb-3" aria-hidden>
          <div className="h-4 w-1/3 rounded bg-black/15" />
          <div className="h-2.5 w-2/3 rounded bg-black/[0.08]" />
        </div>
        <iframe src={`/embed/${slug}?inline=1`} title="Náhled sekce s rezervací" scrolling="no" className="block w-full border-0" style={{ height }} />
        <div className="space-y-2 p-5" aria-hidden>
          <div className="h-2.5 w-full rounded bg-black/[0.08]" />
          <div className="h-2.5 w-4/5 rounded bg-black/[0.08]" />
        </div>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-xs text-soft">Náhled — takhle bude rezervace vypadat ve stránce. Dá se v ní rovnou vyzkoušet.</p>
    </div>
  );
}
