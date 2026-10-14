"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/Skeleton";
import { FLASH_KEY } from "@/components/Toast";
import { AMENITY_SUGGESTIONS, PROPERTY_TYPES } from "@/lib/listing";
import { MAX_IMPORT_PHOTOS, type Field, type ImportChoice, type ImportResult, type Mark } from "@/lib/import/types";

// Import existujícího webu: adresa → sken → kontrola a doplnění → nový web.

type Stage = "url" | "scanning" | "review" | "creating";

const SCAN_STEPS = ["Načítáme úvodní stránku", "Procházíme další stránky webu", "Hledáme fotky", "Čteme kontakty, ceny a vybavení", "Ověřujeme IČ v ARES"];
const CREATE_STEPS = ["Zakládáme web", "Stahujeme a zmenšujeme fotky", "Doplňujeme popis, firmu a polohu"];

const MARK: Record<Mark, { label: string; cls: string }> = {
  found: { label: "Nalezeno", cls: "bg-pine/10 text-pine" },
  check: { label: "Zkontroluj", cls: "bg-amber/15 text-[#92600a]" },
  missing: { label: "Doplň", cls: "bg-coral/10 text-coral" },
};

function choiceFrom(r: ImportResult): ImportChoice {
  return {
    name: r.name.value,
    tagline: r.tagline.value,
    description: r.description.value,
    about: r.about.value,
    propertyType: r.propertyType.value,
    maxGuests: r.maxGuests.value ?? 0,
    bedrooms: r.bedrooms.value ?? 0,
    pricePerNight: r.pricePerNight.value ?? 0,
    checkInTime: r.checkInTime.value,
    checkOutTime: r.checkOutTime.value,
    amenities: r.amenities.value,
    contactEmail: r.contactEmail.value,
    contactPhone: r.contactPhone.value,
    ico: r.ico.value,
    useBusiness: !!r.business,
    address: r.address.value,
    themeColor: r.themeColor.value,
    useReviews: r.reviews.value.length > 0,
    photos: r.photos.slice(0, 24).map((p) => p.src),
    hero: r.photos[0]?.src ?? null,
  };
}

export function ImportFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("url");
  const [url, setUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [jobId, setJobId] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [choice, setChoice] = useState<ImportChoice | null>(null);

  // Kroky průběhu jen ukazují, co se děje — skutečný stav hlásí server až na konci
  useEffect(() => {
    if (stage !== "scanning" && stage !== "creating") return;
    setStep(0);
    const steps = stage === "scanning" ? SCAN_STEPS : CREATE_STEPS;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), stage === "scanning" ? 2200 : 6000);
    return () => clearInterval(t);
  }, [stage]);

  async function scan(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStage("scanning");
    const res = await fetch("/api/import/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, consent }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.result) {
      setError(data?.error ?? "Sken se nepovedl. Zkus to prosím znovu.");
      setStage("url");
      return;
    }
    setJobId(data.id);
    setResult(data.result);
    setChoice(choiceFrom(data.result));
    setStage("review");
    window.scrollTo({ top: 0 });
  }

  async function create() {
    if (!choice) return;
    setError("");
    setStage("creating");
    const res = await fetch(`/api/import/${jobId}/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(choice),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.slug) {
      setError(data?.error ?? "Web se nepodařilo vytvořit. Zkus to prosím znovu.");
      setStage("review");
      return;
    }
    try {
      localStorage.setItem("tainy.site", data.slug);
      const photos = `${data.photos} ${data.photos === 1 ? "fotka" : data.photos >= 2 && data.photos <= 4 ? "fotky" : "fotek"}`;
      sessionStorage.setItem(
        FLASH_KEY,
        `Web je přenesený (${photos}${data.skipped ? `, ${data.skipped} se nepodařilo stáhnout` : ""}). Projdi ho a uprav, co je potřeba.`,
      );
    } catch {
      /* bez úložiště se vybere první web */
    }
    router.push("/admin/web/builder");
  }

  if (stage === "url" || stage === "scanning")
    return (
      <div className="mx-auto w-full max-w-xl flex-1 pt-6 sm:pt-14">
        <p className="text-xs font-semibold uppercase tracking-widest text-soft">Přenos webu</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Přenes svůj web do tainy</h1>
        <p className="mt-3 text-soft">
          Zadej adresu svého současného webu. Projdeme ho a vytáhneme fotky, popis, vybavení, kontakty a údaje o firmě.
          Všechno pak zkontroluješ a doplníš, než web vytvoříme.
        </p>
        {stage === "url" ? (
          <form onSubmit={scan} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Adresa webu</span>
              <input
                className="field"
                inputMode="url"
                autoComplete="url"
                placeholder="chata-podsmrkem.cz"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
              />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--pine)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>Obsah webu (texty a fotky) je můj, nebo ho smím použít, a chci ho přenést do tainy.</span>
            </label>
            {error && <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={url.trim().length < 4 || !consent}>
              Prohledat web
            </button>
          </form>
        ) : (
          <div className="mt-8 space-y-5 rounded-2xl border border-line bg-surface p-6" aria-live="polite">
            <p className="font-semibold">Procházíme {url.replace(/^https?:\/\//, "").replace(/\/$/, "")}…</p>
            <ol className="space-y-2.5 text-sm">
              {SCAN_STEPS.map((s, i) => (
                <li key={s} className={`flex items-center gap-2.5 ${i > step ? "text-soft/60" : ""}`}>
                  <StepDot done={i < step} active={i === step} />
                  {s}
                </li>
              ))}
            </ol>
            <div className="grid grid-cols-4 gap-2" aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-xl" />
              ))}
            </div>
            <p className="text-xs text-soft">Obvykle to trvá 10–30 sekund.</p>
          </div>
        )}
      </div>
    );

  if (!result || !choice) return null;

  if (stage === "creating")
    return (
      <div className="mx-auto w-full max-w-xl flex-1 pt-14">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Vytváříme tvůj web</h1>
        <p className="mt-2 text-soft">
          {choice.photos.length} {choice.photos.length === 1 ? "fotka" : choice.photos.length < 5 ? "fotky" : "fotek"} stahujeme z původního webu. Může to trvat
          až minutu.
        </p>
        <ol className="mt-8 space-y-3 rounded-2xl border border-line bg-surface p-6 text-sm" aria-live="polite">
          {CREATE_STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2.5 ${i > step ? "text-soft/60" : ""}`}>
              <StepDot done={i < step} active={i === step} />
              {s}
            </li>
          ))}
        </ol>
      </div>
    );

  return <Review result={result} choice={choice} setChoice={setChoice} error={error} onCreate={create} onBack={() => setStage("url")} />;
}

function StepDot({ done, active }: { done: boolean; active: boolean }) {
  if (done)
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pine text-[11px] text-white" aria-hidden>
        ✓
      </span>
    );
  return (
    <span
      className={`h-5 w-5 rounded-full border-2 ${active ? "animate-spin border-pine border-t-transparent" : "border-line"}`}
      aria-hidden
    />
  );
}

/* ---------- Kontrola ---------- */

function Review({
  result,
  choice,
  setChoice,
  error,
  onCreate,
  onBack,
}: {
  result: ImportResult;
  choice: ImportChoice;
  setChoice: (c: ImportChoice) => void;
  error: string;
  onCreate: () => void;
  onBack: () => void;
}) {
  const set = <K extends keyof ImportChoice>(k: K, v: ImportChoice[K]) => setChoice({ ...choice, [k]: v });
  const patch = (p: Partial<ImportChoice>) => setChoice({ ...choice, ...p });
  const origin = useMemo(() => new URL(result.url).origin, [result.url]);
  const missing = [
    choice.name.trim().length < 2 && "název",
    choice.pricePerNight < 1 && "cenu za noc",
    choice.maxGuests < 1 && "počet hostů",
  ].filter(Boolean) as string[];
  const found = [
    result.photos.length && `${result.photos.length} fotek`,
    result.amenities.value.length && `${result.amenities.value.length} položek vybavení`,
    result.business && "firmu z ARES",
    result.reviews.value.length && `${result.reviews.value.length} recenze`,
  ].filter(Boolean);

  return (
    <div className="flex-1 pb-28 pt-4">
      <button type="button" onClick={onBack} className="text-sm text-soft hover:text-ink">
        ← Jiná adresa
      </button>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Zkontroluj, co jsme přenesli</h1>
      <p className="mt-2 text-soft">
        Z webu <strong className="text-ink">{result.host}</strong> jsme prošli {result.pages.length}{" "}
        {result.pages.length === 1 ? "stránku" : result.pages.length < 5 ? "stránky" : "stránek"}
        {found.length ? ` a našli ${found.join(", ")}` : ""}. Uprav, co nesedí, a doplň, co chybí.
      </p>
      {result.jsHeavy && (
        <p className="mt-4 rounded-xl bg-amber/15 px-4 py-3 text-sm text-[#92600a]">
          Web se skládá JavaScriptem (třeba Wix nebo Webnode), takže jsme část obsahu nemuseli vidět. Chybějící údaje doplň ručně.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Základ">
          <Row label="Název" field={result.name} origin={origin} required>
            <input className="field" value={choice.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
          </Row>
          <Row label="Typ ubytování" field={result.propertyType} origin={origin}>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("propertyType", t)}
                  aria-pressed={choice.propertyType === t}
                  className={`rounded-full border px-3 py-1 text-sm transition ${choice.propertyType === t ? "border-pine bg-pine text-white" : "border-line hover:border-pine/40"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Slogan" field={result.tagline} origin={origin}>
            <input className="field" value={choice.tagline} maxLength={160} onChange={(e) => set("tagline", e.target.value)} />
          </Row>
          <Row label="Popis" field={result.description} origin={origin}>
            <textarea className="field min-h-40" value={choice.description} maxLength={3000} onChange={(e) => set("description", e.target.value)} />
          </Row>
        </Card>

        <div className="space-y-6">
          <Card title="Kapacita a cena">
            <div className="grid grid-cols-2 gap-3">
              <Row label="Max. hostů" field={result.maxGuests} origin={origin} required>
                <NumberInput value={choice.maxGuests} max={40} onChange={(v) => set("maxGuests", v)} />
              </Row>
              <Row label="Ložnice" field={result.bedrooms} origin={origin}>
                <NumberInput value={choice.bedrooms} max={20} onChange={(v) => set("bedrooms", v)} />
              </Row>
            </div>
            <Row label="Cena za noc (Kč)" field={result.pricePerNight} origin={origin} required>
              <NumberInput value={choice.pricePerNight} max={1_000_000} onChange={(v) => set("pricePerNight", v)} />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Příjezd od" field={result.checkInTime} origin={origin}>
                <input type="time" className="field" value={choice.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} />
              </Row>
              <Row label="Odjezd do" field={result.checkOutTime} origin={origin}>
                <input type="time" className="field" value={choice.checkOutTime} onChange={(e) => set("checkOutTime", e.target.value)} />
              </Row>
            </div>
          </Card>

          <Card title="Kontakt a adresa">
            <Row label="E-mail" field={result.contactEmail} origin={origin}>
              <input className="field" type="email" value={choice.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
            </Row>
            <Row label="Telefon" field={result.contactPhone} origin={origin}>
              <input className="field" type="tel" value={choice.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
            </Row>
            <Row label="Adresa ubytování" field={result.address} origin={origin} hint="Hosté ji dostanou v e-mailu před příjezdem, na webu bude jen obec.">
              <input className="field" value={choice.address} maxLength={200} onChange={(e) => set("address", e.target.value)} />
            </Row>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Vybavení" field={result.amenities}>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...AMENITY_SUGGESTIONS, ...choice.amenities])].map((a) => {
              const on = choice.amenities.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("amenities", on ? choice.amenities.filter((x) => x !== a) : [...choice.amenities, a])}
                  className={`rounded-full border px-3 py-1 text-sm transition ${on ? "border-pine bg-pine/10 font-medium text-pine" : "border-line text-soft hover:border-pine/40"}`}
                >
                  {on ? "✓ " : "+ "}
                  {a}
                </button>
              );
            })}
          </div>
        </Card>

        <Card title="Firma" field={result.ico}>
          {result.business ? (
            <label className="flex items-start gap-3 rounded-xl border border-line p-4 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--pine)]" checked={choice.useBusiness} onChange={(e) => set("useBusiness", e.target.checked)} />
              <span>
                <strong>{result.business.name}</strong>
                <span className="block text-soft">
                  IČ {result.ico.value}
                  {result.business.vatId && ` · DIČ ${result.business.vatId}`}
                </span>
                <span className="block text-soft">{result.business.address}</span>
                <span className="mt-1 block text-xs text-soft">Údaje z ARES. Použijí se v patičce webu a v obchodních podmínkách.</span>
              </span>
            </label>
          ) : (
            <p className="text-sm text-soft">IČ jsme na webu nenašli. Údaje o firmě doplníš později v Nastavení → Firma a platby.</p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="O nás" field={result.about} origin={origin}>
          <textarea
            className="field min-h-32"
            value={choice.about}
            maxLength={8000}
            placeholder="Na webu jsme nenašli stránku O nás. Můžeš ji napsat později v editoru."
            onChange={(e) => set("about", e.target.value)}
          />
        </Card>
        <Card title="Recenze" field={result.reviews}>
          {result.reviews.value.length ? (
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[var(--pine)]" checked={choice.useReviews} onChange={(e) => set("useReviews", e.target.checked)} />
                Přenést {result.reviews.value.length} {result.reviews.value.length < 5 ? "recenze" : "recenzí"}
              </label>
              <ul className="space-y-2">
                {result.reviews.value.slice(0, 3).map((r, i) => (
                  <li key={i} className="rounded-xl bg-bg px-3 py-2 text-sm">
                    <span className="text-[#c48a12]">{"★".repeat(r.rating)}</span> „{r.text.length > 140 ? `${r.text.slice(0, 140)}…` : r.text}“
                    <span className="block text-xs text-soft">{r.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-soft">Recenze jsme na webu nenašli. Přidáš je později v editoru webu.</p>
          )}
        </Card>
      </div>

      <Photos result={result} choice={choice} patch={patch} />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-soft">
            {error ? (
              <span className="text-coral">{error}</span>
            ) : missing.length ? (
              <>Doplň ještě {missing.join(", ")}.</>
            ) : (
              <>
                {choice.photos.length} fotek · {choice.amenities.length} položek vybavení
              </>
            )}
          </p>
          <button type="button" className="btn-primary !px-6" disabled={missing.length > 0} onClick={onCreate}>
            Vytvořit web
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ title, field, origin, children }: { title: string; field?: Field<unknown>; origin?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {field && <MarkChip field={field} origin={origin} />}
      </div>
      {children}
    </section>
  );
}

function MarkChip({ field, origin }: { field: Field<unknown>; origin?: string }) {
  const m = MARK[field.mark];
  return (
    <span className="flex items-center gap-2 text-xs">
      {field.source && origin && field.mark !== "missing" && (
        <a href={origin + field.source} target="_blank" rel="noopener noreferrer nofollow" className="text-soft underline-offset-2 hover:underline">
          {field.source === "/" ? "úvodní stránka" : field.source}
        </a>
      )}
      <span className={`rounded-full px-2 py-0.5 font-semibold ${m.cls}`}>{m.label}</span>
    </span>
  );
}

function Row({
  label,
  field,
  origin,
  required,
  hint,
  children,
}: {
  label: string;
  field: Field<unknown>;
  origin: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-sm font-medium">
          {label}
          {required && <span className="text-coral"> *</span>}
        </span>
        <MarkChip field={field} origin={origin} />
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-soft">{hint}</p>}
    </div>
  );
}

function NumberInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      className="field tabular-nums"
      inputMode="numeric"
      value={value ? String(value) : ""}
      placeholder="0"
      onChange={(e) => {
        const n = Number(e.target.value.replace(/\D/g, ""));
        onChange(Math.min(max, n || 0));
      }}
    />
  );
}

/* ---------- Fotky ---------- */

function Photos({
  result,
  choice,
  patch,
}: {
  result: ImportResult;
  choice: ImportChoice;
  patch: (p: Partial<ImportChoice>) => void;
}) {
  // Malé a nefunkční obrázky (ikony, náhledy) se samy odznačí
  const [small, setSmall] = useState<Set<string>>(new Set());
  const markSmall = (src: string) => {
    setSmall((s) => new Set(s).add(src));
  };
  useEffect(() => {
    if (!small.size) return;
    const keep = choice.photos.filter((p) => !small.has(p));
    if (keep.length !== choice.photos.length)
      patch({ photos: keep, ...(choice.hero && small.has(choice.hero) && { hero: keep[0] ?? null }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [small]);

  const toggle = (src: string) => {
    if (choice.photos.includes(src)) {
      const keep = choice.photos.filter((p) => p !== src);
      patch({ photos: keep, ...(choice.hero === src && { hero: keep[0] ?? null }) });
    } else if (choice.photos.length < MAX_IMPORT_PHOTOS) patch({ photos: [...choice.photos, src] });
  };

  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Fotky</h2>
        <p className="text-sm text-soft">
          Vybráno {choice.photos.length} z {result.photos.length} · nejvýš {MAX_IMPORT_PHOTOS} · hvězdička = úvodní fotka
        </p>
      </div>
      {result.photos.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {result.photos.map((p) => {
            const on = choice.photos.includes(p.src);
            const hero = choice.hero === p.src;
            const tiny = small.has(p.src);
            return (
              <div key={p.src} className={`group relative overflow-hidden rounded-xl border-2 transition ${on ? "border-pine" : "border-transparent"} ${tiny ? "opacity-40" : ""}`}>
                <button type="button" onClick={() => toggle(p.src)} aria-pressed={on} aria-label={`${on ? "Odebrat" : "Vybrat"} fotku ${p.alt}`} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.src}
                    alt={p.alt}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className={`aspect-square w-full bg-bg object-cover ${on ? "" : "opacity-60"}`}
                    onLoad={(e) => {
                      const i = e.currentTarget;
                      if (i.naturalWidth < 600 && i.naturalHeight < 600) markSmall(p.src);
                    }}
                    onError={() => markSmall(p.src)}
                  />
                </button>
                <span className={`pointer-events-none absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${on ? "bg-pine text-white" : "bg-white/80 text-transparent ring-1 ring-line"}`}>
                  ✓
                </span>
                {on && (
                  <button
                    type="button"
                    onClick={() => patch({ hero: p.src })}
                    aria-label="Nastavit jako úvodní fotku"
                    aria-pressed={hero}
                    className={`absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full transition ${hero ? "bg-amber text-white" : "bg-white/85 text-soft opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                  >
                    <Icon name="star" size={14} />
                  </button>
                )}
                {hero && <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-0.5 text-center text-[11px] font-semibold text-white">Úvodní</span>}
                {tiny && <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-0.5 text-center text-[11px] text-white">Malá fotka</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-soft">Fotky jsme na webu nenašli. Nahraješ je v editoru webu.</p>
      )}
    </section>
  );
}
