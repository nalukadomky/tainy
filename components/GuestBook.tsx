"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { NumberField } from "@/components/NumberField";
import { czk, plural } from "@/lib/pricing";
import { countryName, docTypeShort, periodLabel, periodRange } from "@/lib/guestbook";
import type { BookRow, BookStay, PendingForeigner } from "@/lib/guestbook-server";
import { addDays, todayISO } from "@/lib/stay";
import type { TaxSource } from "@/lib/tourist-tax";

// Kniha ubytovaných: poplatek z pobytu za období (vybráno / k odvodu /
// odvedeno), stav check-inů a osoby v knize, cizinci k nahlášení a exporty.

type Book = {
  period: string;
  ended: boolean;
  rows: BookRow[];
  stays: BookStay[];
  missing: BookStay[];
  summary: {
    expectedPeople: number;
    people: number;
    personNights: number;
    exempt: number;
    taxDue: number;
    taxEstimated: number;
    collected: number;
    rate: number;
    foreign: number;
  };
  remittance: { amount: number; paidAt: string; note: string } | null;
};
type Data = {
  ready: boolean;
  period: string;
  periods: string[];
  taxPeriod: string;
  book: Book | null;
  ubyportPending: PendingForeigner[];
  taxSource: TaxSource | null;
  ubyport: { idub: string; abbr: string };
};

const short = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}.`;
};
const full = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
};
const persons = (n: number) => `${n} ${plural(n, "osoba", "osoby", "osob")}`;

export function GuestBook({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [period, setPeriod] = useState("");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/sites/${slug}/guestbook${period ? `?period=${period}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => {
        if (!alive) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [slug, period]);

  if (failed && !data) return <p className="py-16 text-center text-soft">Knihu ubytovaných se nepodařilo načíst.</p>;
  if (!data) return <BookSkeleton />;

  const book = data.book;
  const current = period || data.period;
  const setRemittance = (remittance: Book["remittance"]) => setData((d) => (d?.book ? { ...d, book: { ...d.book, remittance } } : d));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Kniha ubytovaných</h1>
          <p className="mt-1 text-sm text-soft">Údaje hostů z check-inu (šifrované) a poplatek z pobytu pro obec.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="control !py-2 text-sm font-semibold" value={current} onChange={(e) => setPeriod(e.target.value)} aria-label="Období">
            {data.periods.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
          {book && <ExportMenu slug={slug} period={current} ubyport={data.ubyport} foreign={book.summary.foreign} />}
        </div>
      </div>

      {data.taxSource?.changed && (
        <div className="flex items-start gap-2 rounded-xl bg-amber/15 px-4 py-3 text-sm text-[#92600a]">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <span>
            Obec má novou vyhlášku o poplatku z pobytu — zkontroluj sazbu v{" "}
            <Link className="font-semibold underline" href="/admin/nastaveni?sekce=cenik&pole=poplatek">
              ceníku
            </Link>
            .
          </span>
        </div>
      )}

      {data.ready && data.ubyportPending.length > 0 && (
        <UbyportPending slug={slug} list={data.ubyportPending} idub={data.ubyport.idub} onChange={(ubyportPending) => setData((d) => (d ? { ...d, ubyportPending } : d))} />
      )}

      {!data.ready ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-soft">
          Kniha ubytovaných zatím nejde použít — v nastavení serveru chybí šifrovací klíč (GUEST_DATA_KEY).
        </p>
      ) : !book ? null : (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-50" : ""}`}>
          <TaxCard slug={slug} book={book} taxSource={data.taxSource} onRemittance={setRemittance} />
          <CheckinStatus book={book} />
          <PeopleTable rows={book.rows} />
        </div>
      )}
    </div>
  );
}

/* ---------- Poplatek: stav období a odvod ---------- */

/** Stav odvodu za období: probíhá → čeká na odvod → odvedeno. */
function periodState(book: Book) {
  const range = periodRange(book.period)!;
  const lastDay = addDays(range.end, -1);
  const dueBy = addDays(range.end, 14); // obvykle do 15. dne po skončení období
  if (book.remittance) return { key: "done" as const, label: `Odvedeno ${full(book.remittance.paidAt)}`, cls: "bg-pine/10 text-pine", lastDay, dueBy };
  if (!book.ended) return { key: "running" as const, label: `Probíhá · do ${full(lastDay)}`, cls: "bg-bg text-soft", lastDay, dueBy };
  return { key: "due" as const, label: `Čeká na odvod${todayISO() > dueBy ? " — termín prošel" : ` · obvykle do ${full(dueBy)}`}`, cls: "bg-amber/20 text-[#92600a]", lastDay, dueBy };
}

/** Formulář „Zaznamenat odvod“ (sdílený) — ukládá se hned, při chybě se vrátí. */
function RemitForm({ slug, book, onRemittance, onDone }: { slug: string; book: Book; onRemittance: (r: Book["remittance"]) => void; onDone?: () => void }) {
  const [amount, setAmount] = useState(book.remittance?.amount ?? book.summary.taxDue);
  const [paidAt, setPaidAt] = useState(book.remittance?.paidAt ?? todayISO());
  const [error, setError] = useState("");
  async function save() {
    const before = book.remittance;
    onRemittance({ amount, paidAt, note: "" });
    onDone?.();
    const res = await fetch(`/api/sites/${slug}/guestbook/remittance`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ period: book.period, amount, paidAt }),
    }).catch(() => null);
    if (!res?.ok) {
      onRemittance(before);
      setError("Uložení se nepovedlo. Zkus to znovu.");
    }
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-soft">Odvedená částka (Kč)</span>
        <NumberField value={amount} onChange={setAmount} min={0} className="field !w-36 !py-2" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-soft">Kdy</span>
        <input type="date" className="field field-time !w-44 !py-2" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
      </label>
      <button type="button" className="btn-primary !px-5 !py-2.5 text-sm" onClick={save}>
        Uložit odvod
      </button>
      {error && <p className="w-full text-sm text-coral">{error}</p>}
    </div>
  );
}

async function undoRemittance(slug: string, book: Book, onRemittance: (r: Book["remittance"]) => void) {
  const before = book.remittance;
  onRemittance(null);
  const res = await fetch(`/api/sites/${slug}/guestbook/remittance?period=${book.period}`, { method: "DELETE" }).catch(() => null);
  if (!res?.ok) onRemittance(before);
}

const Estimate = ({ book }: { book: Book }) =>
  book.summary.taxEstimated > 0 ? (
    <span className="mt-0.5 block text-xs font-normal text-soft" title="U pobytů bez kompletního check-inu počítáme podle skladby hostů v rezervaci.">
      z toho {czk(book.summary.taxEstimated)} odhadem
    </span>
  ) : null;

/** Poplatek za období: vybráno / k odvodu / odvedeno a jasný další krok. */
function TaxCard({ slug, book, taxSource, onRemittance }: { slug: string; book: Book; taxSource: TaxSource | null; onRemittance: (r: Book["remittance"]) => void }) {
  const [form, setForm] = useState(false);
  const s = book.summary;
  const st = periodState(book);
  const source = taxSource?.status === "found" ? taxSource : null;
  const cell = "rounded-xl bg-bg px-4 py-3";
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Poplatek z pobytu · {periodLabel(book.period)}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className={cell}>
          <p className="text-xs text-soft">Vybráno od hostů</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{czk(s.collected)}</p>
          <span className="block text-xs text-soft">v zaplacených rezervacích</span>
        </div>
        <div className={cell}>
          <p className="text-xs text-soft">K odvodu obci</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{czk(s.taxDue)}</p>
          <Estimate book={book} />
        </div>
        <div className={cell}>
          <p className="text-xs text-soft">Odvedeno</p>
          <p className={`font-display text-2xl font-semibold tabular-nums ${book.remittance ? "text-pine" : "text-soft/60"}`}>{book.remittance ? czk(book.remittance.amount) : "—"}</p>
          <span className="block text-xs text-soft">{book.remittance ? full(book.remittance.paidAt) : "zatím ne"}</span>
        </div>
      </div>
      <p className="mt-3 text-sm text-soft">
        {s.rate ? `${czk(s.rate)} za osobu a noc` : "Sazba není nastavená"}
        {source?.municipality && (
          <>
            {" "}
            ({" "}
            <a href={source.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {source.municipality}
            </a>
            )
          </>
        )}{" "}
        · {persons(s.expectedPeople)} · {s.personNights} {plural(s.personNights, "přenocování", "přenocování", "přenocování")}
        <span className="text-soft/70" title="1 přenocování = 1 osoba na 1 noc. Poplatek = přenocování × sazba, kromě osvobozených.">
          {" "}
          ⓘ
        </span>
        {s.exempt > 0 && ` · ${s.exempt} ${plural(s.exempt, "osvobozený", "osvobození", "osvobozených")} (děti do 18 let aj.)`}
      </p>
      <div className="mt-4 border-t border-line pt-4">
        {st.key === "running" && !form ? (
          <p className="text-sm text-soft">
            Odvádí se až po skončení období — obvykle do {full(st.dueBy)} (přesný termín určuje vyhláška obce).{" "}
            <button type="button" className="font-semibold text-pine hover:underline" onClick={() => setForm(true)}>
              Zaznamenat odvod
            </button>
          </p>
        ) : st.key === "done" && !form ? (
          <p className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-pine">✓ Za tohle období máš odvedeno.</span>
            <button type="button" className="text-soft hover:text-ink" onClick={() => setForm(true)}>
              Upravit
            </button>
            <button type="button" className="text-soft hover:text-coral" onClick={() => undoRemittance(slug, book, onRemittance)}>
              Zrušit
            </button>
          </p>
        ) : (
          <div className="space-y-2">
            {st.key === "due" && <p className="text-sm font-semibold">Pošli obci {czk(s.taxDue)} a zaznamenej odvod:</p>}
            <RemitForm slug={slug} book={book} onRemittance={onRemittance} onDone={() => setForm(false)} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Stav check-inů — problém jen u pobytů, které už začaly. */
function CheckinStatus({ book }: { book: Book }) {
  const upcoming = book.stays.filter((x) => !x.started && x.filled < x.total);
  const s = book.summary;
  const pct = s.expectedPeople ? Math.round((s.people / s.expectedPeople) * 100) : 0;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Check-in hostů</h2>
        <span className="text-sm text-soft">
          {s.people} z {persons(s.expectedPeople)} v knize
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-pine" style={{ width: `${pct}%` }} />
      </div>
      {book.missing.length > 0 ? (
        <div className="mt-4 rounded-xl bg-amber/15 px-4 py-3 text-sm text-[#92600a]">
          <p className="font-semibold">
            {book.missing.length === 1 ? "1 pobyt už začal a chybí mu check-in" : `${book.missing.length} pobyty už začaly a chybí jim check-in`} — doplň ho ručně
          </p>
          <ul className="mt-1.5 space-y-1">
            {book.missing.map((m) => (
              <li key={m.reservationId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {short(m.start)}–{short(m.end)} · {m.guestName} · vyplněno {m.filled} z {m.total}
                </span>
                <Link href={`/admin/rezervace?detail=${m.reservationId}`} className="font-semibold underline-offset-2 hover:underline">
                  Doplnit →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-pine">✓ Všechny pobyty, které už začaly, mají check-in.</p>
      )}
      {upcoming.length > 0 && (
        <p className="mt-3 text-sm text-soft">
          {upcoming.length} {plural(upcoming.length, "nadcházející pobyt", "nadcházející pobyty", "nadcházejících pobytů")} zatím bez check-inu — to je v pořádku, hosté dostanou
          odkaz den před příjezdem.
        </p>
      )}
    </section>
  );
}

/** Osoby v knize — tabulka na počítači, karty na telefonu. */
function PeopleTable({ rows }: { rows: BookRow[] }) {
  if (!rows.length) return <p className="rounded-2xl border border-line bg-surface p-6 text-center text-soft">V tomhle období zatím nikdo check-in nevyplnil.</p>;
  return (
    <section className="space-y-2">
      <h2 className="px-1 font-display text-lg font-semibold">Hosté v knize</h2>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-soft">
              {["Pobyt", "Jméno", "Narozen/a", "Občanství", "Doklad", "Bydliště", "Poplatek"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={`${r.reservationId}-${r.position}`} className="cursor-pointer hover:bg-bg/60" onClick={() => (window.location.href = `/admin/rezervace?detail=${r.reservationId}`)}>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                  {short(r.start)}–{short(r.end)}
                </td>
                <td className="px-4 py-2.5 font-medium">{r.name}</td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{full(r.birthDate)}</td>
                <td className={`px-4 py-2.5 ${r.foreign ? "font-semibold text-pine" : ""}`} title={countryName(r.nationality)}>
                  {r.nationality}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">{r.doc ? `${docTypeShort(r.docType)} ${r.doc}` : "—"}</td>
                <td className="px-4 py-2.5">
                  {r.city}
                  {r.country !== "CZE" && `, ${r.country}`}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{r.exemption ? <span className="text-soft">osvobozen ({r.exemption})</span> : czk(r.tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={`${r.reservationId}-${r.position}`}>
            <Link href={`/admin/rezervace?detail=${r.reservationId}`} className="block rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{r.name}</span>
                <span className="shrink-0 text-sm tabular-nums">{r.exemption ? <span className="text-soft">osvobozen</span> : czk(r.tax)}</span>
              </div>
              <p className="mt-0.5 text-sm text-soft">
                {short(r.start)}–{short(r.end)} · nar. {full(r.birthDate)} · {r.nationality}
                {r.doc && ` · ${docTypeShort(r.docType)} ${r.doc}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-1 text-xs text-soft">Čísla dokladů jsou zkrácená — celý záznam je v detailu rezervace. Každé zobrazení a export se zapisuje do historie přístupů.</p>
    </section>
  );
}

/** Cizinci, které je potřeba nahlásit policii: soubor pro Ubyport a „Nahlášeno“. */
function UbyportPending({
  slug,
  list,
  idub,
  onChange,
}: {
  slug: string;
  list: PendingForeigner[];
  idub: string;
  onChange: (list: PendingForeigner[]) => void;
}) {
  const [undo, setUndo] = useState<PendingForeigner[] | null>(null);
  const [error, setError] = useState("");
  const today = todayISO();
  const arrived = list.filter((x) => x.start <= today);
  const urgent = list.some((x) => x.deadline <= today && x.start <= today);

  async function mark(items: PendingForeigner[], back = false) {
    const before = list;
    const keys = new Set(items.map((x) => `${x.reservationId}:${x.position}`));
    onChange(back ? [...list, ...items].sort((a, b) => a.deadline.localeCompare(b.deadline)) : list.filter((x) => !keys.has(`${x.reservationId}:${x.position}`)));
    setUndo(back ? null : items);
    setError("");
    const res = await fetch(`/api/sites/${slug}/guestbook/reported`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: items.map(({ reservationId, position }) => ({ reservationId, position })), undo: back }),
    }).catch(() => null);
    if (!res?.ok) {
      onChange(before);
      setUndo(null);
      setError("Uložení se nepovedlo. Zkus to znovu.");
    }
  }

  const badge = (x: PendingForeigner) => {
    if (x.start > today) return { text: `přijede ${short(x.start)}`, cls: "bg-bg text-soft" };
    if (x.deadline < today) return { text: `po lhůtě (do ${short(x.deadline)})`, cls: "bg-coral/15 text-coral" };
    if (x.deadline === today) return { text: "dnes poslední den", cls: "bg-coral/15 text-coral" };
    return { text: `nahlásit do ${short(x.deadline)}`, cls: "bg-amber/20 text-[#92600a]" };
  };

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${urgent ? "border-coral/40 bg-coral/[0.04]" : "border-line bg-surface"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Icon name="alert" size={18} className={urgent ? "text-coral" : "text-[#92600a]"} />
            Cizinci k nahlášení policii
          </h2>
          <p className="mt-0.5 text-sm text-soft">Do 3 pracovních dnů ode dne příjezdu přes ubyport.policie.cz.</p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {list.map((x) => {
          const b = badge(x);
          return (
            <li key={`${x.reservationId}-${x.position}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{x.name}</span>
                <span className="text-soft">
                  {" "}
                  · {countryName(x.nationality)} · {short(x.start)}–{short(x.end)}
                </span>
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.text}</span>
              <button type="button" className="text-xs font-medium text-pine hover:underline" onClick={() => mark([x])}>
                Nahlášeno
              </button>
            </li>
          );
        })}
      </ul>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        <li>
          {idub ? (
            <a href={`/api/sites/${slug}/guestbook/export?type=ubyport-pending`} className="btn-primary w-full !py-2.5 text-sm">
              1. Stáhnout soubor
            </a>
          ) : (
            <Link href="/admin/nastaveni?sekce=automatizace&pole=ubyport" className="btn-ghost w-full !py-2.5 text-sm">
              1. Doplnit IDUB →
            </Link>
          )}
        </li>
        <li>
          <a href="https://ubyport.policie.cz" target="_blank" rel="noreferrer" className="btn-ghost w-full !py-2.5 text-sm">
            2. Nahrát na Ubyport ↗
          </a>
        </li>
        <li>
          <button type="button" className="btn-ghost w-full !py-2.5 text-sm" disabled={!arrived.length} onClick={() => mark(arrived)}>
            3. Označit {arrived.length === list.length ? "vše" : `přijeté (${arrived.length})`} jako nahlášené
          </button>
        </li>
      </ol>
      <p className="mt-2 text-xs text-soft" role="status">
        {error ||
          (undo ? (
            <>
              Označeno {undo.length} {plural(undo.length, "osoba", "osoby", "osob")} jako nahlášené.{" "}
              <button type="button" className="font-semibold text-pine hover:underline" onClick={() => mark(undo, true)}>
                Vrátit
              </button>
            </>
          ) : (
            "Soubor obsahuje jen cizince, kteří ještě nejsou nahlášení. Před prvním nahráním ho ověř validátorem UbyData (ke stažení na ubyport.policie.cz)."
          ))}
      </p>
    </section>
  );
}

/** Exporty za období: Excel pro obec a cizinci pro Ubyport. */
function ExportMenu({ slug, period, ubyport, foreign }: { slug: string; period: string; ubyport: { idub: string }; foreign: number }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const url = (type: string) => `/api/sites/${slug}/guestbook/export?type=${type}&period=${period}`;
  return (
    <div ref={box} className="relative">
      <button type="button" className="btn-ghost !px-4 !py-2 text-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Export ▾
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-line bg-surface p-1.5 shadow-xl">
          <a role="menuitem" href={url("obec")} className="block rounded-xl px-3 py-2.5 hover:bg-bg" onClick={() => setOpen(false)}>
            <span className="block text-sm font-semibold">Pro obec (Excel)</span>
            <span className="block text-xs text-soft">Kniha ubytovaných a souhrn poplatku k odvodu</span>
          </a>
          {ubyport.idub ? (
            <a role="menuitem" href={url("ubyport")} className="block rounded-xl px-3 py-2.5 hover:bg-bg" onClick={() => setOpen(false)}>
              <span className="block text-sm font-semibold">Všichni cizinci za období (UNL)</span>
              <span className="block text-xs text-soft">
                {foreign} {plural(foreign, "cizinec", "cizinci", "cizinců")} · nahraješ na ubyport.policie.cz (před prvním použitím ověř validátorem UbyData)
              </span>
            </a>
          ) : (
            <Link role="menuitem" href="/admin/nastaveni?sekce=automatizace&pole=ubyport" className="block rounded-xl px-3 py-2.5 hover:bg-bg">
              <span className="block text-sm font-semibold">Cizinci pro Ubyport</span>
              <span className="block text-xs text-soft">Nejdřív doplň identifikátor ubytovatele (IDUB) →</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function BookSkeleton() {
  return (
    <div className="space-y-5" aria-busy aria-label="Načítám knihu ubytovaných">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-line/60" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-line/50" />
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-2xl bg-line/50" />
      <div className="h-64 animate-pulse rounded-2xl bg-line/40" />
    </div>
  );
}
