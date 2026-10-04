"use client";

import { useMemo, useState } from "react";
import {
  useAdminData,
  fmtDate,
  guestsLabel,
  norm,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  type Reservation,
} from "@/lib/admin";
import { czk, nightsBetween, plural } from "@/lib/pricing";
import { todayISO } from "@/lib/stay";
import { Dropdown } from "@/components/Dropdown";
import { VoucherBadge } from "@/components/VoucherBadge";

type Show = "all" | "returning" | "upcoming" | "once";
type Sort = "spent" | "last" | "stays" | "name";

type Guest = {
  key: string;
  name: string;
  email: string;
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
  const { site, reservations, loading, error } = useAdminData();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<Sort>("spent");
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Host = e-mail. Zrušené rezervace se ukážou v detailu, ale nepočítají se.
  const guests = useMemo(() => {
    const today = todayISO();
    const map = new Map<string, Guest>();
    for (const r of [...reservations].sort((a, b) => b.startDate.localeCompare(a.startDate))) {
      const key = r.email.toLowerCase();
      const g =
        map.get(key) ??
        ({ key, name: r.guestName, email: r.email, phone: r.phone, stays: [], count: 0, nights: 0, spent: 0, first: "", last: "", next: null } as Guest);
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

  if (loading) return <p className="py-16 text-center text-soft">Načítám hosty…</p>;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    <div className="space-y-5">
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

      <div className="space-y-2">
        {shown.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-soft">
            {guests.length === 0
              ? "Zatím žádní hosté — po první rezervaci se tady objeví."
              : "Tomuhle filtru neodpovídá žádný host."}
          </p>
        )}
        {shown.map((g) => {
          const expanded = open === g.key;
          return (
            <div key={g.key} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : g.key)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-bg/60 sm:gap-4"
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
                    {g.email}
                    {g.phone && <span className="hidden sm:inline"> · {g.phone}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-soft sm:hidden">
                    {g.count}× pobyt · <span className="whitespace-nowrap">naposledy {fmtDate(g.last)}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{czk(g.spent)}</p>
                  <p className="hidden text-xs text-soft sm:block">
                    {g.count}× pobyt · naposledy {fmtDate(g.last)}
                  </p>
                </div>
                <span
                  aria-hidden
                  className={`shrink-0 text-base leading-none text-soft transition-transform ${expanded ? "rotate-180" : ""}`}
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
                      <a href={`mailto:${g.email}`} className="font-medium text-pine hover:underline">
                        Napsat e-mail
                      </a>
                      {g.phone && (
                        <a href={`tel:${g.phone.replace(/\s/g, "")}`} className="font-medium text-pine hover:underline">
                          Zavolat
                        </a>
                      )}
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
    </div>
  );
}
