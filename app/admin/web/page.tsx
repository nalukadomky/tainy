"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminData, type Site, type PriceRule } from "@/lib/admin";
import { czk } from "@/lib/pricing";

export default function SiteEditPage() {
  const { slug, site, loading, error, reload } = useAdminData();
  const [form, setForm] = useState<Site | null>(null);
  const [sites, setSites] = useState<{ slug: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (site) setForm(site);
  }, [site]);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then(setSites)
      .catch(() => {});
  }, []);

  const set = <K extends keyof Site>(key: K, value: Site[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const setRule = (index: number, patch: Partial<PriceRule>) =>
    setForm((f) =>
      f
        ? { ...f, priceRules: f.priceRules.map((r, i) => (i === index ? { ...r, ...patch } : r)) }
        : f
    );

  async function save() {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    await fetch(`/api/sites/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    await reload();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function switchSite(newSlug: string) {
    localStorage.setItem("tainy.site", newSlug);
    reload(newSlug);
  }

  if (loading || !form) return <p className="py-16 text-center text-soft">Načítám web…</p>;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Můj web</h1>
          <p className="mt-1 text-sm text-soft">
            Veřejná adresa:{" "}
            <Link
              href={`/w/${form.slug}`}
              target="_blank"
              className="font-medium text-pine underline decoration-line underline-offset-4"
            >
              /w/{form.slug} ↗
            </Link>
          </p>
        </div>
        {sites.length > 1 && (
          <select
            className="field !w-auto !py-2 text-sm"
            value={slug ?? "demo"}
            onChange={(e) => switchSite(e.target.value)}
          >
            {sites.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tarif */}
      <div className={`rounded-2xl border p-5 ${form.tier === "pro" ? "ai-chip" : "border-line bg-surface"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-lg font-semibold">
              Tarif:{" "}
              {form.tier === "pro" ? (
                <>
                  t<span className="ai-mark">ai</span>ny Pro
                </>
              ) : (
                "Start"
              )}
            </p>
            <p className="text-sm text-soft">
              {form.tier === "pro"
                ? "Hlasový AI asistent je aktivní — najdeš ho v záložce Asistent."
                : "Přejdi na Pro a upravuj web hlasem přes AI asistenta."}
            </p>
          </div>
          <button
            className={form.tier === "pro" ? "btn-ghost !py-2 text-sm" : "btn-primary !py-2 text-sm"}
            onClick={async () => {
              const tier = form.tier === "pro" ? "start" : "pro";
              await fetch(`/api/sites/${slug}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tier }),
              });
              reload();
            }}
          >
            {form.tier === "pro" ? "Zpět na Start" : "✨ Aktivovat Pro (demo)"}
          </button>
        </div>
      </div>

      {/* Ceník */}
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Ceník</h2>
          <p className="text-sm text-soft">
            Cena se počítá noc po noci — procenta víkendu a sezón se sčítají.
          </p>
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
            <input
              className="field"
              type="number"
              value={form.pricePerNight}
              onChange={(e) => set("pricePerNight", Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Víkend (pá–ne) <span className="text-soft">± %</span>
            </span>
            <input
              className="field"
              type="number"
              value={form.weekendPct}
              onChange={(e) => set("weekendPct", Number(e.target.value))}
            />
          </label>
        </div>

        <p className="rounded-xl bg-bg px-4 py-2.5 text-sm text-soft">
          Všední noc: <strong className="text-ink">{czk(form.pricePerNight)}</strong> · Víkendová
          noc:{" "}
          <strong className="text-ink">
            {czk(Math.round(form.pricePerNight * (1 + (form.weekendPct || 0) / 100)))}
          </strong>
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
                      setForm((f) =>
                        f ? { ...f, priceRules: f.priceRules.filter((_, j) => j !== i) } : f
                      )
                    }
                  >
                    🗑
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
                <label className="block w-28">
                  <span className="mb-1 block text-xs text-soft">Úprava ceny ± %</span>
                  <input
                    className="field !py-2 text-sm"
                    type="number"
                    value={r.pct}
                    onChange={(e) => setRule(i, { pct: Number(e.target.value) })}
                  />
                </label>
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
                    { label: "Nové období", startDate: iso(today), endDate: iso(in30), pct: 10 },
                  ],
                };
              })
            }
          >
            + Přidat období
          </button>
          <p className="mt-2 text-xs text-soft">
            Kladná procenta cenu v období zvyšují, záporná fungují jako sleva (např. −15).
          </p>
        </div>
      </div>

      {/* Obsah webu */}
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold">Obsah webu</h2>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Název</span>
          <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Slogan</span>
          <input className="field" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Popis</span>
          <textarea
            className="field min-h-36"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Vybavení (oddělené čárkou)</span>
          <textarea
            className="field min-h-20"
            value={form.amenities}
            onChange={(e) => set("amenities", e.target.value)}
          />
        </label>
        <label className="block sm:max-w-48">
          <span className="mb-1.5 block text-sm font-medium">Max. hostů</span>
          <input
            className="field"
            type="number"
            value={form.maxGuests}
            onChange={(e) => set("maxGuests", Number(e.target.value))}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
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
        <div className="flex items-center gap-3 pt-1">
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "Ukládám…" : "Uložit změny"}
          </button>
          {saved && <span className="text-sm font-medium text-pine">✓ Uloženo</span>}
        </div>
      </div>
    </div>
  );
}
