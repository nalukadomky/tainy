"use client";

import { useEffect, useMemo, useState } from "react";
import { SOURCE_LABEL, type Reservation } from "@/lib/admin";
import { czk, nightsBetween, plural } from "@/lib/pricing";
import { todayISO } from "@/lib/stay";

// Přehled „Odkud přicházejí rezervace“: poměr vlastního webu a portálů
// (Airbnb, Booking…) za zvolené období. Jde sbalit — v hlavičce pak zůstane
// podíl webu a tenký pruh. Sbalení i období si pamatuje prohlížeč.

type Period = "year" | "12" | "all";
const PERIOD_LABEL: Record<Period, string> = { year: "Letos", "12": "12 měsíců", all: "Vše" };
// Pevné pořadí — Object.keys by číselný klíč „12“ dal dopředu
const PERIODS: Period[] = ["year", "12", "all"];

// Barvy zdrojů: web v barvě administrace, portály v jejich typických odstínech
const COLOR: Record<string, string> = {
  web: "var(--pine)",
  widget: "color-mix(in srgb, var(--pine) 55%, white)",
  airbnb: "#e0565b",
  booking: "#2b5aa8",
  manual: "#b3a88f",
  other: "#8a8f98",
};
const ORDER = ["web", "widget", "airbnb", "booking", "other", "manual"];

/** Ukázkové rezervace z demo režimu webu se počítají jako web. */
const sourceOf = (r: Reservation) => (r.source === "demo" ? "web" : SOURCE_LABEL[r.source] ? r.source : "other");

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function SourceMix({ reservations }: { reservations: Reservation[] }) {
  const [open, setOpen] = useState(true);
  const [period, setPeriod] = useState<Period>("year");
  useEffect(() => {
    setOpen(stored("tainy.sources-collapsed", ["0", "1"], "0") === "0");
    setPeriod(stored("tainy.sources-period", PERIODS, "year"));
  }, []);

  const mix = useMemo(() => {
    const today = todayISO();
    const from = period === "year" ? `${today.slice(0, 4)}-01-01` : period === "12" ? `${Number(today.slice(0, 4)) - 1}${today.slice(4)}` : "";
    const rows = new Map<string, { count: number; nights: number; revenue: number }>();
    let total = 0;
    for (const r of reservations) {
      if (r.status === "cancelled") continue;
      if (from && r.startDate.slice(0, 10) < from) continue;
      const key = sourceOf(r);
      const row = rows.get(key) ?? { count: 0, nights: 0, revenue: 0 };
      row.count += 1;
      row.nights += nightsBetween(new Date(r.startDate), new Date(r.endDate));
      row.revenue += r.totalPrice;
      rows.set(key, row);
      total += 1;
    }
    const list = [...rows.entries()]
      .map(([key, v]) => ({ key, ...v, share: total ? v.count / total : 0 }))
      .sort((a, b) => b.count - a.count || ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
    return { list, total, web: rows.get("web")?.count ?? 0 };
  }, [reservations, period]);

  const webShare = mix.total ? Math.round((mix.web / mix.total) * 100) : 0;
  const pct = (share: number) => `${Math.round(share * 100)} %`;

  const bar = (height: number) => (
    <div className="flex w-full overflow-hidden rounded-full bg-line" style={{ height }} aria-hidden>
      {mix.list.map((s) => (
        <span key={s.key} title={`${SOURCE_LABEL[s.key]}: ${pct(s.share)}`} style={{ width: `${s.share * 100}%`, background: COLOR[s.key] }} />
      ))}
    </div>
  );

  function toggle() {
    setOpen((o) => {
      store("tainy.sources-collapsed", o ? "1" : "0");
      return !o;
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={toggle} aria-expanded={open} className="group flex w-full min-w-0 items-start gap-2 text-left sm:w-auto sm:flex-1">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-display text-lg font-semibold">
              Odkud přicházejí rezervace
              <span
                aria-hidden
                className="text-sm text-soft transition-transform group-hover:text-ink"
                style={{ transform: open ? "rotate(180deg)" : "none", display: "inline-block" }}
              >
                ▾
              </span>
            </span>
            <span className="block text-sm text-soft">
              {mix.total ? (
                <>
                  {PERIOD_LABEL[period]}: z vlastního webu <strong className="font-semibold text-ink">{webShare} %</strong> rezervací
                </>
              ) : (
                `${PERIOD_LABEL[period]}: zatím žádné rezervace`
              )}
            </span>
            {!open && mix.total > 0 && <span className="mt-3 block">{bar(6)}</span>}
          </span>
        </button>
        {open && (
          <div className="flex w-full shrink-0 rounded-xl bg-bg p-1 sm:w-auto" role="radiogroup" aria-label="Období">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => {
                  setPeriod(p);
                  store("tainy.sources-period", p);
                }}
                className={`flex-1 rounded-lg px-3 py-1 text-sm font-medium transition sm:flex-none ${
                  period === p ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"
                }`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      {open &&
        (mix.total === 0 ? (
          <p className="mt-4 text-sm text-soft">Za tohle období tu zatím nejsou žádné rezervace.</p>
        ) : (
          <>
            <div className="mt-5">{bar(14)}</div>
            <ul className="mt-4 divide-y divide-line">
              {mix.list.map((s) => (
                <li key={s.key} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLOR[s.key] }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{SOURCE_LABEL[s.key]}</span>
                    {(s.key === "web" || s.key === "widget") && <span className="ml-2 text-xs text-soft">bez provize</span>}
                    <span className="block text-xs text-soft sm:inline sm:before:content-['_·_']">
                      {s.count} {plural(s.count, "rezervace", "rezervace", "rezervací")} · {s.nights}{" "}
                      {plural(s.nights, "noc", "noci", "nocí")}
                    </span>
                  </span>
                  <span className="hidden w-28 text-right text-soft sm:block">{czk(s.revenue)}</span>
                  <span className="w-14 text-right font-display text-lg font-semibold tabular-nums">{pct(s.share)}</span>
                </li>
              ))}
            </ul>
          </>
        ))}
    </div>
  );
}
