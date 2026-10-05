"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminData, fmtDate, norm } from "@/lib/admin";
import { czk } from "@/lib/pricing";
import { todayISO } from "@/lib/stay";
import { Dropdown } from "@/components/Dropdown";
import { useToast } from "@/components/Toast";
import {
  generateCode,
  normalizeCode,
  STATUS_LABEL,
  voucherStatus,
  voucherValueLabel,
  type VoucherKind,
  type VoucherStatus,
} from "@/lib/voucher";
import { ListPageSkeleton } from "@/components/Skeleton";

type Voucher = {
  id: string;
  code: string;
  kind: VoucherKind;
  value: number;
  validFrom: string | null;
  validTo: string | null;
  maxUses: number | null;
  note: string;
  active: boolean;
  uses: number;
  discountTotal: number;
  reservations: { id: string; publicId: string; guestName: string; startDate: string; endDate: string; discount: number }[];
};

type Draft = {
  code: string;
  kind: VoucherKind;
  value: string;
  validFrom: string;
  validTo: string;
  /** Omezit počet použití? Když ne, maxUses se ignoruje. */
  limited: boolean;
  maxUses: string;
  note: string;
};

// Zvýraznění pole, které je potřeba doplnit
const INVALID = "!border-coral ring-2 ring-coral/20";

const EMPTY: Draft = { code: "", kind: "pct", value: "", validFrom: "", validTo: "", limited: true, maxUses: "1", note: "" };

const STATUS_STYLE: Record<VoucherStatus, string> = {
  active: "bg-pine/10 text-pine",
  inactive: "bg-line/60 text-soft",
  upcoming: "bg-amber/15 text-[#92600a]",
  expired: "bg-line/60 text-soft",
  "used-up": "bg-line/60 text-soft",
};

/** Lidská věta shrnující podmínky voucheru. */
function describe(d: { kind: VoucherKind; value: number; validFrom: string | null; validTo: string | null; maxUses: number | null }) {
  const parts = [`${voucherValueLabel(d.kind, d.value)} z ubytování a úklidu`];
  if (d.validFrom && d.validTo) parts.push(`platí ${fmtDate(d.validFrom)} – ${fmtDate(d.validTo)}`);
  else if (d.validTo) parts.push(`platí do ${fmtDate(d.validTo)}`);
  else if (d.validFrom) parts.push(`platí od ${fmtDate(d.validFrom)}`);
  parts.push(d.maxUses ? `max. ${d.maxUses}×` : "bez omezení počtu");
  return parts.join(" · ");
}

export default function VouchersPage() {
  const { slug, site, loading: siteLoading, error: siteError } = useAdminData();
  const [vouchers, setVouchers] = useState<Voucher[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | VoucherStatus>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<"code" | "value" | "uses" | null>(null);
  const toast = useToast();
  const today = todayISO();

  const load = useCallback(async () => {
    if (!slug) return;
    const res = await fetch(`/api/vouchers?site=${slug}`);
    setVouchers(res.ok ? await res.json() : []);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const withStatus = useMemo(
    () => (vouchers ?? []).map((v) => ({ ...v, status: voucherStatus(v, v.uses, today) })),
    [vouchers, today]
  );

  const shown = withStatus.filter(
    (v) =>
      (filter === "all" || v.status === filter) &&
      (!query.trim() || norm(`${v.code} ${v.note}`).includes(norm(query.trim())))
  );

  const stats = {
    active: withStatus.filter((v) => v.status === "active").length,
    uses: withStatus.reduce((s, v) => s + v.uses, 0),
    discount: withStatus.reduce((s, v) => s + v.discountTotal, 0),
  };

  function startNew() {
    setDraft({ ...EMPTY, code: generateCode(site?.name ?? "") });
    setEditing("new");
    setFormError("");
    setInvalid(null);
  }

  function startEdit(v: Voucher) {
    if (v.id.startsWith("tmp-")) return; // ještě se ukládá
    setDraft({
      code: v.code,
      kind: v.kind,
      value: String(v.value),
      validFrom: v.validFrom ?? "",
      validTo: v.validTo ?? "",
      limited: v.maxUses !== null,
      maxUses: v.maxUses ? String(v.maxUses) : "",
      note: v.note,
    });
    setEditing(v.id);
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const draftValue = Number(draft.value);
  // Co ještě chybí — tlačítko zůstává aktivní, po kliknutí to ukáže notifikace a zvýrazní pole.
  const draftProblem: { field: "code" | "value" | "uses"; text: string } | null =
    draft.code.trim().length < 3
      ? { field: "code", text: "Doplň kód voucheru (aspoň 3 znaky)." }
      : !(draftValue > 0)
        ? { field: "value", text: `Doplň výši slevy ${draft.kind === "pct" ? "v procentech" : "v Kč"}.` }
        : draft.kind === "pct" && draftValue > 100
          ? { field: "value", text: "Sleva v procentech může být nejvýš 100 %." }
          : draft.limited && !(Number(draft.maxUses) >= 1)
            ? { field: "uses", text: "Doplň, kolikrát jde voucher použít (aspoň 1×)." }
            : null;

  async function save() {
    if (draftProblem) {
      setInvalid(draftProblem.field);
      toast.show(draftProblem.text);
      document.getElementById(`voucher-${draftProblem.field}`)?.focus();
      return;
    }
    setFormError("");
    const body = {
      site: slug,
      code: draft.code,
      kind: draft.kind,
      value: Number(draft.value),
      validFrom: draft.validFrom || null,
      validTo: draft.validTo || null,
      maxUses: draft.limited && draft.maxUses ? Number(draft.maxUses) : null,
      note: draft.note,
    };
    // Voucher se v seznamu ukáže hned a formulář se zavře; uložení běží na pozadí.
    // Když ho server odmítne (např. obsazený kód), formulář se vrátí i s chybou.
    const target = editing;
    const savedDraft = draft;
    const tmpId = `tmp-${Date.now()}`;
    const optimistic: Voucher = {
      ...(target !== "new" ? vouchers?.find((v) => v.id === target) : undefined),
      id: target === "new" ? tmpId : target!,
      code: body.code.trim().toUpperCase(),
      kind: body.kind,
      value: body.value,
      validFrom: body.validFrom,
      validTo: body.validTo,
      maxUses: body.maxUses,
      note: body.note,
      active: target === "new" ? true : (vouchers?.find((v) => v.id === target)?.active ?? true),
      uses: target === "new" ? 0 : (vouchers?.find((v) => v.id === target)?.uses ?? 0),
      discountTotal: target === "new" ? 0 : (vouchers?.find((v) => v.id === target)?.discountTotal ?? 0),
      reservations: target === "new" ? [] : (vouchers?.find((v) => v.id === target)?.reservations ?? []),
    };
    const before = vouchers;
    setVouchers((list) =>
      target === "new" ? [optimistic, ...(list ?? [])] : (list?.map((v) => (v.id === target ? optimistic : v)) ?? list)
    );
    setEditing(null);
    toast.show(target === "new" ? `Voucher ${body.code} je vytvořený.` : "Změny jsou uložené.", "success");

    const res = await fetch(target === "new" ? "/api/vouchers" : `/api/vouchers/${target}`, {
      method: target === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      setVouchers(before);
      setDraft(savedDraft);
      setEditing(target);
      setFormError(data?.error || "Voucher se nepodařilo uložit.");
      toast.show(data?.error || "Voucher se nepodařilo uložit.");
      return;
    }
    load(); // doplní čísla ze serveru (použití, ID nového voucheru)
  }

  // Přepínač se změní hned (optimisticky), server se dotáhne na pozadí.
  // Když uložení selže, vrátíme původní stav a dáme vědět.
  async function toggle(v: Voucher) {
    if (v.id.startsWith("tmp-")) return; // ještě se ukládá
    const active = !v.active;
    const setActive = (value: boolean) =>
      setVouchers((list) => list?.map((x) => (x.id === v.id ? { ...x, active: value } : x)) ?? list);
    setActive(active);
    try {
      const res = await fetch(`/api/vouchers/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error();
      toast.show(active ? `Voucher ${v.code} je zapnutý.` : `Voucher ${v.code} je vypnutý.`, "success");
    } catch {
      setActive(v.active);
      toast.show("Změnu se nepodařilo uložit. Zkus to znovu.");
    }
  }

  async function remove(v: Voucher) {
    if (v.id.startsWith("tmp-")) return; // ještě se ukládá
    if (!confirm(`Smazat voucher ${v.code}?`)) return;
    setVouchers((list) => list?.filter((x) => x.id !== v.id) ?? list);
    const res = await fetch(`/api/vouchers/${v.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      toast.show(data?.error || "Voucher se nepodařilo smazat.");
      load();
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // schránka nemusí být dostupná (např. bez HTTPS) — kód je vidět a jde označit
    }
  }

  if (siteLoading || vouchers === null) return <ListPageSkeleton label="Načítám vouchery" tiles rows={4} />;
  if (siteError) return <p className="py-16 text-center text-soft">{siteError}</p>;


  return (
    <div className="space-y-5">
      {toast.node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Vouchery</h1>
          <p className="mt-1 text-sm text-soft">Slevové kódy a dárkové poukazy, které hosté zadají při rezervaci.</p>
        </div>
        {editing === null && (
          <button type="button" className="btn-primary h-10 !px-4 !py-0 text-sm" onClick={startNew}>
            + Nový voucher
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Aktivní vouchery", value: String(stats.active) },
          { label: "Použito celkem", value: `${stats.uses}×` },
          { label: "Poskytnuté slevy", value: czk(stats.discount) },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-medium text-soft">{t.label}</p>
            <p className="mt-1 font-display text-lg font-semibold sm:text-2xl">{t.value}</p>
          </div>
        ))}
      </div>

      {editing !== null && (
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-lg font-semibold">
            {editing === "new" ? "Nový voucher" : `Upravit ${draft.code}`}
          </h2>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Kód</span>
              <div className="flex gap-2">
                <input
                  id="voucher-code"
                  className={`control min-w-0 flex-1 font-mono uppercase ${invalid === "code" ? INVALID : ""}`}
                  value={draft.code}
                  maxLength={40}
                  aria-invalid={invalid === "code"}
                  onChange={(e) => {
                    setDraft({ ...draft, code: normalizeCode(e.target.value) });
                    setInvalid(null);
                  }}
                  placeholder="např. LETO2026"
                />
                <button
                  type="button"
                  className="btn-ghost h-10 !px-3 !py-0 text-sm"
                  onClick={() => setDraft({ ...draft, code: generateCode(site?.name ?? "") })}
                >
                  Vygenerovat
                </button>
              </div>
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-medium">Sleva</span>
              <div className="flex gap-2">
                <div className="inline-flex rounded-xl border border-line bg-bg p-1" role="radiogroup" aria-label="Typ slevy">
                  {(
                    [
                      ["pct", "%"],
                      ["czk", "Kč"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={draft.kind === k}
                      onClick={() => setDraft({ ...draft, kind: k })}
                      className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                        draft.kind === k ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative w-32">
                  <input
                    id="voucher-value"
                    className={`control w-full !pr-10 ${invalid === "value" ? INVALID : ""}`}
                    aria-invalid={invalid === "value"}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={draft.kind === "pct" ? 100 : undefined}
                    aria-label="Hodnota slevy"
                    value={draft.value}
                    onChange={(e) => {
                      setDraft({ ...draft, value: e.target.value });
                      setInvalid(null);
                    }}
                    placeholder={draft.kind === "pct" ? "např. 10" : "např. 1000"}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-soft">
                    {draft.kind === "pct" ? "%" : "Kč"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Platí od</span>
              <input
                className="control w-full"
                type="date"
                value={draft.validFrom}
                onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Platí do</span>
              <input
                className="control w-full"
                type="date"
                value={draft.validTo}
                onChange={(e) => setDraft({ ...draft, validTo: e.target.value })}
              />
            </label>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium">Počet použití</span>
              <div className="flex gap-2">
                <div className="inline-flex shrink-0 rounded-xl border border-line bg-bg p-1" role="radiogroup" aria-label="Omezení počtu použití">
                  {(
                    [
                      [true, "Omezit"],
                      [false, "Neomezeně"],
                    ] as const
                  ).map(([lim, label]) => (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      aria-checked={draft.limited === lim}
                      onClick={() => {
                        setDraft({ ...draft, limited: lim, maxUses: lim && !draft.maxUses ? "1" : draft.maxUses });
                        setInvalid(null);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-sm font-medium transition ${
                        draft.limited === lim ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {draft.limited && (
                  <div className="relative w-40">
                    <input
                      id="voucher-uses"
                      className={`control w-full !pr-20 ${invalid === "uses" ? INVALID : ""}`}
                      aria-invalid={invalid === "uses"}
                      aria-label="Kolikrát jde voucher použít"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={draft.maxUses}
                      onChange={(e) => {
                        setDraft({ ...draft, maxUses: e.target.value });
                        setInvalid(null);
                      }}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-soft">
                      × použití
                    </span>
                  </div>
                )}
              </div>
              <span className="mt-1 block text-xs text-soft">
                {draft.limited
                  ? "Např. 1× pro dárkový poukaz. Zrušená rezervace použití vrátí."
                  : "Kód můžou použít všichni, kdo ho znají."}
              </span>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Poznámka <span className="font-normal text-soft">(jen pro tebe)</span>
            </span>
            <input
              className="control w-full"
              maxLength={120}
              placeholder="např. Dárkový poukaz pro Novákovy"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </label>

          {draftValue > 0 && (
            <p className="rounded-xl bg-bg px-3 py-2 text-sm text-soft">
              {describe({
                kind: draft.kind,
                value: draftValue,
                validFrom: draft.validFrom || null,
                validTo: draft.validTo || null,
                maxUses: draft.limited && draft.maxUses ? Number(draft.maxUses) : null,
              })}
              {draft.kind === "czk" && ` · jen na pobyt dražší než ${czk(draftValue)}`}
            </p>
          )}

          {formError && <p className="text-sm font-medium text-coral">{formError}</p>}

          <div className="flex gap-2">
            <button type="button" className="btn-primary h-10 !px-5 !py-0 text-sm" onClick={save}>
              {editing === "new" ? "Vytvořit voucher" : "Uložit změny"}
            </button>
            <button type="button" className="btn-ghost h-10 !px-4 !py-0 text-sm" onClick={() => setEditing(null)}>
              Zrušit
            </button>
          </div>
        </div>
      )}

      {withStatus.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            className="control min-w-52 flex-1"
            placeholder="Hledat kód nebo poznámku…"
            aria-label="Hledat voucher"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Dropdown
            label="Stav"
            value={filter}
            align="right"
            onChange={(v) => setFilter(v as typeof filter)}
            items={[
              { value: "all", label: "Všechny stavy" },
              ...(Object.keys(STATUS_LABEL) as VoucherStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
            ]}
          />
        </div>
      )}

      <div className="space-y-2">
        {withStatus.length === 0 && editing === null && (
          <div className="rounded-2xl border-2 border-dashed border-line bg-surface p-8 text-center">
            <p className="font-semibold">Zatím žádné vouchery</p>
            <p className="mt-1 text-sm text-soft">
              Vytvoř slevový kód pro akci, věrné hosty nebo dárkový poukaz.
            </p>
            <button type="button" className="btn-primary mt-4 h-10 !px-4 !py-0 text-sm" onClick={startNew}>
              + Nový voucher
            </button>
          </div>
        )}
        {withStatus.length > 0 && shown.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-soft">
            Tomuhle filtru neodpovídá žádný voucher.
          </p>
        )}

        {shown.map((v) => {
          const expanded = open === v.id;
          return (
            <div key={v.id} className={`rounded-2xl border border-line bg-surface ${v.status === "active" ? "" : "opacity-80"}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copy(v.code)}
                      title="Zkopírovat kód"
                      className="rounded-lg bg-bg px-2 py-0.5 font-mono text-[15px] font-semibold tracking-wide transition hover:bg-line/60"
                    >
                      {v.code}
                    </button>
                    {copied === v.code && <span className="text-xs text-pine">Zkopírováno</span>}
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[v.status]}`}>
                      {STATUS_LABEL[v.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-soft">{describe(v)}</p>
                  {v.note && <p className="mt-0.5 text-xs text-soft">{v.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : v.id)}
                    disabled={v.uses === 0}
                    className="text-right text-sm disabled:cursor-default"
                    aria-expanded={expanded}
                  >
                    <span className="block font-semibold">
                      {v.uses}
                      {v.maxUses ? ` / ${v.maxUses}` : ""}× použito
                    </span>
                    {v.uses > 0 && <span className="block text-xs text-pine">−{czk(v.discountTotal)} {expanded ? "▴" : "▾"}</span>}
                  </button>
                  <label className="flex cursor-pointer items-center" title={v.active ? "Vypnout" : "Zapnout"}>
                    <input type="checkbox" className="peer sr-only" checked={v.active} onChange={() => toggle(v)} />
                    <span className="relative h-6 w-10 rounded-full bg-line transition peer-checked:bg-pine after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
                  </label>
                </div>
              </div>

              <div className="flex gap-4 border-t border-line px-4 py-2 text-sm">
                <button type="button" className="font-medium text-soft hover:text-ink" onClick={() => startEdit(v)}>
                  Upravit
                </button>
                {v.uses === 0 && (
                  <button type="button" className="font-medium text-soft hover:text-coral" onClick={() => remove(v)}>
                    Smazat
                  </button>
                )}
              </div>

              {expanded && (
                <div className="divide-y divide-line border-t border-line bg-bg/40">
                  {v.reservations.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{r.guestName}</span>
                        <span className="text-soft">
                          {" "}
                          · {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-pine">−{czk(r.discount)}</span>
                        <Link href={`/r/${r.publicId}`} target="_blank" className="text-soft hover:text-ink">
                          ↗
                        </Link>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {withStatus.length > 0 && (
        <p className="text-xs text-soft">
          Sleva se počítá z ubytování a úklidu, poplatek z pobytu platí host vždy celý. Použitý voucher nejde smazat —
          vypni ho, ať zůstane historie. Když se rezervace zruší, použití se voucheru vrátí.
        </p>
      )}
    </div>
  );
}
