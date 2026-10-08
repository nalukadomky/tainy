"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminData, fmtDate, fmtStay, type Reservation, type Site } from "@/lib/admin";
import { AccessCode, accessCodeSavedMessage } from "@/components/AccessCode";
import { accessCodeSendAt } from "@/lib/access-code";
import { useToast } from "@/components/Toast";
import { StatusMenu } from "@/components/StatusMenu";
import { Dropdown } from "@/components/Dropdown";
import { spentToDate } from "@/lib/costs";
import { czk, nightsBetween, plural } from "@/lib/pricing";
import { stayTimes, todayISO } from "@/lib/stay";
import { DashboardSkeleton } from "@/components/Skeleton";
import { hasDoc } from "@/lib/legal";

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
  const { site, reservations, costs, loading, error, setStatus, setAccessCode } = useAdminData();
  const toast = useToast();
  function saveAccessCode(r: Reservation, code: string) {
    toast.show(accessCodeSavedMessage(r, code), "success");
    setAccessCode(r.id, code).catch((e: Error) => toast.show(e.message));
  }
  const [range, setRange] = useState<Range>("6");
  // Graf tržeb jde sbalit — pamatuje si to prohlížeč (jen pohodlí, žádná data)
  const [chartOpen, setChartOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("tainy.chart-collapsed") === "1") setChartOpen(false);
    } catch {}
  }, []);
  function toggleChart() {
    setChartOpen((open) => {
      try {
        localStorage.setItem("tainy.chart-collapsed", open ? "1" : "0");
      } catch {}
      return !open;
    });
  }

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
      .slice(0, 5);

    // Všechny nezaplacené (stejně jako filtr „Čekající“ v Rezervacích); kolik je po lhůtě
    const waiting = reservations.filter((r) => r.status === "pending");
    const pending = {
      count: waiting.length,
      total: waiting.reduce((sum, r) => sum + r.totalPrice, 0),
      overdue: waiting.filter((r) => r.expiresAt && new Date(r.expiresAt) <= now).length,
    };

    const totalRevenue = paid.reduce((sum, r) => sum + r.totalPrice, 0);
    // Opakované náklady se počítají jen za platby, které už nastaly.
    const totalCosts = spentToDate(costs);

    return { revenueThisMonth, occupancy, upcoming, pending, totalRevenue, totalCosts };
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
  const missing = site
    ? ([
        (!site.businessName.trim() || !site.businessId.trim()) && "jméno a IČ provozovatele",
        !hasDoc(site, "terms") && "obchodní podmínky",
        !site.bankAccount.trim() && "číslo účtu pro QR platbu",
      ].filter(Boolean) as string[])
    : [];
  if (error || !site)
    return (
      <div className="py-16 text-center">
        <p className="text-soft">{error}</p>
        <Link href="/onboarding" className="btn-primary mt-4">Vytvořit web</Link>
      </div>
    );

  return (
    <div className="space-y-6">
      {toast.node}
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

      {/* Chybějící údaje webu (provozovatel, podmínky, účet pro platby) */}
      {missing.length > 0 && (
        <Link
          href="/admin/nastaveni?sekce=pravni"
          className="flex items-center justify-between gap-4 rounded-2xl border border-amber/40 bg-amber/10 p-4 transition hover:bg-amber/15"
        >
          <span>
            <span className="block text-sm font-semibold text-ink">Doplň údaje pro rezervace</span>
            <span className="block text-sm text-soft">
              Chybí {missing.length > 1 ? `${missing.slice(0, -1).join(", ")} a ${missing.at(-1)}` : missing[0]}.
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-pine">Doplnit →</span>
        </Link>
      )}

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

      {/* Nejbližší pobyt a platby, které čekají */}
      {(stats.upcoming.length > 0 || stats.pending.count > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.upcoming[0] && (
            <div className={stats.pending.count > 0 ? "sm:col-span-2" : "sm:col-span-3"}>
              <NextStay
                r={stats.upcoming[0]}
                site={site}
                onStatus={(s) => setStatus(stats.upcoming[0].id, s)}
                onAccessCode={(code) => saveAccessCode(stats.upcoming[0], code)}
              />
            </div>
          )}
          {stats.pending.count > 0 && (
            <Link
              href="/admin/rezervace?stav=pending"
              className={`group flex flex-col rounded-2xl border border-line bg-surface p-5 transition hover:border-amber ${
                stats.upcoming[0] ? "" : "sm:col-span-3"
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-soft">
                <span className="h-2 w-2 rounded-full bg-amber" aria-hidden />
                Čeká na platbu
              </span>
              <span className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-4xl font-semibold leading-none">{stats.pending.count}</span>
                <span className="text-sm text-soft">{plural(stats.pending.count, "rezervace", "rezervace", "rezervací")}</span>
              </span>
              <span className="mt-2 text-sm font-semibold">{czk(stats.pending.total)}</span>
              {stats.pending.overdue > 0 && (
                <span className="text-xs text-coral">
                  {stats.pending.overdue === stats.pending.count ? "všechny" : stats.pending.overdue} po lhůtě na zaplacení
                </span>
              )}
              <span className="mt-auto pt-3 text-sm font-medium text-pine group-hover:underline">Zobrazit →</span>
            </Link>
          )}
        </div>
      )}

      {/* Graf tržeb */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={toggleChart}
            aria-expanded={chartOpen}
            className="group flex items-start gap-2 text-left"
          >
            <span>
              <span className="flex items-center gap-2 font-display text-lg font-semibold">
                Tržby
                <span
                  aria-hidden
                  className="text-sm text-soft transition-transform group-hover:text-ink"
                  style={{ transform: chartOpen ? "rotate(180deg)" : "none", display: "inline-block" }}
                >
                  ▾
                </span>
              </span>
              <span className="block text-sm text-soft">
                {RANGE_LABEL[range]}: <strong className="font-semibold text-ink">{czk(chart.total)}</strong>
              </span>
            </span>
          </button>
          {chartOpen && (
          <Dropdown
            label="Období grafu"
            value={range}
            onChange={(v) => setRange(v as Range)}
            align="right"
            items={(Object.keys(RANGE_LABEL) as Range[]).map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
          />
          )}
        </div>
        {chartOpen && (
        <>
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
        </>
        )}
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
          {stats.upcoming.length === 1 && (
            <p className="py-4 text-sm text-soft">Další pobyty zatím nejsou — nejbližší je nahoře.</p>
          )}
          {stats.upcoming.slice(1).map((r) => (
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

/** Kolik dní zbývá do příjezdu, nebo že pobyt právě probíhá. */
function countdown(r: Reservation): { label: string; now: boolean } {
  const today = todayISO();
  const start = r.startDate.slice(0, 10);
  const end = r.endDate.slice(0, 10);
  if (start <= today && today < end) return { label: "Právě probíhá", now: true };
  const days = Math.round((Date.parse(start) - Date.parse(today)) / 86_400_000);
  if (days <= 0) return { label: "Dnes přijíždí", now: true };
  if (days === 1) return { label: "Zítra přijíždí", now: true };
  return { label: `Za ${days} ${plural(days, "den", "dny", "dní")}`, now: false };
}

/** Krátký rozsah termínu: „20.–22. 10. 2026“. */
function shortRange(startIso: string, endIso: string): string {
  const [sy, sm, sd] = startIso.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = endIso.slice(0, 10).split("-").map(Number);
  if (sy === ey && sm === em) return `${sd}.–${ed}. ${em}. ${ey}`;
  if (sy === ey) return `${sd}. ${sm}. – ${ed}. ${em}. ${ey}`;
  return `${sd}. ${sm}. ${sy} – ${ed}. ${em}. ${ey}`;
}

/** Karta s nejbližším (nebo právě probíhajícím) pobytem — klik otevře detail rezervace. */
function NextStay({
  r,
  site,
  onStatus,
  onAccessCode,
}: {
  r: Reservation;
  site: Site | null;
  onStatus: (status: Reservation["status"]) => Promise<void>;
  onAccessCode: (code: string) => void;
}) {
  const router = useRouter();
  const c = countdown(r);
  const times = site ? stayTimes(r, site) : r;
  return (
    <div
      // Klik na kartu otevře detail rezervace v Rezervacích (kromě tlačítek a oken)
      onClick={(e) => {
        if (!e.currentTarget.contains(e.target as Node)) return;
        if ((e.target as HTMLElement).closest("button, a, input, [role=menu], [role=dialog]")) return;
        router.push(`/admin/rezervace?detail=${r.id}`);
      }}
      className="group flex h-full cursor-pointer flex-col rounded-2xl border border-line bg-surface p-5 transition hover:border-pine/40"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-soft">
        Nejbližší pobyt · <span className={c.now ? "text-pine" : "text-ink"}>{c.label.toLowerCase()}</span>
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-display text-2xl font-semibold leading-tight">{r.guestName}</p>
          <p className="mt-1 text-sm text-soft">
            {shortRange(r.startDate, r.endDate)}
            {times.checkInTime && times.checkOutTime && ` · ${times.checkInTime} → ${times.checkOutTime}`} · {r.guests}{" "}
            {plural(r.guests, "host", "hosté", "hostů")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-xl font-semibold">{czk(r.totalPrice)}</p>
          <StatusMenu status={r.status} guestName={r.guestName} onChange={onStatus} />
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        {r.status !== "cancelled" ? (
          <AccessCode
            compact
            key={r.accessCode}
            code={r.accessCode}
            sendAt={accessCodeSendAt(r)}
            context={`${r.guestName} · ${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`}
            onSave={onAccessCode}
          />
        ) : (
          <span />
        )}
        <span className="shrink-0 text-sm font-medium text-pine group-hover:underline">Detail →</span>
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
