"use client";

import { useState } from "react";
import { NumberField } from "@/components/NumberField";
import { Icon } from "@/components/Icon";
import { THEMES, themeHex } from "@/lib/theme";
import { ThemePicker } from "@/components/ThemePicker";
import { czk } from "@/lib/pricing";
import { GiftVoucherCard } from "@/components/GiftVoucherCard";
import { GIFT_TEMPLATES, VALID_MONTHS, WEEKEND_NIGHTS, defaultGift, giftHeadline, type GiftDesign } from "@/lib/gift";

// Průvodce dárkovým poukazem: jedna otázka na obrazovku, velké volby, poukaz
// se skládá v malém náhledu nahoře. Celý krok se vejde na obrazovku a tlačítka
// jsou dole vždy na stejném místě. Poslední krok = náhled a zveřejnění.

const STEPS = ["Co darovat", "Cena", "Vzhled", "Věnování", "Hotovo"];

const big = (on: boolean) =>
  `flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition ${on ? "border-pine bg-pine/5" : "border-line bg-surface hover:border-pine/40"}`;

type Props = {
  initial?: GiftDesign | null;
  siteName: string;
  /** Fotky webu pro vzhled „Fotka“. */
  photos: string[];
  /** Cena běžné víkendové noci podle ceníku pro daný počet osob. */
  nightPrice: (persons: number) => number;
  /** Uloží poukaz; vrací chybovou hlášku, nebo null. */
  onSave: (d: GiftDesign, onSale: boolean) => Promise<string | null>;
  fill?: boolean;
};

export function GiftVoucherWizard({ initial, siteName, photos, nightPrice, onSave, fill = false }: Props) {
  const [d, setD] = useState<GiftDesign>(() => initial ?? defaultGift(photos[0] ?? ""));
  const [step, setStep] = useState(initial ? STEPS.length - 1 : 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof GiftDesign>(k: K, v: GiftDesign[K]) => setD((x) => ({ ...x, [k]: v }));
  const last = step === STEPS.length - 1;
  const suggested = (persons: number) => WEEKEND_NIGHTS * nightPrice(persons);

  async function save(onSale: boolean) {
    setSaving(true);
    setError("");
    const err = await onSave(d, onSale);
    setSaving(false);
    if (err) setError(err);
  }

  return (
    // fill = v okně přes celou obrazovku: tlačítka dole na pevném místě, ať při přechodu mezi kroky neposkakují
    <div className={`mx-auto flex max-w-2xl flex-col ${fill ? "min-h-[calc(100dvh-6.9rem)]" : ""}`}>
      {/* Postup */}
      <ol className="flex gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button type="button" onClick={() => setStep(i)} className="block w-full text-left">
              <span className={`block h-1.5 rounded-full ${i <= step ? "bg-pine" : "bg-line"}`} />
              <span className={`mt-1.5 hidden text-xs font-medium sm:block ${i === step ? "text-ink" : "text-soft"}`}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      {!last && (
        <div className={`mx-auto mt-5 ${step === 0 ? "w-56 sm:w-64" : "w-40 sm:w-48"}`}>
          <GiftVoucherCard d={d} site={siteName} />
        </div>
      )}

      <div className={step === 0 ? "mt-8" : "mt-5 sm:mt-6"}>
        {step === 0 && (
          <Question title="Co chceš lidem nabídnout k darování?">
            <button type="button" className={big(d.kind === "value")} onClick={() => setD((x) => ({ ...x, kind: "value", price: x.value }))}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pine/10 text-pine"><Icon name="ticket" size={22} /></span>
              <span>
                <span className="block font-semibold">Částku na pobyt</span>
                <span className="block text-sm text-soft">Obdarovaný si vybere termín i délku, poukaz uplatní jako slevu.</span>
              </span>
            </button>
            <button type="button" className={big(d.kind === "weekend")} onClick={() => setD((x) => ({ ...x, kind: "weekend", price: x.kind === "weekend" ? x.price : suggested(x.persons) }))}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pine/10 text-pine"><Icon name="bed" size={22} /></span>
              <span>
                <span className="block font-semibold">Víkend</span>
                <span className="block text-sm text-soft">
                  Třeba „Víkend pro dva“ — 2 noci pátek–neděle. Obdarovaný si vybere víkend; v dražším období (Vánoce, sezóna) při rezervaci doplatí
                  rozdíl.
                </span>
              </span>
            </button>
          </Question>
        )}

        {step === 1 && (
          <Question title={d.kind === "value" ? "Na jakou částku?" : "Pro kolik osob a za kolik?"}>
            {d.kind === "value" ? (
              <div className="grid grid-cols-2 gap-3">
                {[2000, 3000, 5000, 10000].map((v) => (
                  <button key={v} type="button" className={`${big(d.value === v)} justify-center !py-5 font-display text-2xl font-semibold`} onClick={() => setD((x) => ({ ...x, value: v, price: v }))}>
                    {czk(v)}
                  </button>
                ))}
                <label className="col-span-2 flex items-center justify-center gap-3 text-sm text-soft">
                  nebo jiná částka
                  <NumberField className="field !w-32 !py-2" value={d.value} onChange={(v) => setD((x) => ({ ...x, value: v, price: v }))} />
                  Kč
                </label>
              </div>
            ) : (
              <WeekendPicker d={d} setD={setD} suggested={suggested} night={nightPrice} />
            )}
          </Question>
        )}

        {step === 2 && (
          <Question title="Jak má poukaz vypadat?">
            {/* Vše na jedné obrazovce: čtyři vzhledy v řadě (telefon 2 × 2), pod nimi barva */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GIFT_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-label={t.label}
                  onClick={() => set("template", t.key)}
                  className={`rounded-xl border-2 p-1.5 text-left transition ${d.template === t.key ? "border-pine bg-pine/5" : "border-transparent hover:border-line"}`}
                >
                  <div className="pointer-events-none">
                    <GiftVoucherCard d={{ ...d, template: t.key }} site={siteName} />
                  </div>
                  <span className="mt-1 block text-center text-xs font-semibold">{t.label}</span>
                </button>
              ))}
            </div>
            <ColorPicker value={d.color} onChange={(c) => set("color", c)} />
            {d.template === "fotka" &&
              (photos.length ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {photos.slice(0, 8).map((p) => (
                    <button key={p} type="button" onClick={() => set("photo", p)} className={`relative h-11 w-16 overflow-hidden rounded-lg ${d.photo === p ? "ring-2 ring-pine ring-offset-2" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-soft">Web zatím nemá fotky — přidej je v Můj web.</p>
              ))}
          </Question>
        )}

        {step === 3 && (
          <Question title="Co na poukazu bude napsáno?">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-soft">Nadpis</span>
              <input className="field" placeholder={giftHeadline({ ...d, headline: "" })} maxLength={60} value={d.headline} onChange={(e) => set("headline", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-soft">Text pro obdarovaného</span>
              <textarea className="field min-h-16" rows={2} maxLength={240} value={d.message} onChange={(e) => set("message", e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {["Na pobyt, kdy se vám to bude hodit.", "Všechno nejlepší! Užijte si klid u nás.", "Pro dva, na chvíli jen pro sebe."].map((t) => (
                <button key={t} type="button" className="rounded-full border border-line bg-surface px-3 py-1 text-xs hover:border-pine/40 sm:text-sm" onClick={() => set("message", t)}>
                  {t}
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-bg px-4 py-3 text-sm">
              Platnost od nákupu
              <span className="flex gap-1.5">
                {VALID_MONTHS.map((m) => (
                  <button key={m} type="button" onClick={() => set("validMonths", m)} className={`rounded-full px-3 py-1 font-semibold ${d.validMonths === m ? "bg-pine text-white" : "bg-surface"}`}>
                    {m} měs.
                  </button>
                ))}
              </span>
            </label>
          </Question>
        )}

        {last && (
          <div className="space-y-4 text-center">
            <h2 className="font-display text-2xl font-semibold">Takhle ho dostane kupující</h2>
            <div className="mx-auto max-w-md">
              <GiftVoucherCard d={d} site={siteName} />
            </div>
            <p className="text-soft">
              Na webu za <strong className="text-ink">{czk(d.price)}</strong>
              {d.kind === "weekend" && " · víkend pá–ne, v dražším období doplatek"} · platí {d.validMonths} měsíců · kupující zaplatí QR kódem a po
              potvrzení platby mu přijde poukaz e-mailem.
            </p>
            {error && (
              <p className="text-sm text-coral" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between pt-6 sm:pt-8">
        <button type="button" className={`text-sm font-medium text-soft hover:text-ink ${step ? "" : "invisible"}`} onClick={() => setStep((s) => s - 1)}>
          ← Zpět
        </button>
        {last ? (
          <span className="flex items-center gap-3">
            <button type="button" className="text-sm font-medium text-soft hover:text-ink" disabled={saving} onClick={() => save(false)}>
              Uložit bez zveřejnění
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={() => save(true)}>
              {saving ? "Ukládám…" : "Zveřejnit na webu"}
            </button>
          </span>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setStep((s) => s + 1)}>
            Pokračovat →
          </button>
        )}
      </div>
    </div>
  );
}

function WeekendPicker({
  d,
  setD,
  suggested,
  night,
}: {
  d: GiftDesign;
  setD: React.Dispatch<React.SetStateAction<GiftDesign>>;
  suggested: (persons: number) => number;
  night: (persons: number) => number;
}) {
  const now = suggested(d.persons);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4">
        <div className="text-sm">
          <p className="font-medium">Víkend · 2 noci</p>
          <p className="text-soft">příjezd v pátek, odjezd v neděli (pátek→sobota, sobota→neděle)</p>
        </div>
        <Counter
          label="Osob"
          value={d.persons}
          // Cena jde s počtem osob, dokud ji majitel nezměnil ručně
          onChange={(v) => setD((x) => ({ ...x, persons: v, price: x.price === suggested(x.persons) ? suggested(v) : x.price }))}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="text-sm">
          <p className="font-medium">Cena poukazu za celý víkend</p>
          <p className="text-soft">
            Podle ceníku: 2 noci × {czk(night(d.persons))} = {czk(now)}
            {d.price !== now && (
              <>
                {" · "}
                <button type="button" className="font-semibold text-pine hover:underline" onClick={() => setD((x) => ({ ...x, price: now }))}>
                  Použít
                </button>
              </>
            )}
          </p>
        </div>
        <label className="flex items-center gap-2">
          <NumberField className="field !w-32 text-center" value={d.price} onChange={(v) => setD((x) => ({ ...x, price: v }))} />
          Kč
        </label>
      </div>
      <p className="flex items-start gap-2.5 rounded-xl bg-pine/5 px-4 py-3 text-sm text-soft">
        <Icon name="calendar" size={16} className="mt-0.5 shrink-0 text-pine" />
        Obdarovaný si při rezervaci vybere libovolný volný termín a poukaz se odečte z ceny. Když vybere dražší termín (Vánoce, Silvestr, hlavní
        sezóna), doplatí rozdíl.
      </p>
    </div>
  );
}

/** Barva poukazu — stejný výběr jako barva webu (předvolby, vlastní barva, kód, kontrast). */
function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const key = THEMES.find((t) => t.hex === value)?.key ?? value;
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="pt-1 text-sm font-medium">Barva</p>
      <div className="min-w-0 flex-1">
        <ThemePicker compact value={key} onChange={(v) => onChange(themeHex(v))} />
      </div>
    </div>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-center font-display text-2xl font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="text-center">
      <span className="mb-1 block text-xs font-medium text-soft">{label}</span>
      <div className="flex items-center justify-center gap-2">
        <button type="button" className="h-9 w-9 rounded-full border border-line text-lg" onClick={() => onChange(Math.max(1, value - 1))}>
          −
        </button>
        <span className="w-6 font-display text-2xl font-semibold">{value}</span>
        <button type="button" className="h-9 w-9 rounded-full border border-line text-lg" onClick={() => onChange(Math.min(20, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}
