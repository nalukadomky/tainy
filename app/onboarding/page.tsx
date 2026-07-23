"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AmenityPicker } from "@/components/AmenityPicker";
import { SiteView, type SiteViewData } from "@/components/SiteView";

const PROPERTY_TYPES = ["chata", "tiny house", "apartmán", "penzion", "glamping", "roubenka"];

const AMENITY_SUGGESTIONS = [
  "Wi-Fi",
  "Parkování",
  "Kuchyň",
  "Sauna",
  "Vířivka",
  "Kamna na dřevo",
  "Krb",
  "Terasa",
  "Gril",
  "Bazén",
  "Klimatizace",
  "Myčka",
  "Pračka",
  "TV",
  "Zahrada",
  "Snídaně",
  "Domácí mazlíčci vítáni",
  "Bezbariérový přístup",
];

type Form = {
  name: string;
  propertyType: string;
  tagline: string;
  description: string;
  maxGuests: number;
  pricePerNight: string;
  weekendPrice: string;
  pricingMode: "unit" | "person";
  amenities: string[];
  contactEmail: string;
  contactPhone: string;
  tier: "start" | "pro";
};

// Víkendová cena (Pá–Ne) → přirážka v % oproti ceně Po–Čt (formát modelu).
function weekendPctOf(form: Form): number {
  return form.weekendPrice && Number(form.pricePerNight) > 0
    ? Math.round((Number(form.weekendPrice) / Number(form.pricePerNight) - 1) * 100)
    : 0;
}

// Tělo pro POST /api/sites (uloží se jako draft do localStorage).
function buildDraft(form: Form) {
  return {
    name: form.name,
    propertyType: form.propertyType,
    tagline: form.tagline,
    description: form.description,
    maxGuests: form.maxGuests,
    pricingMode: form.pricingMode,
    tier: form.tier,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    pricePerNight: Number(form.pricePerNight),
    weekendPct: weekendPctOf(form),
    amenities: form.amenities.join(", "),
  };
}

// Data pro živý náhled webu.
function draftToSiteView(form: Form): SiteViewData {
  return {
    name: form.name,
    tagline: form.tagline,
    description: form.description,
    propertyType: form.propertyType,
    pricePerNight: Number(form.pricePerNight) || 0,
    pricingMode: form.pricingMode,
    weekendPct: weekendPctOf(form),
    maxGuests: form.maxGuests,
    amenities: form.amenities.join(", "),
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    priceRules: [],
  };
}

function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form>({
    name: "",
    propertyType: "chata",
    tagline: "",
    description: "",
    maxGuests: 4,
    pricePerNight: "",
    weekendPrice: "",
    pricingMode: "unit",
    amenities: [],
    contactEmail: "",
    contactPhone: "",
    tier: params.get("tier") === "pro" ? "pro" : "start",
  });

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const steps = [
    { title: "Jak se tvoje místo jmenuje?", valid: form.name.trim().length >= 2 },
    { title: "Řekni hostům, proč přijet", valid: true },
    { title: "Kapacita a ceny", valid: Number(form.pricePerNight) > 0 },
    { title: "Vybavení a kontakt", valid: true },
    { title: "Vyber si tarif", valid: true },
    { title: "Náhled tvého webu", valid: true },
  ];
  const PREVIEW_STEP = steps.length - 1;

  // Web se zatím nevytváří — draft se drží v prohlížeči a vznikne až po přihlášení.
  function claim() {
    setSaving(true);
    localStorage.setItem("tainy.draft", JSON.stringify(buildDraft(form)));
    router.push("/onboarding/dokoncit");
  }

  // Krok „Náhled" = plnohodnotný živý web přes celou obrazovku + lišta s CTA.
  if (step === PREVIEW_STEP) {
    return (
      <div className="min-h-dvh bg-cream">
        <div className="sticky top-0 z-50 border-b border-line bg-cream/90 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-3">
            <button
              type="button"
              onClick={() => setStep(PREVIEW_STEP - 1)}
              className="text-sm text-soft transition hover:text-ink"
            >
              ← Upravit
            </button>
            <span className="hidden text-xs font-semibold uppercase tracking-wider text-soft sm:block">
              Náhled tvého webu
            </span>
            <button
              type="button"
              onClick={claim}
              disabled={saving}
              className="btn-primary !px-5 !py-2 text-sm"
            >
              {saving ? "Moment…" : "Chci tento web →"}
            </button>
          </div>
        </div>
        <SiteView site={draftToSiteView(form)} preview />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-10">
      <header className="flex items-center justify-between py-5">
        <Logo className="text-xl" />
        <Link href="/" className="text-sm text-soft hover:text-ink">
          Zavřít ✕
        </Link>
      </header>

      {/* Progres */}
      <div className="mb-8 flex gap-1.5">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-pine" : "bg-line"
            }`}
          />
        ))}
      </div>

      <h1 className="rise font-display text-3xl font-semibold tracking-tight">
        {steps[step].title}
      </h1>

      <div className="rise rise-1 mt-6 flex-1 space-y-5">
        {step === 0 && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Název ubytování</span>
              <input
                className="field"
                autoFocus
                placeholder="např. Chata Meduňka"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-medium">Typ nemovitosti</span>
              <div className="flex flex-wrap gap-2">
                {PROPERTY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("propertyType", t)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      form.propertyType === t
                        ? "border-pine bg-pine text-white"
                        : "border-line bg-surface text-soft hover:border-pine/40"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Slogan (jedna věta)</span>
              <input
                className="field"
                placeholder="např. Tiny house na kraji lesa, kde čas plyne pomaleji"
                value={form.tagline}
                onChange={(e) => set("tagline", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Popis pro hosty</span>
              <textarea
                className="field min-h-36"
                placeholder="Co dělá tvoje místo výjimečným? Výhled, klid, sauna, snídaně…"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </label>
            <p className="ai-chip rounded-xl px-4 py-3 text-sm text-soft">
              💡 Netrap se formulacemi — v tarifu <strong className="text-ink">Pro</strong> texty
              kdykoli přepíše AI asistent podle tvého hlasového pokynu.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <span className="mb-1.5 block text-sm font-medium">Maximální počet hostů</span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="btn-ghost !px-5 !py-2"
                  onClick={() => set("maxGuests", Math.max(1, form.maxGuests - 1))}
                >
                  −
                </button>
                <span className="w-10 text-center font-display text-2xl font-semibold">
                  {form.maxGuests}
                </span>
                <button
                  type="button"
                  className="btn-ghost !px-5 !py-2"
                  onClick={() => set("maxGuests", Math.min(20, form.maxGuests + 1))}
                >
                  +
                </button>
              </div>
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
                        : "border-line bg-surface text-soft hover:border-pine/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium">
                Cena za noc (Kč{form.pricingMode === "person" && " za osobu"})
              </span>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-soft">Všední dny (Po–Čt)</span>
                  <input
                    className="field"
                    type="number"
                    inputMode="numeric"
                    placeholder="2900"
                    value={form.pricePerNight}
                    onChange={(e) => set("pricePerNight", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-soft">Víkend (Pá–Ne)</span>
                  <input
                    className="field"
                    type="number"
                    inputMode="numeric"
                    placeholder={form.pricePerNight || "3400"}
                    value={form.weekendPrice}
                    onChange={(e) => set("weekendPrice", e.target.value)}
                  />
                </label>
              </div>
            </div>
            <p className="rounded-xl bg-bg px-4 py-3 text-sm text-soft">
              💰 Víkend necháš prázdný = stejná cena jako ve všední dny. Sezónní ceny (± %) doladíš
              po vytvoření webu v administraci.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <span className="mb-1.5 block text-sm font-medium">
                Vybavení <span className="text-soft">(klikni na nabídku nebo napiš vlastní)</span>
              </span>
              <AmenityPicker
                value={form.amenities}
                onChange={(next) => set("amenities", next)}
                suggestions={AMENITY_SUGGESTIONS}
                placeholder="Napiš vybavení a stiskni Enter…"
              />
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Kontaktní e-mail</span>
              <input
                className="field"
                type="email"
                placeholder="ahoj@moje-chata.cz"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Telefon</span>
              <input
                className="field"
                type="tel"
                placeholder="+420 777 123 456"
                value={form.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </label>
          </>
        )}

        {step === 4 && (
          <div className="space-y-3">
            {(
              [
                {
                  id: "start",
                  name: "Start",
                  price: "0 Kč / měsíc",
                  desc: "Web, rezervace, platby a administrace.",
                },
                {
                  id: "pro",
                  name: "tainy Pro",
                  price: "490 Kč / měsíc",
                  desc: "Navíc hlasový AI asistent, který web upravuje za tebe.",
                },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => set("tier", t.id)}
                className={`w-full rounded-2xl border p-5 text-left transition ${
                  form.tier === t.id
                    ? "border-pine bg-surface ring-2 ring-pine/20"
                    : "border-line bg-surface hover:border-pine/40"
                } ${t.id === "pro" ? "ai-chip" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-semibold">
                    {t.id === "pro" ? (
                      <>
                        t<span className="ai-mark">ai</span>ny Pro
                      </>
                    ) : (
                      t.name
                    )}
                  </span>
                  <span className="text-sm font-semibold text-soft">{t.price}</span>
                </div>
                <p className="mt-1 text-sm text-soft">{t.desc}</p>
              </button>
            ))}
            <p className="pt-1 text-xs text-soft">
              V demu nic neplatíš — tarif si jen vyzkoušíš.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{error}</p>
        )}
      </div>

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button type="button" className="btn-ghost flex-1" onClick={() => setStep(step - 1)}>
            ← Zpět
          </button>
        )}
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={!steps[step].valid}
          onClick={() => setStep(step + 1)}
        >
          {step === PREVIEW_STEP - 1 ? "Zobrazit náhled →" : "Pokračovat →"}
        </button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Wizard />
    </Suspense>
  );
}
