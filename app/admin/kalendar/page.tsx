"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import Link from "next/link";
import {
  useAdminData,
  fmtDate,
  guestsLabel,
  SOURCE_LABEL,
  type Blackout,
  type Reservation,
  statusToastText,
} from "@/lib/admin";
import { czk, plural } from "@/lib/pricing";
import { addDays, isTime, nightsOf, stayTimes, todayISO } from "@/lib/stay";
import { StatusMenu } from "@/components/StatusMenu";
import { RescheduleDialog } from "@/components/RescheduleDialog";
import { VoucherBadge } from "@/components/VoucherBadge";
import { CalendarPageSkeleton } from "@/components/Skeleton";
import { HATCH, Legend, StayCalendar, currentMonth, monthBounds, shortRange } from "@/components/StayCalendar";
import { useToast } from "@/components/Toast";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

// Kalendář obsazenosti: měsíční mřížka Po–Ne, pobyty jako pruhy přes dny.
// Pruh začíná v polovině dne příjezdu a končí v polovině dne odjezdu (jako
// v hotelu), takže odjezd a příjezd tentýž den se nepřekrývají.

type Bar =
  | { kind: "stay"; id: string; start: string; end: string; label: string; r: Reservation }
  | { kind: "block"; id: string; start: string; end: string; label: string; b: Blackout };

const iso = (s: string) => s.slice(0, 10);

/** Rezervace, která opravdu drží termín (stejné pravidlo jako holdsDates na serveru). */
function holds(r: Reservation): boolean {
  if (r.status === "cancelled") return false;
  return r.status === "paid" || !r.expiresAt || new Date(r.expiresAt) > new Date();
}

export default function CalendarPage() {
  const { slug, site, reservations, blackouts, setBlackouts, loading, error, setStatus, setTimes, replaceReservation, reload } =
    useAdminData();
  const router = useRouter();
  const [rescheduling, setRescheduling] = useState<Reservation | null>(null);
  const today = todayISO();
  const [cursor, setCursor] = useState(currentMonth);
  const toast = useToast();
  const confirmDlg = useConfirm();
  // Notifikace hned po kliknutí, uložení na pozadí; při chybě se stav vrátí a ozve se proč
  const changeStatus = async (id: string, status: Reservation["status"]) => {
    const r = reservations.find((x) => x.id === id);
    if (r && r.status !== status) toast.show(statusToastText(r, status, site), "success");
    await setStatus(id, status).catch((e: Error) => toast.show(e.message));
  };

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

  const { monthStart, monthEnd } = useMemo(() => monthBounds(cursor), [cursor]);

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
      {confirmDlg.node}
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
            <Icon name="broom" className="mr-1.5" />Úklid
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

      <StayCalendar
        cursor={cursor}
        onCursor={setCursor}
        bars={bars.map((b) => ({
          id: b.id,
          start: b.start,
          end: b.end,
          label: b.label,
          variant: b.kind === "block" ? "block" : b.r.status === "pending" ? "pending" : "stay",
        }))}
        onBarClick={(id) => setDetail(bars.find((b) => b.id === id) ?? null)}
        onDayClick={clickDay}
        dayDisabled={(day) => day < today && !pick}
        dayClass={(day) =>
          inPick(day) ? "bg-amber/25" : pick && day >= today ? "hover:bg-amber/10" : pick ? "bg-bg/60 cursor-not-allowed" : ""
        }
        notice={
          pick && (
            <p className="mb-3 rounded-xl bg-amber/15 px-3 py-2 text-sm text-[#7a5208]">
              {!pick.start
                ? "Klikni na první den, který chceš zablokovat."
                : !pick.last
                  ? "Teď klikni na poslední blokovaný den (nebo znovu na stejný den)."
                  : null}
              {pick.start && pick.last && "Vybráno — doplň důvod níže a potvrď."}
            </p>
          )
        }
        legend={
          <>
            <Legend className="bg-pine">Zaplaceno</Legend>
            <Legend className="bg-amber">Čeká na platbu</Legend>
            <Legend style={HATCH}>Blokováno</Legend>
          </>
        }
      />

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
              onStatus={(s) => changeStatus(detail.id, s)}
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
              onConvert={async () => {
                const b = detail.b;
                setDetail(null);
                setBlackouts((list) => list.filter((x) => x.id !== b.id));
                const res = await fetch(`/api/blackouts/${b.id}/convert`, { method: "POST" }).catch(() => null);
                if (!res?.ok) {
                  setBlackouts((list) => [...list, b]);
                  toast.show("Převod se nepovedl, zkus to znovu.");
                  return;
                }
                const created = await res.json();
                toast.show("Hotovo — v Rezervacích jí doplň jméno a cenu.", "success");
                reload();
                router.push(`/admin/rezervace?detail=${created.id}`);
              }}
              onDelete={async () => {
                const b = detail.b;
                const ok = await confirmDlg.ask({
                  title: "Zrušit blokaci?",
                  message: "Termín bude znovu k rezervaci.",
                  confirmLabel: "Zrušit blokaci",
                  cancelLabel: "Ponechat",
                });
                if (!ok) return;
                setDetail(null);
                deleteBlackout(b);
              }}
            />
          )}
        </DetailSheet>
      )}
    </div>
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
            <Icon name="broom" className="mr-1.5" />Úklid po odjezdu
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

function BlockDetail({ b, onDelete, onConvert }: { b: Blackout; onDelete: () => void; onConvert: () => void }) {
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
      {b.feedId ? (
        <>
          <p className="rounded-xl bg-bg px-4 py-3 text-sm text-soft">
            Staženo z kalendáře portálu (Nastavení → Externí rezervace). Termín řídí portál — když ho tam zrušíš, zmizí
            i tady. Je to rezervace hosta? Převeď ji a doplň jméno a cenu.
          </p>
          <button type="button" className="btn-primary !px-4 !py-2 text-sm" onClick={onConvert}>
            Je to rezervace →
          </button>
        </>
      ) : (
        <button type="button" className="btn-ghost !px-4 !py-2 text-sm !text-coral" onClick={onDelete}>
          Zrušit blokaci
        </button>
      )}
    </div>
  );
}
