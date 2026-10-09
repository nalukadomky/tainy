"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { OnboardingEditor, PriceFields } from "@/components/OnboardingEditor";
import { PROPERTY_TYPES } from "@/lib/listing";
import { EMPTY_FORM, FORM_KEY, withSuggestedTexts, type OnboardingForm } from "@/lib/onboarding";

// Onboarding: dvě krátké otázky (název a typ, kapacita a ceny), pak se web
// dotváří přímo v sobě (OnboardingEditor) a „Chci tento web" otevře registraci.
// Rozpracovaný web se drží v prohlížeči, obnovení stránky o nic nepřipraví.

function Wizard() {
  // 0–1 = otázky, 2 = editor ve webu
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingForm>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FORM_KEY) ?? "null");
      if (saved?.form) {
        setForm({ ...EMPTY_FORM, ...saved.form });
        if (typeof saved.step === "number") setStep(Math.min(2, Math.max(0, saved.step)));
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(FORM_KEY, JSON.stringify({ form, step }));
    } catch {}
  }, [form, step, loaded]);

  const set = <K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const steps = [
    { title: "Jak se tvoje místo jmenuje?", valid: form.name.trim().length >= 2 },
    { title: "Kapacita a ceny", valid: Number(form.pricePerNight) > 0 },
  ];
  const EDITOR_STEP = steps.length;

  function openEditor() {
    setForm(withSuggestedTexts);
    setStep(EDITOR_STEP);
  }

  if (!loaded) return null;
  if (step === EDITOR_STEP) return <OnboardingEditor form={form} set={set} onBack={() => setStep(EDITOR_STEP - 1)} />;

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
            <PriceFields form={form} set={set} />
            <p className="rounded-xl bg-bg px-4 py-3 text-sm text-soft">
              💰 Víkend necháš prázdný = stejná cena jako ve všední dny. Texty, vybavení a kontakt doplníš za chvíli
              přímo ve webu.
            </p>
          </>
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
          onClick={() => (step === EDITOR_STEP - 1 ? openEditor() : setStep(step + 1))}
        >
          {step === EDITOR_STEP - 1 ? "Vytvořit web →" : "Pokračovat →"}
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
