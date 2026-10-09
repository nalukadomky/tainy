"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AMENITY_SUGGESTIONS } from "@/lib/listing";
import { DRAFT_KEY, buildDraft, draftToSiteView, previewSlug, type OnboardingForm } from "@/lib/onboarding";
import { DeviceStage, DeviceSwitch, type Device } from "@/components/DeviceStage";
import { usePreviewFrame } from "@/components/LivePreview";
import { BuilderHint, BuilderPanel } from "@/components/BuilderPanel";
import { AmenityPicker } from "@/components/AmenityPicker";
import { AuthForm } from "@/components/AuthForm";
import { ThemePicker } from "@/components/ThemePicker";
import { PropertyTypePicker } from "@/components/PropertyTypePicker";
import type { EditableSection } from "@/components/EditableText";

// Onboarding, krok 2: nový web se dotváří přímo v sobě — stejně jako beta editace
// webu v administraci. Texty se píšou do webu, sekce mají „Upravit". Nic se zatím
// neukládá na server: „Chci tento web" otevře registraci a web vznikne až po ní.

type SetField = <K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) => void;

const PANEL_TITLE: Record<EditableSection, string> = {
  uvod: "Úvod webu",
  galerie: "Fotky",
  "o-miste": "Popis a kontakt",
  vybaveni: "Vybavení",
  poloha: "Kde nás najdete",
  rezervace: "Kapacita a ceny",
};

const HINT_KEY = "tainy.onboarding.hint";

export function OnboardingEditor({
  form,
  set,
  onBack,
}: {
  form: OnboardingForm;
  set: SetField;
  onBack: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [panel, setPanel] = useState<EditableSection | null>(null);
  const [hint, setHint] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!window.matchMedia("(min-width: 1024px)").matches) setDevice("mobile");
    try {
      setHint(localStorage.getItem(HINT_KEY) !== "0");
    } catch {}
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const siteView = useMemo(() => draftToSiteView(form), [form]);
  const frameRef = usePreviewFrame({
    site: siteView,
    booked: [],
    editable: true,
    focus: panel,
    onEdit: (field, value) => set(field, value),
    onSelect: setPanel,
  });
  const closePanel = useCallback(() => setPanel(null), []);

  function dismissHint() {
    setHint(false);
    try {
      localStorage.setItem(HINT_KEY, "0");
    } catch {}
  }

  // Přihlášený (zakládá další web) jde rovnou dokončit, ostatní se zaregistrují v okně.
  async function claim() {
    if (form.name.trim().length < 2) {
      setPanel("uvod");
      return;
    }
    if (!(Number(form.pricePerNight) > 0)) {
      setPanel("rezervace");
      return;
    }
    setClaiming(true);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraft(form)));
    const {
      data: { user },
    } = await createClient()
      .auth.getUser()
      .catch(() => ({ data: { user: null } }));
    if (user) {
      router.push("/onboarding/dokoncit");
      return;
    }
    setClaiming(false);
    setAuthOpen(true);
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium text-soft hover:bg-line/50 hover:text-ink"
        >
          ← <span className="max-sm:hidden">Zpět k otázkám</span>
        </button>
        <p className="mr-auto min-w-0 truncate font-display text-base font-semibold leading-tight">
          Tvůj nový web<span className="max-sm:hidden">{form.name ? ` · ${form.name}` : ""}</span>
        </p>
        <DeviceSwitch value={device} onChange={setDevice} />
        <button
          type="button"
          onClick={claim}
          disabled={claiming}
          className="btn-primary shrink-0 whitespace-nowrap !px-4 !py-2 text-sm"
        >
          {claiming ? "Moment…" : (
            <>
              Chci tento web<span className="max-sm:hidden"> →</span>
            </>
          )}
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          {hint && (
            <BuilderHint onDismiss={dismissHint}>
              ✍️ Klikni na text a piš. Vybavení, ceny a kontakt otevřeš tlačítkem <strong>Upravit</strong> u sekce.
            </BuilderHint>
          )}
          <DeviceStage device={device} slug={previewSlug(form.name)} frameRef={frameRef} title="Tvůj nový web" />
        </div>

        {panel && (
          <BuilderPanel title={PANEL_TITLE[panel]} onClose={closePanel}>
            <SectionPanel section={panel} form={form} set={set} />
          </BuilderPanel>
        )}
      </div>

      {authOpen && <ClaimDialog onClose={() => setAuthOpen(false)} />}
    </div>,
    document.body
  );
}

function SectionPanel({ section, form, set }: { section: EditableSection; form: OnboardingForm; set: SetField }) {
  switch (section) {
    case "uvod":
      return (
        <>
          <p className="text-sm text-soft">Název a slogan přepíšeš kliknutím přímo do webu.</p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Název ubytování</span>
            <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
            {form.name.trim().length < 2 && <span className="mt-1 block text-xs text-coral">Doplň název — aspoň 2 znaky.</span>}
          </label>
          <div>
            <span className="mb-2 block text-sm font-medium">Typ ubytování</span>
            <PropertyTypePicker value={form.propertyType} onChange={(t) => set("propertyType", t)} />
          </div>
          <div>
            <span className="mb-2 block text-sm font-medium">Barva webu</span>
            <ThemePicker value={form.themeColor} onChange={(key) => set("themeColor", key)} />
          </div>
          <PhotosLater text="Úvodní fotku vybereš hned po vytvoření účtu." />
        </>
      );
    case "galerie":
      return <PhotosLater text="Fotky nahraješ hned po vytvoření účtu — zabere to minutu. Zatím jsou na webu ilustrace." />;
    case "o-miste":
      return (
        <>
          <p className="text-sm text-soft">Popis můžeš psát i přímo ve webu.</p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Popis</span>
            <textarea className="field min-h-48" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </label>
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
      );
    case "vybaveni":
      return (
        <>
          <p className="text-sm text-soft">Klikni na položku z nabídky, nebo napiš vlastní.</p>
          <AmenityPicker
            value={form.amenities}
            onChange={(next) => set("amenities", next)}
            suggestions={AMENITY_SUGGESTIONS}
            placeholder="Další vybavení…"
          />
        </>
      );
    case "poloha":
      return (
        <p className="rounded-xl bg-bg px-4 py-3 text-sm text-soft">
          Adresu a to, jak přesně ji ukázat na webu (přibližně textem, přibližně na mapě, nebo přesně), nastavíš hned
          po vytvoření účtu v úpravách webu.
        </p>
      );
    case "rezervace":
      return (
        <>
          <PriceFields form={form} set={set} />
          <p className="rounded-xl bg-bg px-4 py-3 text-sm text-soft">
            Sezónní ceny, úklid, poplatky a pravidla pobytu doladíš po vytvoření webu v Nastavení.
          </p>
        </>
      );
  }
}

function PhotosLater({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-bg px-5 py-6 text-center">
      <p className="text-3xl" aria-hidden>
        📷
      </p>
      <p className="mt-2 text-sm text-soft">{text}</p>
    </div>
  );
}

/** Kapacita a ceny — v otázkách onboardingu i v panelu Rezervace v editoru. */
export function PriceFields({ form, set }: { form: OnboardingForm; set: SetField }) {
  return (
    <>
      <div>
        <span className="mb-1.5 block text-sm font-medium">Maximální počet hostů</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="btn-ghost !px-5 !py-2"
            aria-label="Méně hostů"
            onClick={() => set("maxGuests", Math.max(1, form.maxGuests - 1))}
          >
            −
          </button>
          <span className="w-10 text-center font-display text-2xl font-semibold">{form.maxGuests}</span>
          <button
            type="button"
            className="btn-ghost !px-5 !py-2"
            aria-label="Více hostů"
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
        {!(Number(form.pricePerNight) > 0) && (
          <span className="mt-1 block text-xs text-coral">Doplň cenu za noc ve všední dny.</span>
        )}
      </div>
    </>
  );
}

/** Registrace / přihlášení nad webem — po něm se web z rozpracované verze vytvoří. */
function ClaimDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "register" ? "Vytvoř si účet" : "Přihlas se"}
        className="rise flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 className="font-display text-2xl font-semibold">
              {mode === "register" ? "Ulož si web — vytvoř si účet" : "Přihlas se a ulož web"}
            </h2>
            <p className="mt-1 text-sm text-soft">
              {mode === "register"
                ? "Účet je zdarma. Pod ním budeš spravovat web, rezervace i výdělky."
                : "Web se uloží k tvému účtu, kde ho najdeš v administraci."}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-soft outline-none transition hover:bg-bg hover:text-ink focus-visible:ring-2 focus-visible:ring-pine/40"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 pt-5">
          <Suspense>
            <AuthForm
              key={mode}
              mode={mode}
              next="/onboarding/dokoncit"
              onSwitchMode={() => setMode((m) => (m === "register" ? "login" : "register"))}
            />
          </Suspense>
          {mode === "register" && (
            <p className="mt-4 text-center text-xs text-soft">Registrací souhlasíš s podmínkami služby a zpracováním údajů.</p>
          )}
        </div>
      </div>
    </div>
  );
}
