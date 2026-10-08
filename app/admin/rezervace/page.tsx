"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  useAdminData,
  fmtDate,
  guestsLabel,
  norm,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  type Reservation,
  type Site,
} from "@/lib/admin";
import { czk, nightsBetween, plural } from "@/lib/pricing";
import { stayTimes, todayISO } from "@/lib/stay";
import { Dropdown } from "@/components/Dropdown";
import { RescheduleDialog } from "@/components/RescheduleDialog";
import { VoucherBadge } from "@/components/VoucherBadge";
import { ListPageSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { accessCodeSendAt, fmtSendAt } from "@/lib/access-code";

type Filter = "all" | Reservation["status"];
/** all | upcoming | past | měsíc příjezdu ve tvaru YYYY-MM */
type Period = string;
type Sort = "arrival-desc" | "arrival-asc" | "created-desc" | "price-desc";

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

export default function ReservationsPage() {
  const { site, reservations, loading, error, setStatus: saveStatus, replaceReservation, setAccessCode } = useAdminData();
  const toast = useToast();
  function saveAccessCode(r: Reservation, code: string) {
    const sendAt = code ? accessCodeSendAt({ ...r, accessCode: code, accessCodeSetAt: new Date().toISOString() }) : null;
    toast.show(
      !code
        ? "Kód k zámku je smazaný."
        : sendAt && sendAt > new Date()
          ? `Kód je uložený — hostovi ho pošleme e-mailem ${fmtSendAt(sendAt)}.`
          : "Kód je uložený — hostovi ho posíláme e-mailem hned.",
      "success"
    );
    setAccessCode(r.id, code).catch((e: Error) => toast.show(e.message));
  }
  const [rescheduling, setRescheduling] = useState<Reservation | null>(null);
  // Rozkliknuté rezervace — časy příjezdu a odjezdu a skladba hostů
  const [details, setDetails] = useState<Set<string>>(new Set());
  const toggleDetail = (id: string) =>
    setDetails((d) => {
      const next = new Set(d);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  if (loading) return <ListPageSkeleton label="Načítám rezervace" rows={6} />;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    <div className="space-y-5">
      {toast.node}
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
          <div
            key={r.id}
            // Klik kamkoli do karty rozbalí detail — kromě tlačítek a odkazů uvnitř
            // a kromě označení textu (např. kopírování e-mailu)
            onClick={(e) => {
              // Okna (kód k zámku…) jsou v portálu mimo kartu — jejich kliky sem jen probublají
              if (!e.currentTarget.contains(e.target as Node)) return;
              if ((e.target as HTMLElement).closest("button, a, input, select, [role=menu], [role=dialog]")) return;
              if (window.getSelection()?.toString()) return;
              toggleDetail(r.id);
            }}
            className="cursor-pointer rounded-2xl border border-line bg-surface p-5 transition hover:border-pine/30"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
                  {r.guestName}
                  {r.source !== "web" && (
                    <span className="rounded-full border border-line px-2 py-0.5 font-sans text-[11px] font-semibold text-soft">
                      {SOURCE_LABEL[r.source] ?? r.source}
                    </span>
                  )}
                  <VoucherBadge code={r.voucherCode} discount={r.discount} />
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-soft">
                  <span>
                    {fmtDate(r.startDate)} – {fmtDate(r.endDate)} · {nightsOf(r)} {plural(nightsOf(r), "noc", "noci", "nocí")} ·{" "}
                    {r.guests} {plural(r.guests, "host", "hosté", "hostů")}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleDetail(r.id)}
                    aria-expanded={details.has(r.id)}
                    className="font-medium text-pine hover:underline"
                  >
                    {details.has(r.id) ? "Skrýt detail ▴" : "Detail ▾"}
                  </button>
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-semibold">{czk(r.totalPrice)}</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
            </div>
            {details.has(r.id) && <StayDetail r={r} site={site} />}
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
              {r.status !== "cancelled" && (
                <button className="btn-ghost !px-4 !py-1.5 text-xs" onClick={() => setRescheduling(r)}>
                  Změnit termín
                </button>
              )}
              {/* Kód k zámku jen u pobytů, které ještě neskončily — u proběhlých je jen v detailu */}
              {r.status !== "cancelled" && r.endDate.slice(0, 10) >= todayISO() && (
                <AccessCode
                  key={r.accessCode}
                  code={r.accessCode}
                  sendAt={accessCodeSendAt(r)}
                  context={`${r.guestName} · ${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`}
                  onSave={(code) => saveAccessCode(r, code)}
                />
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
    </div>
  );
}

const nightsOf = (r: Reservation) => nightsBetween(new Date(r.startDate), new Date(r.endDate));

/** Rozkliknutý detail se všemi údaji rezervace: pobyt, host, cena, rezervace. */
function StayDetail({ r, site }: { r: Reservation; site: Site | null }) {
  const times = site ? stayTimes(r, site) : r;
  const nights = nightsOf(r);
  const dateTime = (iso: string) =>
    new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const hidden = r.anonymized || r.guestRef;

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-soft">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">{title}</p>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  );
  const link = "text-pine hover:underline";

  return (
    <div className="mt-3 grid gap-4 rounded-xl bg-bg/60 px-4 py-3 text-sm sm:grid-cols-2 sm:gap-x-8">
      <Group title="Pobyt">
        <Row label="Příjezd">
          {fmtDate(r.startDate)}
          {times.checkInTime && ` od ${times.checkInTime}`}
        </Row>
        <Row label="Odjezd">
          {fmtDate(r.endDate)}
          {times.checkOutTime && ` do ${times.checkOutTime}`}
        </Row>
        <Row label="Délka">
          {nights} {plural(nights, "noc", "noci", "nocí")}
        </Row>
        <Row label="Hosté">{guestsLabel(r, site)}</Row>
      </Group>

      <Group title="Host">
        {hidden ? (
          <Row label="Kontakt">
            <span className="font-normal text-soft">
              {r.anonymized ? "Údaje hosta smazány" : "Anonymizovaný na žádost (GDPR)"}
            </span>
          </Row>
        ) : (
          <>
            {r.email && (
              <Row label="E-mail">
                <a href={`mailto:${r.email}`} className={`${link} block truncate`}>
                  {r.email}
                </a>
              </Row>
            )}
            {r.phone && (
              <Row label="Telefon">
                <a href={`tel:${r.phone.replace(/\s/g, "")}`} className={link}>
                  {r.phone}
                </a>
              </Row>
            )}
          </>
        )}
        {r.note && (
          <div className="pt-0.5">
            <dt className="text-soft">Poznámka od hosta</dt>
            <dd className="mt-0.5 whitespace-pre-line rounded-lg bg-surface px-3 py-2 font-normal">{r.note}</dd>
          </div>
        )}
      </Group>

      <Group title="Cena">
        <Row label={`Ubytování (${nights} ${plural(nights, "noc", "noci", "nocí")})`}>{czk(r.nightsTotal)}</Row>
        {r.feesTotal > 0 && <Row label="Poplatky (úklid, pobyt)">{czk(r.feesTotal)}</Row>}
        {r.discount > 0 && (
          <Row label={`Sleva (voucher ${r.voucherCode})`}>
            <span className="text-pine">−{czk(r.discount)}</span>
          </Row>
        )}
        <Row label="Celkem">{czk(r.totalPrice)}</Row>
        {r.vatRate > 0 && (
          <Row label={`z toho DPH ${r.vatRate} %`}>
            <span className="font-normal">{czk(r.vatAmount)}</span>
          </Row>
        )}
      </Group>

      <Group title="Rezervace">
        <Row label="Kód">
          <a href={`/r/${r.publicId}`} target="_blank" className={link}>
            {r.publicId} ↗
          </a>
        </Row>
        <Row label="Zdroj">{SOURCE_LABEL[r.source] ?? r.source}</Row>
        <Row label="Vytvořeno">{dateTime(r.createdAt)}</Row>
        {r.status === "pending" && r.expiresAt && <Row label="Držíme do">{dateTime(r.expiresAt)}</Row>}
        {r.termsAcceptedAt && <Row label="Souhlas s podmínkami">{dateTime(r.termsAcceptedAt)}</Row>}
        {r.accessCode && (
          <Row label="Kód k zámku">
            <span className="font-mono tracking-wider">{r.accessCode}</span>
          </Row>
        )}
      </Group>
    </div>
  );
}

/** Kreslený klíč (stejný styl čar jako ikony v navigaci). */
function KeyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 19 4M15.5 7.5l2.5 2.5M18 5l2 2" />
    </svg>
  );
}

/**
 * Kód k zámku / schránce s klíči pro pobyt. Bez kódu tlačítko „Doplnit“, s kódem
 * štítek s kódem. Klik otevře okno s polem pro kód; ukládá se hned (Enter / Uložit).
 */
function AccessCode({
  code,
  sendAt,
  context,
  onSave,
}: {
  code: string;
  /** Kdy se kód pošle hostovi (null = bez kódu). */
  sendAt: Date | null;
  context: string;
  onSave: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const sent = !!sendAt && sendAt <= new Date();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={code ? "Upravit kód k zámku" : undefined}
        className="btn-ghost inline-flex items-center gap-1.5 !px-4 !py-1.5 text-xs"
      >
        <KeyIcon className="h-3.5 w-3.5" />
        {code ? (
          <>
            Kód k zámku: <span className="font-mono font-semibold tracking-wider text-ink">{code}</span>
          </>
        ) : (
          "Doplnit kód k zámku"
        )}
      </button>
      {/* Stav e-mailu s kódem — podle času odeslání (rozesílání se teprve chystá) */}
      {sendAt && (
        <span
          className={`inline-flex items-center gap-1.5 self-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            sent ? "bg-pine/10 text-pine" : "bg-amber/15 text-[#92600a]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${sent ? "bg-pine" : "bg-amber"}`} aria-hidden />
          {sent ? `Odesláno hostovi ${fmtSendAt(sendAt)}` : `Čeká na odeslání · pošle se ${fmtSendAt(sendAt)}`}
        </span>
      )}
      {open && (
        <AccessCodeDialog
          code={code}
          context={context}
          onClose={() => setOpen(false)}
          onSave={(next) => {
            setOpen(false);
            if (next !== code) onSave(next);
          }}
        />
      )}
    </>
  );
}

function AccessCodeDialog({
  code,
  context,
  onClose,
  onSave,
}: {
  code: string;
  context: string;
  onClose: () => void;
  onSave: (code: string) => void;
}) {
  const [draft, setDraft] = useState(code);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Do <body>: předek s CSS transformací by jinak rozbil `fixed` překryv.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kód k zámku"
        className="rise w-full max-w-sm rounded-t-3xl bg-surface p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pine/10 text-pine">
            <KeyIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">Kód k zámku</h2>
            <p className="truncate text-xs text-soft">{context}</p>
          </div>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Kód k zámku</span>
          <input
            autoFocus
            className="field text-center font-mono text-xl tracking-[0.2em]"
            placeholder="např. 4821#"
            maxLength={40}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSave(draft.trim())}
          />
        </label>
        <p className="mt-2 text-xs text-soft">
          Kód k zámku nebo schránce s klíči pro tenhle pobyt. Hostovi ho pošleme e-mailem den před příjezdem
          v 10:00 (uložený později hned).
        </p>
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-ghost flex-1 !py-2.5" onClick={onClose}>
            Zrušit
          </button>
          <button type="button" className="btn-primary flex-1 !py-2.5" onClick={() => onSave(draft.trim())}>
            Uložit
          </button>
        </div>
        {code && (
          <button
            type="button"
            className="mt-3 w-full text-center text-sm font-medium text-coral hover:underline"
            onClick={() => onSave("")}
          >
            Smazat kód
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
