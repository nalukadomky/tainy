"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminData, fmtDate, usesLockCodes, type Reservation, type Site } from "@/lib/admin";
import { AccessCodeDialog, accessCodeSavedMessage } from "@/components/AccessCode";
import { accessCodeMail, fmtSendAt } from "@/lib/access-code";
import { arrivalDaysOf } from "@/lib/email-templates";
import { useToast } from "@/components/Toast";
import { StatusMenu } from "@/components/StatusMenu";
import { Dropdown } from "@/components/Dropdown";
import { spentToDate } from "@/lib/costs";
import { czk, nightsBetween, plural } from "@/lib/pricing";
import { stayTimes, todayISO } from "@/lib/stay";
import { DashboardSkeleton } from "@/components/Skeleton";
import { hasDoc } from "@/lib/legal";
import { CleaningAlerts, CleaningBadge } from "@/components/CleaningAlert";
import { UbyportAlert } from "@/components/UbyportAlert";
import { SourceMix } from "@/components/SourceMix";
import { Icon } from "@/components/Icon";
import { ActionInbox } from "@/components/ActionInbox";
import { NewReservations } from "@/components/NewReservations";
import { siteUrl } from "@/lib/domains";

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
  const changeStatus = (id: string, status: Reservation["status"]) =>
    setStatus(id, status).then((note) => {
      if (note) toast.show(note, "success");
    });
  function saveAccessCode(r: Reservation, code: string) {
    toast.show(accessCodeSavedMessage(r, code, arrivalDaysOf(site)), "success");
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

  const next = stats.upcoming[0];
  const later = stats.upcoming.slice(1);
  const inbox = (
    <ActionInbox
      slug={site.slug}
      pending={{ ...stats.pending, first: reservations.find((r) => r.status === "pending")?.guestName }}
      missing={missing}
    />
  );

  return (
    <div className="space-y-6">
      {toast.node}
      {welcome && !site.widgetOnly && (
        <div className="rise rounded-2xl border border-pine/20 bg-pine/5 p-5">
          <h2 className="font-display text-xl font-semibold"><Icon name="sparkle" size={20} className="mr-1.5 text-pine" />Tvůj web je na světě!</h2>
          <p className="mt-1 text-sm text-soft">
            Podívej se, jak vypadá pro hosty, a pošli jim odkaz. Všechno tady můžeš kdykoli upravit.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/web/builder?panel=galerie" className="btn-primary !px-5 !py-2 text-sm">
              <Icon name="camera" className="mr-1.5" />Přidat fotky
            </Link>
            <Link href={siteUrl(site)} className="btn-ghost !px-5 !py-2 text-sm" target="_blank">
              Otevřít můj web ↗
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Přehled</h1>
          <p className="mt-1 text-sm text-soft">{site.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/kalendar" className="btn-ghost !px-4 !py-2 text-sm">
            Kalendář
          </Link>
          {!site.widgetOnly && (
            <Link href={siteUrl(site)} target="_blank" className="btn-ghost !px-4 !py-2 text-sm">
              {site.customDomain && site.domainStatus === "active" ? site.customDomain : "Můj web"} ↗
            </Link>
          )}
        </div>
      </div>

      {/* Úklid po předchozím pobytu není hotový a dnes/zítra přijíždějí další hosté — výjimečné a naléhavé, proto přes celou šířku */}
      <CleaningAlerts reservations={reservations} />
      <UbyportAlert slug={site?.slug ?? null} />

      {/* Nové rezervace od poslední návštěvy (zmizí po potvrzení) */}
      <NewReservations site={site} reservations={reservations} onStatus={changeStatus} />

      {/* Na telefonu: co čeká na majitele jako první */}
      <div className="lg:hidden">{inbox}</div>

      {/* Dvousloupcový pult: vlevo pobyty a tržby, vpravo co čeká a čísla měsíce */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {next ? (
            <NextStay
              r={next}
              site={site}
              onStatus={(s) => changeStatus(next.id, s)}
              onAccessCode={(code) => saveAccessCode(next, code)}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-soft">
              Žádné nadcházející pobyty. Pošli hostům odkaz na svůj web!
            </div>
          )}

          {/* Nadcházející pobyty (bez nejbližšího, ten je nahoře) */}
          {later.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface">
              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <h2 className="font-display text-lg font-semibold">Nadcházející pobyty</h2>
                <Link href="/admin/rezervace" className="text-sm font-medium text-pine hover:underline">
                  Všechny →
                </Link>
              </div>
              <div className="divide-y divide-line">
                {later.map((r) => {
                  const d = new Date(r.startDate);
                  return (
                    <div key={r.id} className="flex items-center gap-4 px-5 py-3">
                      <span className="w-11 shrink-0 text-center leading-tight">
                        <span className="block text-[11px] font-semibold uppercase text-soft">{MONTHS_CS[d.getMonth()]}</span>
                        <span className="font-display text-xl font-semibold">{d.getDate()}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 truncate font-medium">
                          {r.guestName} <CleaningBadge alert={r.cleaningAlert} />
                        </p>
                        <p className="truncate text-sm text-soft">
                          {shortRange(r.startDate, r.endDate)} · {nightsBetween(new Date(r.startDate), new Date(r.endDate))}{" "}
                          {plural(nightsBetween(new Date(r.startDate), new Date(r.endDate)), "noc", "noci", "nocí")} · {r.guests}{" "}
                          {plural(r.guests, "host", "hosté", "hostů")}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
                        <span className="font-semibold tabular-nums">{czk(r.totalPrice)}</span>
                        <StatusMenu status={r.status} guestName={r.guestName} onChange={(s) => changeStatus(r.id, s)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Graf tržeb */}
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button type="button" onClick={toggleChart} aria-expanded={chartOpen} className="group flex items-start gap-2 text-left">
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
        </div>

        {/* Pravý sloupec; na telefonu je „K vyřízení“ úplně nahoře (viz výše) a zbytek pod pobyty */}
        <aside className="min-w-0 space-y-5">
          <div className="hidden lg:block">{inbox}</div>

          {/* Čísla měsíce */}
          <div className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="px-1 text-[15px] font-semibold first-letter:uppercase">
              {new Date().toLocaleDateString("cs-CZ", { month: "long" })}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4 px-1">
              {[
                { label: "Tržby", value: czk(stats.revenueThisMonth), big: true },
                { label: "Obsazenost", value: `${stats.occupancy} %`, big: true },
                { label: "Tržby celkem", value: czk(stats.totalRevenue) },
                { label: "Bilance", value: czk(stats.totalRevenue - stats.totalCosts), title: "Tržby celkem − náklady" },
              ].map((k) => (
                <div key={k.label} title={k.title}>
                  <p className="text-xs text-soft">{k.label}</p>
                  <p className={`mt-0.5 font-display font-semibold ${k.big ? "text-xl" : "text-base"}`}>{k.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Poměr rezervací z vlastního webu a z portálů */}
          <SourceMix reservations={reservations} compact />
        </aside>
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

/** Jeden krok přípravy pobytu v kartě nejbližšího pobytu: hotovo ✓ / čeká ○ / problém. */
function Step({ state, title, children }: { state: "done" | "wait" | "warn"; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    // Úzká karta: krok = řádek (název vlevo, podrobnost vpravo); jinak sloupce vedle sebe
    <div className="flex min-w-0 items-center gap-2.5 px-4 py-3 @[28rem]:items-start @[28rem]:px-5 @[28rem]:py-3.5">
      {state === "done" ? (
        <span className="flex h-[18px] w-[18px] shrink-0 @[28rem]:mt-0.5 items-center justify-center rounded-full bg-pine text-[10px] font-bold text-white" aria-label="Hotovo">
          ✓
        </span>
      ) : (
        <span
          className={`h-[18px] w-[18px] shrink-0 rounded-full border-2 @[28rem]:mt-0.5 ${state === "warn" ? "border-coral" : "border-amber"}`}
          aria-label={state === "warn" ? "Pozor" : "Čeká"}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 text-sm @[28rem]:block">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-[13px] text-soft">{children}</div>}
      </div>
    </div>
  );
}

/**
 * Karta s nejbližším (nebo právě probíhajícím) pobytem — nahoře host, termín a cena,
 * dole kroky přípravy (kód k zámku, úklid, check-in) — platbu ukazuje štítek stavu nahoře. Klik otevře detail rezervace.
 */
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
  const lock = r.status !== "cancelled" && usesLockCodes(site);
  const mail = accessCodeMail(r, arrivalDaysOf(site));
  const checkin = r.checkinDoneAt || r.checkinMailAt;
  const [codeOpen, setCodeOpen] = useState(false);
  const steps = [
    // Kód k zámku: kód + kdy hostovi odejde; klik otevře úpravu kódu
    lock && (
      <Step
        key="code"
        state={r.accessCode ? (mail?.sent ? "done" : "wait") : "warn"}
        title={
          <button type="button" onClick={() => setCodeOpen(true)} className="text-left hover:text-pine">
            {r.accessCode ? (
              <>
                Kód <span className="font-mono tracking-wider">{r.accessCode}</span>
              </>
            ) : (
              "Chybí kód k zámku"
            )}
          </button>
        }
      >
        <button type="button" onClick={() => setCodeOpen(true)} className="text-left hover:text-ink">
          {!r.accessCode ? (
            <span className="font-medium text-pine">Doplnit kód →</span>
          ) : mail ? (
            mail.sent ? `odesláno ${fmtSendAt(mail.at)}` : `pošle se ${fmtSendAt(mail.at)}`
          ) : (
            "upravit"
          )}
        </button>
      </Step>
    ),
    // Úklid před příjezdem (po předchozích hostech / ručně naplánovaný)
    r.cleaningAlert ? (
      <Step key="clean" state="warn" title="Úklid není hotový">
        <CleaningBadge alert={r.cleaningAlert} withLink />
      </Step>
    ) : r.cleaningBefore ? (
      <Step
        key="clean"
        state={r.cleaningBefore.state === "done" ? "done" : r.cleaningBefore.state === "unassigned" ? "warn" : "wait"}
        // Úklid PŘED příjezdem (po předchozích hostech) — úklid po tomhle pobytu je v sekci Úklid zvlášť
        title={
          r.cleaningBefore.state === "done"
            ? "Uklizeno před příjezdem"
            : r.cleaningBefore.state === "unassigned"
              ? "Úklid před příjezdem nikdo nemá"
              : "Úklid před příjezdem čeká"
        }
      >
        {r.cleaningBefore.state === "unassigned" ? (
          <Link href="/admin/kalendar/uklid" className="font-medium text-pine hover:underline">
            Přiřadit úklid →
          </Link>
        ) : (
          [
            r.cleaningBefore.cleaner,
            fmtDate(r.cleaningBefore.date),
            r.cleaningBefore.state === "todo" && r.cleaningBefore.total > 0 && `${r.cleaningBefore.done}/${r.cleaningBefore.total} hotovo`,
          ]
            .filter(Boolean)
            .join(" · ")
        )}
      </Step>
    ) : null,
    checkin ? (
      <Step key="checkin" state={r.checkinDoneAt ? "done" : "wait"} title={r.checkinDoneAt ? "Check-in hotový" : "Check-in čeká"}>
        {r.checkinDoneAt
          ? `${r.checkinCount ?? 0} ${plural(r.checkinCount ?? 0, "osoba", "osoby", "osob")} v knize`
          : `odkaz odešel ${fmtDate(r.checkinMailAt!)}`}
      </Step>
    ) : null,
  ].filter(Boolean);

  return (
    <div
      // Klik na kartu otevře detail rezervace v Rezervacích (kromě tlačítek a oken)
      onClick={(e) => {
        if (!e.currentTarget.contains(e.target as Node)) return;
        if ((e.target as HTMLElement).closest("button, a, input, [role=menu], [role=dialog]")) return;
        router.push(`/admin/rezervace?detail=${r.id}`);
      }}
      className="group cursor-pointer overflow-hidden rounded-[22px] border border-line bg-surface transition hover:border-pine/40"
    >
      <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">
            {c.now ? "Nejbližší pobyt" : "Nejbližší příjezd"} · <span className="text-pine">{c.label.toLowerCase()}</span>
          </p>
          <p className="mt-1.5 truncate font-display text-2xl font-semibold leading-tight sm:text-[28px]">{r.guestName}</p>
          <p className="mt-1 text-sm text-soft">
            {shortRange(r.startDate, r.endDate)}
            {times.checkInTime && times.checkOutTime && ` · ${times.checkInTime} → ${times.checkOutTime}`} · {r.guests}{" "}
            {plural(r.guests, "host", "hosté", "hostů")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="whitespace-nowrap font-display text-xl font-semibold sm:text-2xl">{czk(r.totalPrice)}</p>
          <div className="mt-1">
            <StatusMenu status={r.status} guestName={r.guestName} onChange={onStatus} />
          </div>
        </div>
      </div>
      {codeOpen && (
        <AccessCodeDialog
          code={r.accessCode}
          context={`${r.guestName} · ${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`}
          onClose={() => setCodeOpen(false)}
          onSave={(next) => {
            setCodeOpen(false);
            if (next !== r.accessCode) onAccessCode(next);
          }}
        />
      )}
      {/* Kroky přípravy pobytu */}
      <div className="@container border-t border-line bg-cream">
        <div
          className={`grid divide-y divide-line @[28rem]:divide-x @[28rem]:divide-y-0 ${
            steps.length >= 3 ? "@[28rem]:grid-cols-2 @[46rem]:grid-cols-3" : steps.length === 2 ? "@[28rem]:grid-cols-2" : ""
          }`}
        >
          {steps}
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
