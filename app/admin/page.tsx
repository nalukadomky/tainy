"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAdminData, fmtDate, STATUS_LABEL, STATUS_STYLE } from "@/lib/admin";
import { czk, nightsBetween } from "@/lib/pricing";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

const MONTHS_CS = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];

function Dashboard() {
  const params = useSearchParams();
  const welcome = params.get("vitej") === "1";
  const { site, reservations, costs, loading, error } = useAdminData();

  const stats = useMemo(() => {
    const now = new Date();
    const paid = reservations.filter((r) => r.status === "paid");

    // Tržby po měsících za posledních 6 měsíců (podle data příjezdu)
    const months: { label: string; key: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: MONTHS_CS[d.getMonth()], key: monthKey(d), revenue: 0 });
    }
    for (const r of paid) {
      const key = monthKey(new Date(r.startDate));
      const m = months.find((x) => x.key === key);
      if (m) m.revenue += r.totalPrice;
    }

    const thisMonthKey = monthKey(now);
    const revenueThisMonth = months.find((m) => m.key === thisMonthKey)?.revenue ?? 0;

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
    const totalCosts = costs.reduce((sum, c) => sum + c.amount, 0);

    return { months, revenueThisMonth, occupancy, upcoming, totalRevenue, totalCosts };
  }, [reservations, costs]);

  if (loading) return <p className="py-16 text-center text-soft">Načítám přehled…</p>;
  if (error || !site)
    return (
      <div className="py-16 text-center">
        <p className="text-soft">{error}</p>
        <Link href="/onboarding" className="btn-primary mt-4">Vytvořit web</Link>
      </div>
    );

  const maxRevenue = Math.max(...stats.months.map((m) => m.revenue), 1);

  return (
    <div className="space-y-6">
      {welcome && (
        <div className="rise ai-chip rounded-2xl p-5">
          <h2 className="font-display text-xl font-semibold">🎉 Tvůj web je na světě!</h2>
          <p className="mt-1 text-sm text-soft">
            Podívej se, jak vypadá pro hosty, a pošli jim odkaz. Všechno tady můžeš kdykoli upravit
            {site.tier === "pro" ? " — klidně hlasem přes AI asistenta." : "."}
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
        {site.tier === "pro" && (
          <span className="ai-chip hidden rounded-full px-3 py-1.5 text-xs font-bold sm:block">
            t<span className="ai-mark">ai</span>ny Pro
          </span>
        )}
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
        <h2 className="font-display text-lg font-semibold">Tržby za posledních 6 měsíců</h2>
        <div className="mt-5 flex h-44 items-end gap-3 border-b border-line pb-0">
          {stats.months.map((m) => (
            <div key={m.key} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${m.label}: ${czk(m.revenue)}`}>
              <span className="max-w-full truncate text-[11px] font-semibold text-soft opacity-0 transition group-hover:opacity-100">
                {czk(m.revenue)}
              </span>
              <div
                className="w-full max-w-12 rounded-t-[4px] bg-pine transition group-hover:bg-pine-dark"
                style={{ height: `${Math.max(2, (m.revenue / maxRevenue) * 130)}px` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-3">
          {stats.months.map((m) => (
            <span key={m.key} className="flex-1 text-center text-xs text-soft">
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Nadcházející rezervace */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Nadcházející pobyty</h2>
          <Link href="/admin/rezervace" className="text-sm font-medium text-pine hover:underline">
            Všechny →
          </Link>
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
                  {fmtDate(r.startDate)} – {fmtDate(r.endDate)} · {r.guests}{" "}
                  {r.guests === 1 ? "host" : r.guests < 5 ? "hosté" : "hostů"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{czk(r.totalPrice)}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
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
