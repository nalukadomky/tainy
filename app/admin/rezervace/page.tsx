"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { addDays, stayTimes, todayISO } from "@/lib/stay";
import { Dropdown } from "@/components/Dropdown";
import { RescheduleDialog } from "@/components/RescheduleDialog";
import { VoucherBadge } from "@/components/VoucherBadge";
import { ListPageSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { StatusMenu, cancelReservationConfirm } from "@/components/StatusMenu";
import { accessCodeSendAt, fmtSendAt } from "@/lib/access-code";
import { arrivalDaysOf } from "@/lib/email-templates";
import { AccessCode, AccessCodeDialog, accessCodeSavedMessage } from "@/components/AccessCode";
import { SwipeToPay } from "@/components/SwipeToPay";
import { ListMore, usePaged } from "@/components/ListMore";
import { SortHeader } from "@/components/SortHeader";

type Filter = "all" | "active" | Reservation["status"];
/** all | upcoming | past | měsíc příjezdu ve tvaru YYYY-MM */
type Period = string;
type Sort = "nearest" | "arrival-desc" | "arrival-asc" | "created-desc" | "price-desc" | "price-asc" | "name-asc" | "name-desc";

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

export default function ReservationsPage() {
  const {
    site,
    reservations,
    loading,
    error,
    setStatus: saveStatus,
    replaceReservation,
    setAccessCode,
  } = useAdminData();
  const toast = useToast();
  const confirmDlg = useConfirm();
  async function cancelStay(r: Reservation) {
    if (await confirmDlg.ask(cancelReservationConfirm(r.guestName))) setStatus(r.id, "cancelled");
  }
  function saveAccessCode(r: Reservation, code: string) {
    toast.show(accessCodeSavedMessage(r, code, arrivalDaysOf(site)), "success");
    setAccessCode(r.id, code).catch((e: Error) => toast.show(e.message));
  }
  const [rescheduling, setRescheduling] = useState<Reservation | null>(null);
  // Rezervace z portálu: doplnění jména, kontaktu a ceny
  const [editing, setEditing] = useState<Reservation | null>(null);
  async function saveDetails(r: Reservation, patch: GuestDetails) {
    setEditing(null);
    replaceReservation({ ...r, ...patch, firstName: patch.guestName.split(" ")[0] });
    const res = await fetch(`/api/reservations/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      replaceReservation(r);
      toast.show(data?.error ?? "Údaje se nepodařilo uložit.");
      return;
    }
    toast.show("Údaje jsou uložené.", "success");
  }
  // Mobil: detail rezervace v okně zespodu a kód k zámku z nabídky „⋯“
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [codeFor, setCodeFor] = useState<Reservation | null>(null);
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
  // Odkaz z Přehledu (?detail=ID) otevře detail konkrétní rezervace — jednou, až jsou data
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (openedFromLink.current || !reservations.length) return;
    const id = new URLSearchParams(window.location.search).get("detail");
    if (!id || !reservations.some((r) => r.id === id)) return;
    openedFromLink.current = true;
    setFilter("all");
    if (window.matchMedia("(min-width: 640px)").matches) {
      setDetails(new Set([id]));
      requestAnimationFrame(() =>
        document.getElementById(`rez-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
    } else setSheetId(id);
  }, [reservations]);
  // Odkaz z Přehledu (?stav=pending) otevře rovnou čekající rezervace
  useEffect(() => {
    const stav = new URLSearchParams(window.location.search).get("stav");
    if (stav === "pending" || stav === "paid" || stav === "cancelled") setFilter(stav);
  }, []);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState<Sort>("nearest");
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
    [reservations],
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
    const list = matching.filter((r) => matchesFilter(r, filter));
    // „Od nejbližší“: probíhající a nadcházející od nejbližšího příjezdu, pak proběhlé od posledního
    const today = todayISO();
    const ahead = (r: Reservation) => r.endDate.slice(0, 10) >= today;
    const by: Record<Sort, (a: Reservation, b: Reservation) => number> = {
      nearest: (a, b) =>
        ahead(a) !== ahead(b)
          ? ahead(a)
            ? -1
            : 1
          : ahead(a)
            ? a.startDate.localeCompare(b.startDate)
            : b.startDate.localeCompare(a.startDate),
      "arrival-desc": (a, b) => b.startDate.localeCompare(a.startDate),
      "arrival-asc": (a, b) => a.startDate.localeCompare(b.startDate),
      "created-desc": (a, b) => b.createdAt.localeCompare(a.createdAt),
      "price-desc": (a, b) => b.totalPrice - a.totalPrice,
      "price-asc": (a, b) => a.totalPrice - b.totalPrice,
      "name-asc": (a, b) => a.guestName.localeCompare(b.guestName, "cs"),
      "name-desc": (a, b) => b.guestName.localeCompare(a.guestName, "cs"),
    };
    return list.sort(by[sort]);
  }, [matching, filter, sort]);

  const count = (f: Filter) => matching.filter((r) => matchesFilter(r, f)).length;

  // Postupné načítání a skupiny po měsících příjezdu (při řazení podle data)
  const paged = usePaged(`${filter}|${sort}|${query}|${period}|${source}`);
  const visible = shown.slice(0, paged.limit);
  const byDate = sort === "nearest" || sort === "arrival-asc" || sort === "arrival-desc";
  // „Od nejbližší“ má dvě části — nadcházející a proběhlé; stejný měsíc může být v obou
  const groupKey = useCallback(
    (r: Reservation) =>
      sort === "nearest" ? `${r.endDate.slice(0, 10) >= todayISO() ? "a" : "p"}:${r.startDate.slice(0, 7)}` : r.startDate.slice(0, 7),
    [sort]
  );
  const groups = useMemo(() => {
    if (!byDate) return [{ key: "all", items: visible }];
    const out: { key: string; items: Reservation[] }[] = [];
    for (const r of visible) {
      const key = groupKey(r);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(r);
      else out.push({ key, items: [r] });
    }
    return out;
  }, [visible, byDate, groupKey]);
  // Součty měsíce ze všech rezervací v měsíci (i těch ještě nezobrazených), bez zrušených
  const monthTotals = useMemo(() => {
    const m = new Map<string, { stays: number; sum: number }>();
    for (const r of shown) {
      if (r.status === "cancelled") continue;
      const t = m.get(groupKey(r)) ?? { stays: 0, sum: 0 };
      t.stays += 1;
      t.sum += r.totalPrice;
      m.set(groupKey(r), t);
    }
    return m;
  }, [shown, groupKey]);
  // Odkaz ?detail=ID: rezervace musí být mezi zobrazenými
  const detailShown = useRef(false);
  useEffect(() => {
    if (detailShown.current) return;
    const id = new URLSearchParams(window.location.search).get("detail");
    const i = id ? shown.findIndex((r) => r.id === id) : -1;
    if (i < 0) return;
    detailShown.current = true;
    paged.showAt(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  // Řazení kliknutím na sloupec tabulky (počítač); druhý klik obrátí směr
  const sortBy = (col: "arrival" | "name" | "price") => {
    const pairs = { arrival: ["arrival-asc", "arrival-desc"], name: ["name-asc", "name-desc"], price: ["price-desc", "price-asc"] } as const;
    const [first, second] = pairs[col];
    setSort(sort === first ? second : first);
  };
  const sortCol = sort.startsWith("arrival") || sort === "nearest" ? "arrival" : sort.startsWith("name") ? "name" : sort.startsWith("price") ? "price" : null;
  const sortDir: "asc" | "desc" = sort.endsWith("desc") ? "desc" : "asc";

  // Jedna akce na řádku podle situace (zbytek je v nabídce ⋯)
  function primaryAction(r: Reservation): { label: string; run: () => void; primary?: boolean } | null {
    if (editable(r) && r.guestName.startsWith("Host z ")) return { label: "✎ Doplnit údaje", run: () => setEditing(r) };
    // Kód k zámku až když se příjezd blíží (do 14 dnů) — dřív by to byl jen šum
    const start = r.startDate.slice(0, 10);
    if (r.status !== "cancelled" && start >= todayISO() && start <= addDays(todayISO(), 14) && !r.accessCode)
      return { label: "Doplnit kód", run: () => setCodeFor(r) };
    return null;
  }
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
      {confirmDlg.node}
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
            { value: "nearest", label: "Od nejbližší" },
            { value: "arrival-desc", label: "Nejpozdější příjezd" },
            { value: "arrival-asc", label: "Nejdřívější příjezd" },
            { value: "created-desc", label: "Nově vytvořené" },
            { value: "price-desc", label: "Nejvyšší cena" },
            { value: "price-asc", label: "Nejnižší cena" },
            { value: "name-asc", label: "Host A–Z" },
          ]}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Všechny"],
            ["active", "Nejbližší aktivní"],
            ["pending", "Čekající"],
            ["paid", "Zaplacené"],
            ["cancelled", "Zrušené"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              filter === id ? "border-ink bg-ink text-white" : "border-line bg-surface text-soft hover:border-ink/30"
            }`}
          >
            {label}
            {/* Čekající na platbu spěchají — oranžový odznak, dokud nějaké jsou */}
            {id === "pending" && count(id) > 0 ? (
              <span
                className="flex items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums"
                style={{ minWidth: "1.25rem", height: "1.25rem", background: "var(--amber)", color: "#fff" }}
              >
                {count(id)}
              </span>
            ) : (
              <span className="opacity-60">{count(id)}</span>
            )}
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
              {" "}
              · {czk(sum)} · {nights} {plural(nights, "noc", "noci", "nocí")}
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

      <div className="space-y-5">
        {shown.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-soft">
            Tomuhle filtru neodpovídá žádná rezervace.
          </p>
        )}

        {/* Hlavička tabulky (počítač) — klik na sloupec řadí */}
        {shown.length > 0 && (
          <div className="hidden items-center gap-4 px-5 sm:flex">
            <SortHeader label="Příjezd" active={sortCol === "arrival"} dir={sort === "nearest" ? "asc" : sortDir} onClick={() => sortBy("arrival")} className="w-16" />
            <SortHeader label="Host" active={sortCol === "name"} dir={sortDir} onClick={() => sortBy("name")} className="min-w-0 flex-1" />
            <span className="w-36" aria-hidden />
            <span className="w-32 text-xs font-semibold uppercase tracking-wider text-soft">Stav</span>
            <SortHeader label="Cena" active={sortCol === "price"} dir={sortDir} onClick={() => sortBy("price")} align="right" className="w-28" />
            <span className="w-9" aria-hidden />
          </div>
        )}

        {groups.map((g, gi) => (
          <section key={g.key} aria-label={g.key === "all" ? "Rezervace" : monthLabel(g.key.slice(-7))}>
            {/* Předěl mezi nadcházejícími a proběhlými pobyty („Od nejbližší“) */}
            {g.key.startsWith("p:") && !groups[gi - 1]?.key.startsWith("p:") && (
              <p className={`mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-soft ${gi > 0 ? "pt-4" : ""}`}>
                Proběhlé pobyty <span className="h-px flex-1 bg-line" />
              </p>
            )}
            {g.key !== "all" && (
              <h2 className="mb-2 flex items-baseline justify-between gap-3 px-1">
                <span className="font-display text-lg font-semibold capitalize">{monthLabel(g.key.slice(-7))}</span>
                {monthTotals.get(g.key) && (
                  <span className="text-sm text-soft">
                    {monthTotals.get(g.key)!.stays} {plural(monthTotals.get(g.key)!.stays, "pobyt", "pobyty", "pobytů")} ·{" "}
                    {czk(monthTotals.get(g.key)!.sum)}
                  </span>
                )}
              </h2>
            )}
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {g.items.map((r, ri) => {
                const action = primaryAction(r);
                const start = new Date(r.startDate);
                return (
                  <SwipeToPay
                    key={r.id}
                    id={`rez-${r.id}`}
                    className={`scroll-mt-24 ${ri === 0 ? "rounded-t-2xl" : ""} ${ri === g.items.length - 1 ? "rounded-b-2xl" : ""}`}
                    enabled={r.status === "pending"}
                    onPay={() => {
                      setStatus(r.id, "paid");
                      toast.show(`${r.guestName}: zaplaceno`, "success");
                    }}
                  >
                    <div
                      // Klik kamkoli do řádku rozbalí detail — kromě tlačítek a odkazů uvnitř
                      onClick={(e) => {
                        // Okna (kód k zámku…) jsou v portálu mimo řádek — jejich kliky sem jen probublají
                        if (!e.currentTarget.contains(e.target as Node)) return;
                        if ((e.target as HTMLElement).closest("button, a, input, select, [role=menu], [role=dialog]")) return;
                        if (window.getSelection()?.toString()) return;
                        if (window.matchMedia("(min-width: 640px)").matches) toggleDetail(r.id);
                        else setSheetId(r.id);
                      }}
                      className={`cursor-pointer bg-surface px-4 py-3 transition hover:bg-bg/60 sm:px-5 ${
                        r.status === "cancelled" ? "opacity-60" : ""
                      }`}
                      // Krajní řádky kopírují zaoblení boxu skupiny (box nemá overflow:hidden kvůli nabídce ⋯)
                      style={{
                        borderTopLeftRadius: ri === 0 ? 15 : 0,
                        borderTopRightRadius: ri === 0 ? 15 : 0,
                        borderBottomLeftRadius: ri === g.items.length - 1 ? 15 : 0,
                        borderBottomRightRadius: ri === g.items.length - 1 ? 15 : 0,
                      }}
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        {/* Datum příjezdu */}
                        <div className="w-12 shrink-0 text-center leading-tight sm:w-16">
                          <p className="font-display text-xl font-semibold tabular-nums">{start.getDate()}.</p>
                          <p className="text-[11px] font-medium uppercase tracking-wide text-soft">
                            {start.toLocaleDateString("cs-CZ", { month: "short" }).replace(".", "")}
                          </p>
                        </div>
                        {/* Host a termín */}
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold leading-snug">
                            <span className="truncate">{r.guestName}</span>
                            {r.source !== "web" && (
                              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-soft">
                                {SOURCE_LABEL[r.source] ?? r.source}
                              </span>
                            )}
                            <VoucherBadge code={r.voucherCode} discount={r.discount} />
                          </p>
                          <p className="truncate text-sm text-soft">
                            {shortRange(r.startDate, r.endDate)} · {nightsOf(r)} {plural(nightsOf(r), "noc", "noci", "nocí")}
                            {r.guests > 0 && ` · ${r.guests} ${plural(r.guests, "host", "hosté", "hostů")}`}
                          </p>
                        </div>
                        {/* Akce podle situace (počítač) — uprostřed */}
                        <div className="hidden w-36 shrink-0 justify-center sm:flex">
                          {action && (
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={action.run}
                              className="btn-ghost whitespace-nowrap !px-3.5 !py-1.5 text-xs"
                            >
                              {action.label}
                            </button>
                          )}
                        </div>
                        {/* Stav — klik na štítek ho přepne (počítač) */}
                        <div className="hidden w-32 shrink-0 sm:block">
                          <StatusMenu status={r.status} guestName={r.guestName} onChange={(st) => saveStatus(r.id, st)} />
                        </div>
                        {/* Cena vpravo; na mobilu pod ní stav */}
                        <div className="shrink-0 text-right sm:w-28">
                          <p className="font-semibold tabular-nums">{czk(r.totalPrice)}</p>
                          <div className="mt-0.5 sm:hidden">
                            <StatusMenu status={r.status} guestName={r.guestName} onChange={(st) => saveStatus(r.id, st)} />
                          </div>
                        </div>
                        <div className="w-9 shrink-0">
                          <ActionsMenu
                            items={[
                              r.status === "pending" && { label: "✓ Označit zaplaceno", run: () => setStatus(r.id, "paid") },
                              r.status === "paid" && {
                                label: "↺ Vrátit na nezaplaceno",
                                run: () => {
                                  setStatus(r.id, "pending");
                                  toast.show(`${r.guestName}: vráceno na nezaplaceno`, "success");
                                },
                              },
                              editable(r) && { label: "✎ Doplnit údaje", run: () => setEditing(r) },
                              r.status !== "cancelled" && !r.feedId && { label: "Změnit termín", run: () => setRescheduling(r) },
                              r.status !== "cancelled" &&
                                r.endDate.slice(0, 10) >= todayISO() && {
                                  label: r.accessCode ? `Kód k zámku: ${r.accessCode}` : "Doplnit kód k zámku",
                                  run: () => setCodeFor(r),
                                },
                              { label: details.has(r.id) ? "Skrýt detail" : "Zobrazit detail", run: () => (window.matchMedia("(min-width: 640px)").matches ? toggleDetail(r.id) : setSheetId(r.id)) },
                              r.status !== "cancelled"
                                ? { label: "✕ Zrušit rezervaci", run: () => cancelStay(r), danger: true }
                                : { label: "↺ Obnovit", run: () => setStatus(r.id, "pending") },
                            ]}
                          />
                        </div>
                      </div>
                      {details.has(r.id) && (
                        <div className="hidden sm:block">
                          <StayDetail r={r} site={site} />
                        </div>
                      )}
                    </div>
                  </SwipeToPay>
                );
              })}
            </div>
          </section>
        ))}

        <ListMore shown={visible.length} total={shown.length} onMore={paged.more} />
      </div>

      {sheetId &&
        (() => {
          const r = reservations.find((x) => x.id === sheetId);
          return r ? <DetailSheet r={r} site={site} onClose={() => setSheetId(null)} /> : null;
        })()}
      {codeFor && (
        <AccessCodeDialog
          code={codeFor.accessCode}
          context={`${codeFor.guestName} · ${fmtDate(codeFor.startDate)} – ${fmtDate(codeFor.endDate)}`}
          onClose={() => setCodeFor(null)}
          onSave={(code) => {
            const r = codeFor;
            setCodeFor(null);
            if (code !== r.accessCode) saveAccessCode(r, code);
          }}
        />
      )}
      {editing && <DetailsDialog r={editing} onClose={() => setEditing(null)} onSave={(patch) => saveDetails(editing, patch)} />}
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
    new Date(iso).toLocaleString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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

type MenuItem = { label: string; run: () => void; danger?: boolean };

/** Mobil: tlačítko „⋯“ s nabídkou akcí rezervace (na větší obrazovce jsou tlačítka v kartě). */
function ActionsMenu({ items }: { items: (MenuItem | false)[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const list = items.filter(Boolean) as MenuItem[];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Akce rezervace"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-soft transition hover:bg-bg hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
          <circle cx="5.5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="18.5" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lg"
        >
          {list.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.run();
              }}
              className={`block w-full rounded-xl px-3.5 py-2.5 text-left text-sm transition hover:bg-bg ${
                item.danger ? "text-coral" : "text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mobil: detail rezervace v okně zespodu. */
function DetailSheet({ r, site, onClose }: { r: Reservation; site: Site | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  const sendAt = accessCodeSendAt(r, arrivalDaysOf(site));
  const sent = !!sendAt && sendAt <= new Date();

  // Do <body>: předek s CSS transformací by jinak rozbil `fixed` překryv.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Rezervace ${r.guestName}`}
        className="rise flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold leading-tight">{r.guestName}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{czk(r.totalPrice)}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                {STATUS_LABEL[r.status]}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-soft hover:bg-bg hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-8 pt-1">
          <StayDetail r={r} site={site} />
          {sendAt && r.endDate.slice(0, 10) >= todayISO() && (
            <p
              className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                sent ? "bg-pine/10 text-pine" : "bg-amber/15 text-[#92600a]"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${sent ? "bg-pine" : "bg-amber"}`} aria-hidden />
              {sent
                ? `Kód odeslán hostovi ${fmtSendAt(sendAt)}`
                : `Kód čeká na odeslání · pošle se ${fmtSendAt(sendAt)}`}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Filtr rezervací. „Nejbližší aktivní“ = nezrušené pobyty, které probíhají nebo teprve přijdou. */
function matchesFilter(r: Reservation, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "active") return r.status !== "cancelled" && r.endDate.slice(0, 10) >= todayISO();
  return r.status === f;
}

/** Údaje jde doplnit u rezervací z portálů a ručních — u webových je zadal host. */
const editable = (r: Reservation) => r.source !== "web" && r.source !== "demo" && !r.anonymized;

type GuestDetails = { guestName: string; phone: string; email: string; guests: number; totalPrice: number };

function DetailsDialog({
  r,
  onClose,
  onSave,
}: {
  r: Reservation;
  onClose: () => void;
  onSave: (patch: GuestDetails) => void;
}) {
  const [name, setName] = useState(r.guestName.startsWith("Host z ") ? "" : r.guestName);
  const [phone, setPhone] = useState(r.phone);
  const [email, setEmail] = useState(r.email);
  const [guests, setGuests] = useState(r.guests ? String(r.guests) : "");
  const [price, setPrice] = useState(r.totalPrice ? String(r.totalPrice) : "");
  const nameOk = name.trim().length >= 2;
  const emailOk = !email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Doplnit údaje rezervace"
        className="rise w-full max-w-md space-y-4 rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!nameOk || !emailOk) return;
          onSave({
            guestName: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            guests: Number(guests) || 0,
            totalPrice: Number(price) || 0,
          });
        }}
      >
        <div>
          <h2 className="font-display text-xl font-semibold">Doplnit údaje</h2>
          <p className="mt-0.5 text-sm text-soft">
            {SOURCE_LABEL[r.source] ?? r.source} · {fmtDate(r.startDate)} – {fmtDate(r.endDate)}. Cena se započítá do
            tržeb.
          </p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Jméno hosta</span>
          <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Jan Novák" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Počet hostů</span>
            <input
              className="field"
              inputMode="numeric"
              value={guests}
              onChange={(e) => setGuests(e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Cena celkem (Kč)</span>
            <input
              className="field"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Telefon</span>
          <input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">E-mail</span>
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {!emailOk && <span className="mt-1 block text-xs text-coral">E-mail nemá správný tvar.</span>}
        </label>
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            Zrušit
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={!nameOk || !emailOk}>
            Uložit
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

/** Krátký rozsah termínu: „20.–22. 10. 2026“. */
function shortRange(startIso: string, endIso: string): string {
  const [sy, sm, sd] = startIso.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = endIso.slice(0, 10).split("-").map(Number);
  if (sy === ey && sm === em) return `${sd}.–${ed}. ${em}. ${ey}`;
  if (sy === ey) return `${sd}. ${sm}. – ${ed}. ${em}. ${ey}`;
  return `${sd}. ${sm}. ${sy} – ${ed}. ${em}. ${ey}`;
}
