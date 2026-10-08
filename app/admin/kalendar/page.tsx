"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAdminData,
  fmtDate,
  guestsLabel,
  SOURCE_LABEL,
  type Blackout,
  type Reservation,
} from "@/lib/admin";
import { czk, plural } from "@/lib/pricing";
import { addDays, isTime, nightsOf, stayTimes, todayISO } from "@/lib/stay";
import { StatusMenu } from "@/components/StatusMenu";
import { RescheduleDialog } from "@/components/RescheduleDialog";
import { VoucherBadge } from "@/components/VoucherBadge";
import { CalendarPageSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

// Kalendář obsazenosti: měsíční mřížka Po–Ne, pobyty jako pruhy přes dny.
// Pruh začíná v polovině dne příjezdu a končí v polovině dne odjezdu (jako
// v hotelu), takže odjezd a příjezd tentýž den se nepřekrývají.

type Bar =
  | { kind: "stay"; id: string; start: string; end: string; label: string; r: Reservation }
  | { kind: "block"; id: string; start: string; end: string; label: string; b: Blackout };

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

const iso = (s: string) => s.slice(0, 10);

/** Rezervace, která opravdu drží termín (stejné pravidlo jako holdsDates na serveru). */
function holds(r: Reservation): boolean {
  if (r.status === "cancelled") return false;
  return r.status === "paid" || !r.expiresAt || new Date(r.expiresAt) > new Date();
}

function monthTitle(y: number, m: number): string {
  const t = new Date(y, m, 1).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Krátký rozsah dat. Pobyt se píše příjezd–odjezd, blokace první–poslední blokovaný den. */
function shortRange(start: string, endExclusive: string, kind: "stay" | "block" = "block"): string {
  const last = kind === "stay" ? endExclusive : addDays(endExclusive, -1);
  const [, sm, sd] = start.split("-").map(Number);
  const [, lm, ld] = last.split("-").map(Number);
  if (start === last) return `${sd}. ${sm}.`;
  return sm === lm ? `${sd}.–${ld}. ${lm}.` : `${sd}. ${sm}. – ${ld}. ${lm}.`;
}

const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgba(90,101,87,.28) 0 6px, rgba(90,101,87,.12) 6px 12px)",
};

export default function CalendarPage() {
  const { slug, site, reservations, blackouts, setBlackouts, loading, error, setStatus, setTimes, replaceReservation } =
    useAdminData();
  const [rescheduling, setRescheduling] = useState<Reservation | null>(null);
  const today = todayISO();
  const [cursor, setCursor] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const toast = useToast();

  // Blokace se v kalendáři ukáže hned, uloží se na pozadí. Když termín mezitím
  // obsadila rezervace (server vrátí 409), blokace zmizí a ozve se proč.
  async function createBlackout(start: string, end: string, reason: string) {
    const tmp: Blackout = { id: `tmp-${Date.now()}`, startDate: start, endDate: end, reason };
    setBlackouts((list) => [...list, tmp]);
    setPick(null);
    const res = await fetch("/api/blackouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: slug, start, end, reason }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setBlackouts((list) => list.filter((b) => b.id !== tmp.id));
      toast.show(data?.error || "Blokaci se nepodařilo uložit.");
      return;
    }
    const created: Blackout = await res.json();
    setBlackouts((list) => list.map((b) => (b.id === tmp.id ? created : b)));
  }

  async function deleteBlackout(b: Blackout) {
    if (b.id.startsWith("tmp-")) return; // ještě se ukládá
    setBlackouts((list) => list.filter((x) => x.id !== b.id));
    const res = await fetch(`/api/blackouts/${b.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setBlackouts((list) => [...list, b]);
      toast.show("Blokaci se nepodařilo zrušit, zkus to znovu.");
    }
  }
  const [detail, setDetail] = useState<Bar | null>(null);
  // Výběr blokace: první klik = začátek, druhý = poslední den (včetně).
  const [pick, setPick] = useState<{ start: string; last: string | null } | null>(null);

  const bars: Bar[] = useMemo(
    () => [
      ...reservations.filter(holds).map(
        (r): Bar => ({ kind: "stay", id: r.id, start: iso(r.startDate), end: iso(r.endDate), label: r.guestName, r })
      ),
      ...blackouts.map(
        (b): Bar => ({
          kind: "block",
          id: b.id,
          start: iso(b.startDate),
          end: iso(b.endDate),
          label: b.reason || "Blokováno",
          b,
        })
      ),
    ],
    [reservations, blackouts]
  );

  // Týdny mřížky: od pondělí před 1. dnem měsíce po neděli za posledním.
  const { weeks, monthStart, monthEnd } = useMemo(() => {
    const first = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-01`;
    const next = new Date(cursor.y, cursor.m + 1, 1);
    const monthEnd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    const dow = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7;
    const weeks: string[] = [];
    for (let w = addDays(first, -dow); w < monthEnd; w = addDays(w, 7)) weeks.push(w);
    return { weeks, monthStart: first, monthEnd };
  }, [cursor]);

  const summary = useMemo(() => {
    const days = nightsOf(monthStart, monthEnd);
    let nights = 0;
    let arrivals = 0;
    let revenue = 0;
    for (const bar of bars) {
      if (bar.kind !== "stay") continue;
      const s = bar.start > monthStart ? bar.start : monthStart;
      const e = bar.end < monthEnd ? bar.end : monthEnd;
      if (e > s) nights += nightsOf(s, e);
      if (bar.start >= monthStart && bar.start < monthEnd) {
        arrivals += 1;
        if (bar.r.status === "paid") revenue += bar.r.totalPrice;
      }
    }
    return { nights, arrivals, revenue, occupancy: Math.round((nights / days) * 100) };
  }, [bars, monthStart, monthEnd]);

  const monthItems = bars
    .filter((b) => b.start < monthEnd && b.end > monthStart)
    .sort((a, b) => a.start.localeCompare(b.start));

  const isBusy = (day: string) => bars.some((b) => b.start <= day && b.end > day);

  function shift(delta: number) {
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function clickDay(day: string) {
    if (day < today) return;
    // Mimo režim blokace začne výběr klikem na volný den; v režimu klik
    // bez začátku (nebo po dokončeném výběru) začíná nový výběr.
    if (!pick || !pick.start || pick.last) {
      if (!pick && isBusy(day)) return;
      setPick({ start: day, last: null });
      return;
    }
    const [a, b] = day < pick.start ? [day, pick.start] : [pick.start, day];
    setPick({ start: a, last: b });
  }

  const inPick = (day: string) =>
    !!pick && (pick.last ? day >= pick.start && day <= pick.last : day === pick.start);

  if (loading) return <CalendarPageSkeleton />;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    <div className="space-y-5">
      {toast.node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Kalendář</h1>
          <p className="mt-1 text-sm text-soft">
            Obsazenost {summary.occupancy} % · {summary.nights} {plural(summary.nights, "noc", "noci", "nocí")} ·{" "}
            {summary.arrivals} {plural(summary.arrivals, "příjezd", "příjezdy", "příjezdů")}
            {summary.revenue > 0 && ` · ${czk(summary.revenue)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/kalendar/uklid" className="btn-ghost h-10 !px-4 !py-0 text-sm">
            🧹 Úklid
          </Link>
          <button
            type="button"
            onClick={() => setPick(pick ? null : { start: "", last: null })}
            className={pick ? "btn-ghost h-10 !px-4 !py-0 text-sm" : "btn-primary h-10 !px-4 !py-0 text-sm"}
          >
            {pick ? "Zrušit výběr" : "Zablokovat termín"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold sm:text-xl">{monthTitle(cursor.y, cursor.m)}</h2>
          <div className="flex items-center gap-1">
            <NavButton label="Předchozí měsíc" onClick={() => shift(-1)}>
              ←
            </NavButton>
            <button
              type="button"
              onClick={() => setCursor({ y: new Date().getFullYear(), m: new Date().getMonth() })}
              className="h-8 rounded-lg px-3 text-sm font-medium text-soft transition hover:bg-line/40 hover:text-ink"
            >
              Dnes
            </button>
            <NavButton label="Další měsíc" onClick={() => shift(1)}>
              →
            </NavButton>
          </div>
        </div>

        {pick && (
          <p className="mb-3 rounded-xl bg-amber/15 px-3 py-2 text-sm text-[#7a5208]">
            {!pick.start
              ? "Klikni na první den, který chceš zablokovat."
              : !pick.last
                ? "Teď klikni na poslední blokovaný den (nebo znovu na stejný den)."
                : null}
            {pick.start && pick.last && "Vybráno — doplň důvod níže a potvrď."}
          </p>
        )}

        <div className="grid grid-cols-7 border-b border-line pb-1.5">
          {WEEKDAYS.map((d, i) => (
            <span key={d} className={`text-center text-[11px] font-semibold uppercase tracking-wide ${i > 4 ? "text-ink" : "text-soft"}`}>
              {d}
            </span>
          ))}
        </div>

        <div className="divide-y divide-line">
          {weeks.map((ws) => {
            const weekEnd = addDays(ws, 7);
            const segments = bars.filter((b) => b.start < weekEnd && b.end > ws);
            return (
              <div key={ws} className="relative grid grid-cols-7">
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(ws, i);
                  const outside = day < monthStart || day >= monthEnd;
                  const past = day < today;
                  const selectable = !!pick && !past;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => clickDay(day)}
                      disabled={past && !pick}
                      className={`flex h-16 flex-col items-start justify-start border-line p-1 text-left transition sm:h-20 sm:p-1.5 ${i > 0 ? "border-l" : ""} ${
                        inPick(day) ? "bg-amber/25" : selectable ? "hover:bg-amber/10" : past ? "bg-bg/60" : "hover:bg-bg"
                      } ${pick && past ? "cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          day === today
                            ? "bg-ink font-semibold text-white"
                            : outside
                              ? "text-soft/40"
                              : past
                                ? "text-soft/70"
                                : "font-medium text-ink"
                        }`}
                      >
                        {Number(day.slice(8))}
                      </span>
                    </button>
                  );
                })}

                {segments.map((bar) => {
                  const segStart = bar.start > ws ? bar.start : ws;
                  const segEnd = bar.end < weekEnd ? bar.end : weekEnd;
                  const startsHere = segStart === bar.start;
                  const endsHere = segEnd === bar.end;
                  const left = (nightsOf(ws, segStart) + (startsHere ? 0.5 : 0)) / 7;
                  // Odjezd v pondělí dalšího týdne: půlden navíc by vyjel z mřížky,
                  // pruh proto končí na konci neděle.
                  const right = Math.min(1, (nightsOf(ws, segEnd) + (endsHere ? 0.5 : 0)) / 7);
                  const pending = bar.kind === "stay" && bar.r.status === "pending";
                  const color =
                    bar.kind === "block" ? "text-ink" : pending ? "bg-amber text-ink" : "bg-pine text-white";
                  return (
                    <button
                      key={`${bar.id}-${ws}`}
                      type="button"
                      onClick={() => setDetail(bar)}
                      title={`${bar.label} · ${shortRange(bar.start, bar.end, bar.kind)}`}
                      style={{
                        left: `calc(${left * 100}% + 1px)`,
                        width: `calc(${(right - left) * 100}% - 2px)`,
                        ...(bar.kind === "block" ? HATCH : {}),
                      }}
                      className={`absolute top-8 flex h-6 items-center overflow-hidden px-1.5 text-left text-[11px] font-semibold shadow-sm transition hover:brightness-95 sm:top-10 sm:h-7 sm:px-2 sm:text-xs ${color} ${
                        startsHere ? "rounded-l-full" : ""
                      } ${endsHere ? "rounded-r-full" : ""}`}
                    >
                      {/* Jméno jen na začátku úseku a jen když je pruh dost široký */}
                      {(startsHere || segStart === ws) && right - left > 0.2 && (
                        <span className="truncate">{bar.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
          <Legend className="bg-pine">Zaplaceno</Legend>
          <Legend className="bg-amber">Čeká na platbu</Legend>
          <Legend style={HATCH}>Blokováno</Legend>
        </div>
      </div>

      {pick?.start && pick.last && (
        <BlockPanel
          slug={slug!}
          start={pick.start}
          last={pick.last}
          onCancel={() => setPick(null)}
          onSubmit={(reason) => createBlackout(pick.start, addDays(pick.last!, 1), reason)}
        />
      )}

      {/* Seznam měsíce — na mobilu hlavní čitelný přehled */}
      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Tento měsíc</h2>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {monthItems.length === 0 && (
            <p className="p-5 text-center text-sm text-soft">V tomhle měsíci nic není.</p>
          )}
          {monthItems.map((bar) => (
            <button
              key={bar.id}
              type="button"
              onClick={() => setDetail(bar)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-bg/60"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className={`h-8 w-1.5 shrink-0 rounded-full ${
                    bar.kind === "block" ? "" : bar.r.status === "pending" ? "bg-amber" : "bg-pine"
                  }`}
                  style={bar.kind === "block" ? HATCH : undefined}
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">{bar.label}</p>
                  <p className="text-xs text-soft">
                    {shortRange(bar.start, bar.end, bar.kind)}
                    {bar.kind === "stay"
                      ? ` · ${nightsOf(bar.start, bar.end)} ${plural(nightsOf(bar.start, bar.end), "noc", "noci", "nocí")}`
                      : " · blokace"}
                  </p>
                </div>
              </div>
              {bar.kind === "stay" && (
                <span className="shrink-0 text-sm font-semibold">{czk(bar.r.totalPrice)}</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {rescheduling && (
        <RescheduleDialog
          reservation={rescheduling}
          onClose={() => setRescheduling(null)}
          onSaved={(updated) => {
            replaceReservation(updated);
            setRescheduling(null);
          }}
        />
      )}

      {detail && (
        <DetailSheet onClose={() => setDetail(null)}>
          {detail.kind === "stay" ? (
            <StayDetail
              r={reservations.find((x) => x.id === detail.id) ?? detail.r}
              guests={guestsLabel(detail.r, site)}
              onStatus={(s) => setStatus(detail.id, s)}
              times={site ? stayTimes(reservations.find((x) => x.id === detail.id) ?? detail.r, site) : null}
              onTimes={(patch) => setTimes(detail.id, patch)}
              onReschedule={(r) => {
                setDetail(null);
                setRescheduling(r);
              }}
            />
          ) : (
            <BlockDetail
              b={detail.b}
              onDelete={() => {
                if (!confirm("Zrušit tuhle blokaci? Termín bude znovu k rezervaci.")) return;
                setDetail(null);
                deleteBlackout(detail.b);
              }}
            />
          )}
        </DetailSheet>
      )}
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-sm transition hover:border-ink/30"
    >
      {children}
    </button>
  );
}

function Legend({
  className = "",
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-5 rounded-full ${className}`} style={style} />
      {children}
    </span>
  );
}

function BlockPanel({
  start,
  last,
  onCancel,
  onSubmit,
}: {
  slug: string;
  start: string;
  last: string;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const end = addDays(last, 1);
  const days = nightsOf(start, end);

  function submit() {
    onSubmit(reason.trim());
  }

  return (
    <div className="rounded-2xl border border-amber/60 bg-amber/10 p-4">
      <p className="font-semibold">
        Zablokovat {shortRange(start, end)}{" "}
        <span className="font-normal text-soft">
          ({days} {plural(days, "den", "dny", "dní")})
        </span>
      </p>
      <p className="mt-0.5 text-sm text-soft">Hosté si tyhle dny nebudou moct zarezervovat.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="control min-w-48 flex-1"
          placeholder="Důvod (nepovinné), např. Servis sauny"
          aria-label="Důvod blokace"
          value={reason}
          maxLength={80}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button type="button" className="btn-primary h-10 !px-5 !py-0 text-sm" onClick={submit}>
          Zablokovat
        </button>
        <button type="button" className="btn-ghost h-10 !px-4 !py-0 text-sm" onClick={onCancel}>
          Zrušit
        </button>
      </div>
    </div>
  );
}

function DetailSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        className="relative w-full max-w-md rounded-t-3xl bg-surface p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Zavřít"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-soft hover:bg-line/40 hover:text-ink"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

function StayDetail({
  r,
  guests,
  onStatus,
  times,
  onTimes,
  onReschedule,
}: {
  r: Reservation;
  guests: string;
  onStatus: (s: Reservation["status"]) => Promise<void>;
  times: { checkInTime: string; checkOutTime: string } | null;
  onTimes: (patch: Partial<Pick<Reservation, "checkInTime" | "checkOutTime">>) => Promise<void>;
  onReschedule: (r: Reservation) => void;
}) {
  const nights = nightsOf(iso(r.startDate), iso(r.endDate));
  return (
    <div className="space-y-4">
      <div className="pr-10">
        <p className="font-display text-xl font-semibold">{r.guestName}</p>
        <p className="mt-0.5 text-sm text-soft">
          {fmtDate(r.startDate)} – {fmtDate(r.endDate)} · {nights} {plural(nights, "noc", "noci", "nocí")}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-soft">Hosté</dt>
        <dd>{guests}</dd>
        {times && (
          <>
            <dt className="pt-2 text-soft">Časy pobytu</dt>
            <dd>
              {/* key: při přepnutí na jinou rezervaci začnou pole znovu s jejími časy */}
              <StayTimes key={r.id} times={times} onSave={onTimes} />
            </dd>
          </>
        )}
        <dt className="text-soft">Zdroj</dt>
        <dd>{SOURCE_LABEL[r.source] ?? r.source}</dd>
        <dt className="text-soft">Cena</dt>
        <dd className="flex flex-wrap items-center gap-2 font-semibold">
          {czk(r.totalPrice)}
          <VoucherBadge code={r.voucherCode} discount={r.discount} />
        </dd>
        <dt className="text-soft">Stav</dt>
        <dd>
          <StatusMenu status={r.status} guestName={r.guestName} onChange={onStatus} />
        </dd>
        <dt className="text-soft">Kontakt</dt>
        <dd className="min-w-0 space-y-0.5">
          {r.email ? (
            <a href={`mailto:${r.email}`} className="block truncate text-pine hover:underline">
              {r.email}
            </a>
          ) : (
            <span className="text-soft">
              {r.anonymized ? "Údaje hosta smazány" : r.guestRef ? "Anonymizovaný na žádost (GDPR)" : "—"}
            </span>
          )}
          {r.phone && (
            <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="block text-pine hover:underline">
              {r.phone}
            </a>
          )}
        </dd>
        <dt className="text-soft">Kód</dt>
        <dd className="font-mono text-xs leading-5">{r.publicId}</dd>
      </dl>
      {r.note && <p className="rounded-xl bg-bg px-3 py-2 text-sm">{r.note}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <button type="button" className="btn-ghost !px-4 !py-2 text-sm" onClick={() => onReschedule(r)}>
          Změnit termín
        </button>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin/kalendar/uklid" className="text-sm font-medium text-pine hover:underline">
            🧹 Úklid po odjezdu
          </Link>
          <Link href={`/r/${r.publicId}`} target="_blank" className="text-sm font-medium text-pine hover:underline">
            Stránka pro hosta ↗
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Check-in / check-out jedné rezervace — změna se uloží hned po výběru času. */
function StayTimes({
  times,
  onSave,
}: {
  times: { checkInTime: string; checkOutTime: string };
  onSave: (patch: Partial<Pick<Reservation, "checkInTime" | "checkOutTime">>) => Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  async function save(key: "checkInTime" | "checkOutTime", value: string) {
    if (timer.current) window.clearTimeout(timer.current);
    if (!isTime(value) || value === times[key]) return;
    setState("saving");
    try {
      await onSave({ [key]: value });
      setState("saved");
    } catch {
      setState("error");
    }
  }

  const field = (key: "checkInTime" | "checkOutTime", label: string) => (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-soft">{label}</span>
      <input
        type="time"
        required
        className="control w-[6.75rem]"
        defaultValue={times[key]}
        aria-label={key === "checkInTime" ? "Check-in (příjezd od)" : "Check-out (odjezd do)"}
        // Uloží se chvíli po změně, nebo hned po opuštění pole.
        onChange={(e) => {
          const value = e.target.value;
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => save(key, value), 700);
        }}
        onBlur={(e) => save(key, e.target.value)}
      />
    </label>
  );

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {field("checkInTime", "check-in od")}
        {field("checkOutTime", "check-out do")}
      </div>
      <p className={`text-xs ${state === "error" ? "text-coral" : state === "saved" ? "text-pine" : "text-soft"}`} aria-live="polite">
        {state === "saving"
          ? "Ukládám…"
          : state === "saved"
            ? "✓ Časy pobytu uloženy"
            : state === "error"
              ? "Čas se nepodařilo uložit, zkus to znovu."
              : "Jen pro tuhle rezervaci — výchozí časy jsou v Nastavení → Ceník a pobyt."}
      </p>
    </div>
  );
}

function BlockDetail({ b, onDelete }: { b: Blackout; onDelete: () => void }) {
  const start = iso(b.startDate);
  const end = iso(b.endDate);
  const days = nightsOf(start, end);
  return (
    <div className="space-y-4">
      <div className="pr-10">
        <p className="font-display text-xl font-semibold">{b.reason || "Blokovaný termín"}</p>
        <p className="mt-0.5 text-sm text-soft">
          {shortRange(start, end)} · {days} {plural(days, "den", "dny", "dní")}
        </p>
      </div>
      <p className="text-sm text-soft">V těchhle dnech si hosté nemůžou udělat rezervaci.</p>
      <button type="button" className="btn-ghost !px-4 !py-2 text-sm !text-coral" onClick={onDelete}>
        Zrušit blokaci
      </button>
    </div>
  );
}
