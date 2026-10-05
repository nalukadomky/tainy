"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAdminData, fmtStay } from "@/lib/admin";
import { StatusMenu } from "@/components/StatusMenu";
import { Dropdown } from "@/components/Dropdown";
import { spentToDate } from "@/lib/costs";
import { czk, nightsBetween } from "@/lib/pricing";
import { DashboardSkeleton } from "@/components/Skeleton";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

const MONTHS_CS = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];

type Range = "6" | "12" | "year" | "lastYear" | "next6" | "all";
const RANGE_LABEL: Record<Range, string> = {
  "6": "Posledních 6 měsíců",
  "12": "Posledních 12 měsíců",
  year: "Tento rok",
  lastYear: "Minulý rok",
  next6: "Příštích 6 měsíců",
  all: "Celá historie",
};

function Dashboard() {
  const params = useSearchParams();
  const welcome = params.get("vitej") === "1";
  const { site, reservations, costs, loading, error, setStatus } = useAdminData();
  const [range, setRange] = useState<Range>("6");

  const stats = useMemo(() => {
    const now = new Date();
    const paid = reservations.filter((r) => r.status === "paid");

    // Tržby tento měsíc (podle data příjezdu)
    const thisMonthKey = monthKey(now);
    const revenueThisMonth = paid
      .filter((r) => monthKey(new Date(r.startDate)) === thisMonthKey)
      .reduce((sum, r) => sum + r.totalPrice, 0);

    // Obsazenost tento měsíc: rezervované noci / dny v měsíci
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    let bookedNights = 0;
    for (const r of reservations.filter((r) => r.status !== "cancelled")) {
      const s = new Date(r.startDate) < mStart ? mStart : new Date(r.startDate);
      const e = new Date(r.endDate) > mEnd ? mEnd : new Date(r.endDate);
      bookedNights += Math.max(0, nightsBetween(s, e));
    }
    const occupancy = Math.min(100, Math.round((bookedNights / daysInMonth) * 100));

    const upcoming = reservations
      .filter((r) => r.status !== "cancelled" && new Date(r.endDate) >= now)
      .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))
      .slice(0, 4);

    const totalRevenue = paid.reduce((sum, r) => sum + r.totalPrice, 0);
    // Opakované náklady se počítají jen za platby, které už nastaly.
    const totalCosts = spentToDate(costs);

    return { revenueThisMonth, occupancy, upcoming, totalRevenue, totalCosts };
  }, [reservations, costs]);

  // Graf tržeb po měsících (podle data příjezdu) pro zvolené období.
  const chart = useMemo(() => {
    const now = new Date();
    const paid = reservations.filter((r) => r.status === "paid");
    let from: Date;
    let to: Date;
    if (range === "year") {
      from = new Date(now.getFullYear(), 0, 1);
      to = new Date(now.getFullYear(), 11, 1);
    } else if (range === "lastYear") {
      from = new Date(now.getFullYear() - 1, 0, 1);
      to = new Date(now.getFullYear() - 1, 11, 1);
    } else if (range === "next6") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 5, 1);
    } else if (range === "all") {
      const first = paid.reduce((min, r) => (r.startDate < min ? r.startDate : min), now.toISOString());
      // Konec až u poslední zaplacené rezervace, ať součet sedí s „Tržby celkem"
      // (zaplacené rezervace s budoucím příjezdem).
      const last = paid.reduce((max, r) => (r.startDate > max ? r.startDate : max), now.toISOString());
      from = new Date(new Date(first).getFullYear(), new Date(first).getMonth(), 1);
      to = new Date(new Date(last).getFullYear(), new Date(last).getMonth(), 1);
    } else {
      const n = range === "12" ? 11 : 5;
      from = new Date(now.getFullYear(), now.getMonth() - n, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const months: { key: string; label: string; title: string; revenue: number; current: boolean }[] = [];
    for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      months.push({
        key: monthKey(d),
        // Leden nese rok, ať je v delším období vidět přelom
        label: d.getMonth() === 0 && months.length > 0 ? `${MONTHS_CS[0]} ’${String(d.getFullYear()).slice(2)}` : MONTHS_CS[d.getMonth()],
        title: d.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" }),
        revenue: 0,
        current: monthKey(d) === monthKey(now),
      });
    }
    for (const r of paid) {
      const m = months.find((x) => x.key === monthKey(new Date(r.startDate)));
      if (m) m.revenue += r.totalPrice;
    }
    const total = months.reduce((sum, m) => sum + m.revenue, 0);
    return { months, total, max: Math.max(...months.map((m) => m.revenue), 1) };
  }, [reservations, range]);

  if (loading) return <DashboardSkeleton />;
  if (error || !site)
    return (
      <div className="py-16 text-center">
        <p className="text-soft">{error}</p>
        <Link href="/onboarding" className="btn-primary mt-4">Vytvořit web</Link>
      </div>
    );

  return (
    <div className="space-y-6">
      {welcome && (
        <div className="rise rounded-2xl border border-pine/20 bg-pine/5 p-5">
          <h2 className="font-display text-xl font-semibold">🎉 Tvůj web je na světě!</h2>
          <p className="mt-1 text-sm text-soft">
            Podívej se, jak vypadá pro hosty, a pošli jim odkaz. Všechno tady můžeš kdykoli upravit.
          </p>
          <Link
            href={`/w/${site.slug}`}
            className="btn-primary mt-3 !px-5 !py-2 text-sm"
            target="_blank"
          >
            Otevřít můj web ↗
          </Link>
        </div>
      )}

      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Přehled</h1>
          <p className="mt-1 text-sm text-soft">
            {site.name} ·{" "}
            <Link className="underline decoration-line underline-offset-4 hover:text-ink" href={`/w/${site.slug}`} target="_blank">
              /w/{site.slug} ↗
            </Link>
          </p>
        </div>
      </div>

      {/* KPI dlaždice */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Tržby tento měsíc", value: czk(stats.revenueThisMonth) },
          { label: "Obsazenost měsíce", value: `${stats.occupancy} %` },
          { label: "Tržby celkem", value: czk(stats.totalRevenue) },
          {
            label: "Bilance (tržby − náklady)",
            value: czk(stats.totalRevenue - stats.totalCosts),
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-medium text-soft">{kpi.label}</p>
            <p className="mt-1.5 font-display text-xl font-semibold sm:text-2xl">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Graf tržeb */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Tržby</h2>
            <p className="text-sm text-soft">
              {RANGE_LABEL[range]}: <strong className="font-semibold text-ink">{czk(chart.total)}</strong>
            </p>
          </div>
          <Dropdown
            label="Období grafu"
            value={range}
            onChange={(v) => setRange(v as Range)}
            align="right"
            items={(Object.keys(RANGE_LABEL) as Range[]).map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
          />
        </div>
        <div className={`mt-5 flex h-44 items-end border-b border-line ${chart.months.length > 12 ? "gap-1" : "gap-2 sm:gap-3"}`}>
          {chart.months.map((m) => (
            <div
              key={m.key}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              title={`${m.title}: ${czk(m.revenue)}`}
            >
              <span className="pointer-events-none absolute -top-1 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                {czk(m.revenue)}
              </span>
              <div
                className={`w-full max-w-12 rounded-t-[4px] transition group-hover:bg-pine-dark ${m.current ? "bg-pine" : "bg-pine/75"}`}
                style={{ height: `${Math.max(2, (m.revenue / chart.max) * 150)}px` }}
              />
            </div>
          ))}
        </div>
        <div className={`mt-2 flex ${chart.months.length > 12 ? "gap-1" : "gap-2 sm:gap-3"}`}>
          {chart.months.map((m, i) => (
            <span
              key={m.key}
              className={`min-w-0 flex-1 truncate text-center text-xs ${m.current ? "font-semibold text-ink" : "text-soft"} ${
                // U dlouhého období popisek jen u každého druhého měsíce
                chart.months.length > 12 && i % 2 === 1 ? "invisible" : ""
              }`}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Nadcházející rezervace */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Nadcházející pobyty</h2>
          <div className="flex gap-4">
            <Link href="/admin/kalendar" className="text-sm font-medium text-pine hover:underline">
              Kalendář →
            </Link>
            <Link href="/admin/rezervace" className="text-sm font-medium text-pine hover:underline">
              Všechny →
            </Link>
          </div>
        </div>
        <div className="mt-3 divide-y divide-line">
          {stats.upcoming.length === 0 && (
            <p className="py-4 text-sm text-soft">Žádné nadcházející pobyty. Pošli hostům odkaz na svůj web!</p>
          )}
          {stats.upcoming.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{r.guestName}</p>
                <p className="text-sm text-soft">
                  {fmtStay(r, site)} · {r.guests}{" "}
                  {r.guests === 1 ? "host" : r.guests < 5 ? "hosté" : "hostů"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{czk(r.totalPrice)}</p>
                <StatusMenu status={r.status} guestName={r.guestName} onChange={(s) => setStatus(r.id, s)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
