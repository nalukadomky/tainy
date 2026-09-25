"use client";

import { useMemo, useState } from "react";
import {
  useAdminData,
  fmtDate,
  guestsLabel,
  norm,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  type Reservation,
} from "@/lib/admin";
import { czk, nightsBetween, plural } from "@/lib/pricing";
import { todayISO } from "@/lib/stay";
import { Dropdown } from "@/components/Dropdown";

type Filter = "all" | Reservation["status"];
/** all | upcoming | past | měsíc příjezdu ve tvaru YYYY-MM */
type Period = string;
type Sort = "arrival-desc" | "arrival-asc" | "created-desc" | "price-desc";

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

export default function ReservationsPage() {
  const { site, reservations, loading, error, setStatus: saveStatus } = useAdminData();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState<Sort>("arrival-desc");
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: Reservation["status"]) {
    setBusy(id);
    try {
      await saveStatus(id, status);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Změna selhala.");
    }
    setBusy(null);
  }

  // Měsíce a zdroje, které se v rezervacích opravdu vyskytují — nabízet prázdné volby nemá smysl.
  const months = useMemo(
    () => [...new Set(reservations.map((r) => r.startDate.slice(0, 7)))].sort().reverse(),
    [reservations]
  );
  const sources = useMemo(() => [...new Set(reservations.map((r) => r.source))], [reservations]);

  // Vše kromě stavu: počty na čipech stavů pak odpovídají ostatním filtrům.
  const matching = useMemo(() => {
    const today = todayISO();
    const q = norm(query.trim());
    return reservations.filter((r) => {
      if (source !== "all" && r.source !== source) return false;
      const end = r.endDate.slice(0, 10);
      if (period === "upcoming" && end <= today) return false;
      if (period === "past" && end > today) return false;
      if (period.length === 7 && !r.startDate.startsWith(period)) return false;
      if (q && !norm(`${r.guestName} ${r.email} ${r.phone} ${r.publicId}`).includes(q)) return false;
      return true;
    });
  }, [reservations, query, period, source]);

  const shown = useMemo(() => {
    const list = matching.filter((r) => filter === "all" || r.status === filter);
    const by: Record<Sort, (a: Reservation, b: Reservation) => number> = {
      "arrival-desc": (a, b) => b.startDate.localeCompare(a.startDate),
      "arrival-asc": (a, b) => a.startDate.localeCompare(b.startDate),
      "created-desc": (a, b) => b.createdAt.localeCompare(a.createdAt),
      "price-desc": (a, b) => b.totalPrice - a.totalPrice,
    };
    return list.sort(by[sort]);
  }, [matching, filter, sort]);

  const count = (f: Filter) => matching.filter((r) => f === "all" || r.status === f).length;
  const active = shown.filter((r) => r.status !== "cancelled");
  const sum = active.reduce((acc, r) => acc + r.totalPrice, 0);
  const nights = active.reduce((acc, r) => acc + nightsBetween(new Date(r.startDate), new Date(r.endDate)), 0);
  const filtered = filter !== "all" || query !== "" || period !== "all" || source !== "all";

  function resetFilters() {
    setFilter("all");
    setQuery("");
    setPeriod("all");
    setSource("all");
  }

  if (loading) return <p className="py-16 text-center text-soft">Načítám rezervace…</p>;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Rezervace</h1>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soft"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="control w-full !pl-9"
            placeholder="Hledat hosta, e-mail, telefon…"
            aria-label="Hledat rezervaci"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Dropdown
          label="Termín"
          value={period}
          onChange={setPeriod}
          items={[
            { value: "all", label: "Všechny termíny" },
            { value: "upcoming", label: "Nadcházející" },
            { value: "past", label: "Proběhlé" },
            { group: "Měsíc příjezdu" },
            ...months.map((m) => ({ value: m, label: monthLabel(m) })),
          ]}
        />
        <Dropdown
          label="Zdroj"
          value={source}
          onChange={setSource}
          items={[
            { value: "all", label: "Všechny zdroje" },
            ...sources.map((src) => ({ value: src, label: SOURCE_LABEL[src] ?? src })),
          ]}
        />
        <Dropdown
          label="Řazení"
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          align="right"
          items={[
            { value: "arrival-desc", label: "Nejpozdější příjezd" },
            { value: "arrival-asc", label: "Nejdřívější příjezd" },
            { value: "created-desc", label: "Nově vytvořené" },
            { value: "price-desc", label: "Nejvyšší cena" },
          ]}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Všechny"],
            ["pending", "Čekající"],
            ["paid", "Zaplacené"],
            ["cancelled", "Zrušené"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              filter === id
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface text-soft hover:border-ink/30"
            }`}
          >
            {label}
            <span className="opacity-60">{count(id)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-soft">
        <p>
          <strong className="font-semibold text-ink">
            {shown.length} {plural(shown.length, "rezervace", "rezervace", "rezervací")}
          </strong>
          {active.length > 0 && (
            <>
              {" "}· {czk(sum)} · {nights} {plural(nights, "noc", "noci", "nocí")}
              {active.length < shown.length && " (bez zrušených)"}
            </>
          )}
        </p>
        {filtered && (
          <button onClick={resetFilters} className="font-medium text-pine hover:underline">
            Zrušit filtry
          </button>
        )}
      </div>

      <div className="space-y-3">
        {shown.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-soft">
            Tomuhle filtru neodpovídá žádná rezervace.
          </p>
        )}
        {shown.map((r) => (
          <div key={r.id} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
                  {r.guestName}
                  {r.source !== "web" && (
                    <span className="rounded-full border border-line px-2 py-0.5 font-sans text-[11px] font-semibold text-soft">
                      {SOURCE_LABEL[r.source] ?? r.source}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-soft">
                  {fmtDate(r.startDate)} – {fmtDate(r.endDate)} · {guestsLabel(r, site)}
                </p>
                <p className="mt-0.5 text-sm text-soft">
                  {r.email}
                  {r.phone && ` · ${r.phone}`}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-semibold">{czk(r.totalPrice)}</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              {r.status === "pending" && (
                <button
                  className="btn-primary !px-4 !py-1.5 text-xs"
                  disabled={busy === r.id}
                  onClick={() => setStatus(r.id, "paid")}
                >
                  ✓ Označit zaplaceno
                </button>
              )}
              {r.status !== "cancelled" ? (
                <button
                  className="btn-ghost !px-4 !py-1.5 text-xs !text-coral"
                  disabled={busy === r.id}
                  onClick={() => setStatus(r.id, "cancelled")}
                >
                  ✕ Zrušit rezervaci
                </button>
              ) : (
                <button
                  className="btn-ghost !px-4 !py-1.5 text-xs"
                  disabled={busy === r.id}
                  onClick={() => setStatus(r.id, "pending")}
                >
                  ↺ Obnovit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
