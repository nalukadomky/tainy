"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useAdminData,
  fmtDate,
  guestsLabel,
  norm,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  type GuestDeleteMode,
  type Reservation,
} from "@/lib/admin";
import { czk, nightsBetween, plural } from "@/lib/pricing";
import { todayISO } from "@/lib/stay";
import { ListMore, usePaged } from "@/components/ListMore";
import { SortHeader } from "@/components/SortHeader";
import { Dropdown } from "@/components/Dropdown";
import { VoucherBadge } from "@/components/VoucherBadge";
import { ListPageSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type Show = "all" | "returning" | "upcoming" | "once";
type Sort = "spent" | "last" | "stays" | "name";

type Guest = {
  key: string;
  name: string;
  email: string;
  /** Číslo anonymizovaného hosta (nesouhlas s GDPR), jinak prázdné. */
  ref: string;
  phone: string;
  /** Všechny rezervace hosta včetně zrušených, od nejnovější. */
  stays: Reservation[];
  /** Nezrušené pobyty. */
  count: number;
  nights: number;
  spent: number;
  first: string;
  last: string;
  /** Nejbližší nadcházející pobyt (ISO datum), pokud je. */
  next: string | null;
};

const nightsOf = (r: Reservation) => nightsBetween(new Date(r.startDate), new Date(r.endDate));

export default function GuestsPage() {
  const { site, reservations, loading, error, removeGuest } = useAdminData();
  const toast = useToast();
  // Host, u kterého se právě potvrzuje smazání
  const [deleting, setDeleting] = useState<Guest | null>(null);

  async function confirmDelete(g: Guest, mode: GuestDeleteMode) {
    setDeleting(null);
    setOpen(null);
    try {
      await removeGuest({ email: g.email, ref: g.ref }, mode);
      toast.show(
        mode === "pseudonymize"
          ? "Host je anonymizovaný — ve statistikách zůstal bez osobních údajů."
          : mode === "keepRevenue"
            ? "Host je smazaný, částky zůstaly v příjmech."
            : "Host je smazaný.",
        "success"
      );
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Hosta se nepodařilo smazat.");
    }
  }
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<Sort>("spent");
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Host = e-mail (anonymizovaný host = jeho číslo). Zrušené rezervace se ukážou
  // v detailu, ale nepočítají se.
  const guests = useMemo(() => {
    const today = todayISO();
    const map = new Map<string, Guest>();
    // Rezervace smazaných hostů (ponechané kvůli příjmům) už žádnému hostovi nepatří
    for (const r of [...reservations]
      .filter((r) => !r.anonymized && (r.email || r.guestRef))
      .sort((a, b) => b.startDate.localeCompare(a.startDate))) {
      const key = r.guestRef || r.email.toLowerCase();
      const g =
        map.get(key) ??
        ({ key, name: r.guestName, email: r.email, ref: r.guestRef, phone: r.phone, stays: [], count: 0, nights: 0, spent: 0, first: "", last: "", next: null } as Guest);
      g.stays.push(r);
      if (!g.phone && r.phone) g.phone = r.phone;
      if (r.status !== "cancelled") {
        g.count += 1;
        g.nights += nightsOf(r);
        if (r.status === "paid") g.spent += r.totalPrice;
        const start = r.startDate.slice(0, 10);
        if (!g.last || start > g.last) g.last = start;
        if (!g.first || start < g.first) g.first = start;
        if (r.endDate.slice(0, 10) > today && (!g.next || start < g.next)) g.next = start;
      }
      map.set(key, g);
    }
    // Host jen se zrušenými rezervacemi mezi hosty nepatří.
    return [...map.values()].filter((g) => g.count > 0);
  }, [reservations]);

  const shown = useMemo(() => {
    const q = norm(query.trim());
    const list = guests.filter((g) => {
      if (show === "returning" && g.count < 2) return false;
      if (show === "once" && g.count !== 1) return false;
      if (show === "upcoming" && !g.next) return false;
      if (q && !norm(`${g.name} ${g.email} ${g.phone}`).includes(q)) return false;
      return true;
    });
    const by: Record<Sort, (a: Guest, b: Guest) => number> = {
      spent: (a, b) => b.spent - a.spent,
      last: (a, b) => b.last.localeCompare(a.last),
      stays: (a, b) => b.count - a.count || b.spent - a.spent,
      name: (a, b) => a.name.localeCompare(b.name, "cs"),
    };
    return list.sort(by[sort]);
  }, [guests, query, show, sort]);

  const returning = guests.filter((g) => g.count > 1).length;
  // Postupné načítání po 20
  const paged = usePaged(`${query}|${show}|${sort}`);
  const visibleGuests = shown.slice(0, paged.limit);
  const filtered = query !== "" || show !== "all";

  async function exportXlsx() {
    setExporting(true);
    try {
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const head = (t: string) => ({ value: t, fontWeight: "bold" as const });
      const date = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`) : null);

      const guestRows = [
        ["Jméno", "E-mail", "Telefon", "Pobytů", "Nocí", "Útrata (Kč)", "První pobyt", "Poslední pobyt", "Příští pobyt"].map(head),
        ...shown.map((g) => [g.name, g.email, g.phone, g.count, g.nights, g.spent, date(g.first), date(g.last), date(g.next)]),
      ];
      const stayRows = [
        ["Host", "E-mail", "Příjezd", "Odjezd", "Nocí", "Hosté", "Zdroj", "Stav", "Cena (Kč)", "Kód"].map(head),
        ...shown.flatMap((g) =>
          g.stays.map((r) => [
            r.guestName,
            r.email,
            date(r.startDate),
            date(r.endDate),
            nightsOf(r),
            guestsLabel(r, site),
            SOURCE_LABEL[r.source] ?? r.source,
            STATUS_LABEL[r.status],
            r.totalPrice,
            r.publicId,
          ])
        ),
      ];

      await writeXlsxFile(
        [
          {
            sheet: "Hosté",
            data: guestRows,
            columns: [22, 30, 18, 8, 8, 12, 14, 14, 14].map((width) => ({ width })),
            stickyRowsCount: 1,
            dateFormat: "d.m.yyyy",
          },
          {
            sheet: "Pobyty",
            data: stayRows,
            columns: [22, 30, 12, 12, 7, 34, 10, 16, 12, 14].map((width) => ({ width })),
            stickyRowsCount: 1,
            dateFormat: "d.m.yyyy",
          },
        ],
        {}
      ).toFile(`hoste-${site?.slug ?? "web"}-${todayISO()}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <ListPageSkeleton label="Načítám hosty" rows={6} />;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    <div className="space-y-5">
      {toast.node}
      {deleting && (
        <DeleteGuestDialog guest={deleting} onCancel={() => setDeleting(null)} onConfirm={(mode) => confirmDelete(deleting, mode)} />
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Hosté</h1>
          <p className="mt-1 text-sm text-soft">
            {guests.length} {plural(guests.length, "host", "hosté", "hostů")}
            {returning > 0 && ` · ${returning} se ${returning === 1 ? "vrátil" : "vrátili"} víckrát`}
          </p>
        </div>
        <button
          type="button"
          onClick={exportXlsx}
          disabled={exporting || shown.length === 0}
          title="Stáhnout zobrazené hosty a jejich pobyty jako tabulku .xlsx"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-soft transition hover:bg-line/40 hover:text-ink disabled:opacity-40"
        >
          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {exporting ? "Připravuji…" : "Excel"}
        </button>
      </div>

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
            placeholder="Hledat jméno, e-mail nebo telefon…"
            aria-label="Hledat hosta"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Dropdown
          label="Zobrazit"
          value={show}
          onChange={(v) => setShow(v as Show)}
          items={[
            { value: "all", label: "Všichni hosté" },
            { value: "upcoming", label: "S nadcházejícím pobytem" },
            { value: "returning", label: "Vracející se (2+ pobyty)" },
            { value: "once", label: "Byli jednou" },
          ]}
        />
        <Dropdown
          label="Řazení"
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          align="right"
          items={[
            { value: "spent", label: "Nejvyšší útrata" },
            { value: "last", label: "Naposledy u nás" },
            { value: "stays", label: "Nejvíc pobytů" },
            { value: "name", label: "Jméno A–Z" },
          ]}
        />
      </div>

      {filtered && (
        <div className="flex items-baseline justify-between text-sm text-soft">
          <p>
            Zobrazeno <strong className="font-semibold text-ink">{shown.length}</strong> z {guests.length}
          </p>
          <button
            onClick={() => {
              setQuery("");
              setShow("all");
            }}
            className="font-medium text-pine hover:underline"
          >
            Zrušit filtry
          </button>
        </div>
      )}

      <div className="space-y-3">
        {shown.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-soft">
            {guests.length === 0
              ? "Zatím žádní hosté — po první rezervaci se tady objeví."
              : "Tomuhle filtru neodpovídá žádný host."}
          </p>
        )}
        {/* Hlavička tabulky (počítač) — klik na sloupec řadí */}
        {shown.length > 0 && (
          <div className="hidden items-center gap-4 px-4 sm:flex">
            <SortHeader label="Host" active={sort === "name"} dir="asc" onClick={() => setSort("name")} className="min-w-0 flex-1 pl-[3.75rem]" />
            <SortHeader label="Pobyty" active={sort === "stays"} dir="desc" onClick={() => setSort("stays")} align="right" className="w-20" />
            <SortHeader label="Naposledy" active={sort === "last"} dir="desc" onClick={() => setSort("last")} align="right" className="w-28" />
            <SortHeader label="Útrata" active={sort === "spent"} dir="desc" onClick={() => setSort("spent")} align="right" className="w-28" />
            <span className="w-4" aria-hidden />
          </div>
        )}
        {visibleGuests.length > 0 && (
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {visibleGuests.map((g, gi) => {
          const expanded = open === g.key;
          const first = gi === 0;
          const last = gi === visibleGuests.length - 1;
          return (
            <div
              key={g.key}
              className="overflow-hidden"
              style={{
                borderTopLeftRadius: first ? 15 : 0,
                borderTopRightRadius: first ? 15 : 0,
                borderBottomLeftRadius: last ? 15 : 0,
                borderBottomRightRadius: last ? 15 : 0,
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : g.key)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-bg/60 sm:gap-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pine/10 font-display text-base font-semibold text-pine sm:h-11 sm:w-11 sm:text-lg">
                  {g.name.charAt(0).toUpperCase()}
                </div>
                {/* Na mobilu má jméno přednost: počet pobytů jde pod kontakt a telefon do detailu */}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium leading-snug">
                    <span className="break-words">{g.name}</span>
                    {g.next && (
                      <span className="rounded-full bg-pine/10 px-2 py-0.5 text-[11px] font-semibold text-pine">
                        přijede {fmtDate(g.next)}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-soft">
                    {g.ref ? "Anonymizovaný na žádost (GDPR)" : g.email}
                    {g.phone && <span className="hidden sm:inline"> · {g.phone}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-soft sm:hidden">
                    {g.count}× pobyt · <span className="whitespace-nowrap">naposledy {fmtDate(g.last)}</span>
                  </p>
                </div>
                <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums sm:block">{g.count}×</span>
                <span className="hidden w-28 shrink-0 text-right text-sm text-soft sm:block">{fmtDate(g.last)}</span>
                <p className="shrink-0 text-right font-semibold tabular-nums sm:w-28">{czk(g.spent)}</p>
                <span
                  aria-hidden
                  className={`w-4 shrink-0 text-center text-base leading-none text-soft transition-transform ${expanded ? "rotate-180" : ""}`}
                >
                  ▾
                </span>
              </button>

              {expanded && (
                <div className="border-t border-line bg-bg/40 px-4 pb-4 pt-3">
                  <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-soft">
                    <span>
                      <strong className="text-ink">{g.count}</strong> {plural(g.count, "pobyt", "pobyty", "pobytů")}
                    </span>
                    <span>
                      <strong className="text-ink">{g.nights}</strong> {plural(g.nights, "noc", "noci", "nocí")}
                    </span>
                    <span>
                      poprvé <strong className="text-ink">{fmtDate(g.first)}</strong>
                    </span>
                    <span className="ml-auto flex gap-3">
                      {g.email && (
                        <a href={`mailto:${g.email}`} className="font-medium text-pine hover:underline">
                          Napsat e-mail
                        </a>
                      )}
                      {g.phone && (
                        <a href={`tel:${g.phone.replace(/\s/g, "")}`} className="font-medium text-pine hover:underline">
                          Zavolat
                        </a>
                      )}
                      <button type="button" onClick={() => setDeleting(g)} className="font-medium text-coral hover:underline">
                        Smazat hosta
                      </button>
                    </span>
                  </div>
                  <div className="divide-y divide-line rounded-xl border border-line bg-surface">
                    {g.stays.map((r) => (
                      <div
                        key={r.id}
                        className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 ${
                          r.status === "cancelled" ? "opacity-55" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                            <span className="font-normal text-soft">
                              {" "}
                              · {nightsOf(r)} {plural(nightsOf(r), "noc", "noci", "nocí")}
                            </span>
                          </p>
                          <p className="text-xs text-soft">
                            {guestsLabel(r, site)} · {SOURCE_LABEL[r.source] ?? r.source} · kód {r.publicId}
                          </p>
                          {r.voucherCode && (
                            <p className="mt-1">
                              <VoucherBadge code={r.voucherCode} discount={r.discount} />
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{czk(r.totalPrice)}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
        )}
        <ListMore shown={visibleGuests.length} total={shown.length} onMore={paged.more} />
      </div>
    </div>
  );
}

/** Potvrzení smazání hosta — co se smaže a jak naložit s daty pro statistiky. */
function DeleteGuestDialog({
  guest,
  onCancel,
  onConfirm,
}: {
  guest: Guest;
  onCancel: () => void;
  onConfirm: (mode: GuestDeleteMode) => void;
}) {
  // Už anonymizovaného hosta jde jen smazat (s částkami, nebo úplně)
  const [mode, setMode] = useState<GuestDeleteMode>(guest.ref ? "keepRevenue" : "pseudonymize");
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const n = guest.stays.length;
  const option = (value: GuestDeleteMode, title: string, hint: string) => (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
        mode === value ? "border-pine/50 bg-pine/5" : "border-line hover:bg-bg"
      }`}
    >
      <input
        type="radio"
        name="guest-delete-mode"
        className="mt-0.5 accent-[var(--pine)]"
        checked={mode === value}
        onChange={() => setMode(value)}
      />
      <span>
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-soft">{hint}</span>
      </span>
    </label>
  );

  // Do <body>: předek s CSS transformací by jinak rozbil `fixed` překryv.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`Smazat hosta ${guest.name}?`}
        className="rise max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-semibold">Smazat hosta {guest.name}?</h2>
        <p className="mt-2 text-sm text-soft">
          Smaže se jméno, e-mail, telefon a poznámky k{" "}
          <strong className="text-ink">
            {n} {plural(n, "rezervaci", "rezervacím", "rezervacím")}
          </strong>
          . Úklidy a náklady za úklid zůstanou vždy. Tuhle akci nejde vrátit.
        </p>

        <div className="mt-4 space-y-2">
          {!guest.ref &&
            option(
              "pseudonymize",
              "Anonymizovat (nesouhlas s GDPR)",
              "Z hosta bude „Host č. …“ bez jména a kontaktu. Zůstane v seznamu hostů i ve všech statistikách — pobyty, noci, útrata."
            )}
          {option(
            "keepRevenue",
            "Smazat, ponechat částky v příjmech",
            "Host zmizí ze seznamu hostů. Rezervace zůstanou jako „Smazaný host“ jen s termínem a částkou, aby seděly tržby."
          )}
          {option(
            "full",
            "Smazat úplně",
            "Rezervace zmizí i z tržeb a statistik, včetně informací o ubytování."
          )}
        </div>

        {guest.next && mode === "full" && (
          <p className="mt-3 rounded-xl bg-amber/15 px-4 py-2.5 text-sm text-[#92600a]">
            Host má nadcházející pobyt ({fmtDate(guest.next)}) — při úplném smazání se termín v kalendáři uvolní.
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button ref={cancelRef} type="button" className="btn-ghost flex-1 !py-2.5" onClick={onCancel}>
            Zrušit
          </button>
          <button
            type="button"
            className="btn-primary flex-1 !bg-coral !py-2.5 hover:!bg-coral/90"
            onClick={() => onConfirm(mode)}
          >
            {mode === "pseudonymize" ? "Anonymizovat" : "Smazat hosta"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
