"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { NumberField } from "@/components/NumberField";
import { czk, plural } from "@/lib/pricing";
import { countryName, docTypeShort, periodLabel } from "@/lib/guestbook";
import type { BookRow, MissingRow } from "@/lib/guestbook-server";
import type { TaxSource } from "@/lib/tourist-tax";

// Kniha ubytovaných: osoby za období odvodu poplatku z pobytu, souhrn
// k odvodu obci, evidence odvodu a exporty (Excel pro obec, UNL pro Ubyport).
// Řádek otevře rezervaci s celým záznamem osoby.

type Book = {
  period: string;
  rows: BookRow[];
  missing: MissingRow[];
  summary: { people: number; personNights: number; exempt: number; taxDue: number; collected: number; rate: number; foreign: number };
  remittance: { amount: number; paidAt: string; note: string } | null;
};
type Data = {
  ready: boolean;
  period: string;
  periods: string[];
  taxPeriod: string;
  book: Book | null;
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Kniha ubytovaných</h1>
          <p className="mt-1 text-sm text-soft">Údaje z check-inu, šifrované. Uchovávají se 6 let, pak se samy smažou.</p>
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

      {!data.ready ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-soft">
          Kniha ubytovaných zatím nejde použít — v nastavení serveru chybí šifrovací klíč (GUEST_DATA_KEY).
        </p>
      ) : !book ? null : (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-50" : ""}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [String(book.summary.people), plural(book.summary.people, "ubytovaná osoba", "ubytované osoby", "ubytovaných osob")],
              [String(book.summary.personNights), "osobonocí"],
              [String(book.summary.exempt), "osvobozeno od poplatku"],
              [czk(book.summary.taxDue), "poplatek k odvodu"],
            ].map(([b, t]) => (
              <div key={t} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <p className="font-display text-2xl font-semibold tabular-nums">{b}</p>
                <p className="text-xs text-soft">{t}</p>
              </div>
            ))}
          </div>

          <Remittance slug={slug} period={current} book={book} taxSource={data.taxSource} onSaved={(remittance) => setData({ ...data, book: { ...book, remittance } })} />

          {book.missing.length > 0 && (
            <div className="rounded-xl bg-amber/15 px-4 py-3 text-sm text-[#92600a]">
              <p className="flex items-center gap-2 font-semibold">
                <Icon name="alert" size={16} />
                {book.missing.length === 1 ? "1 pobyt nemá" : `${book.missing.length} ${plural(book.missing.length, "pobyt nemá", "pobyty nemají", "pobytů nemá")}`} kompletní
                check-in
              </p>
              <ul className="mt-1.5 space-y-0.5 pl-6">
                {book.missing.map((m) => (
                  <li key={m.reservationId}>
                    <Link href={`/admin/rezervace?detail=${m.reservationId}`} className="underline-offset-2 hover:underline">
                      {short(m.start)}–{short(m.end)} · {m.guestName} · {m.filled} z {m.total}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {book.rows.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface p-6 text-center text-soft">V tomhle období zatím nikdo v knize není.</p>
          ) : (
            <>
              {/* Počítač: tabulka */}
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
                    {book.rows.map((r) => (
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
              {/* Telefon: karty */}
              <ul className="space-y-2 md:hidden">
                {book.rows.map((r) => (
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
              <p className="text-xs text-soft">
                Čísla dokladů jsou zkrácená — celý záznam uvidíš v detailu rezervace. Každé zobrazení a export se zapisuje do historie přístupů.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Odvod poplatku obci za období: souhrn, sazba z vyhlášky a „Označit jako odvedené“. */
function Remittance({
  slug,
  period,
  book,
  taxSource,
  onSaved,
}: {
  slug: string;
  period: string;
  book: Book;
  taxSource: TaxSource | null;
  onSaved: (r: Book["remittance"]) => void;
}) {
  const [amount, setAmount] = useState(book.summary.taxDue);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => setAmount(book.remittance?.amount ?? book.summary.taxDue), [book]);

  async function save() {
    const before = book.remittance;
    onSaved({ amount, paidAt, note: "" });
    setEditing(false);
    const res = await fetch(`/api/sites/${slug}/guestbook/remittance`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ period, amount, paidAt }),
    }).catch(() => null);
    if (!res?.ok) {
      onSaved(before);
      setError("Uložení se nepovedlo. Zkus to znovu.");
    }
  }

  async function undo() {
    const before = book.remittance;
    onSaved(null);
    const res = await fetch(`/api/sites/${slug}/guestbook/remittance?period=${period}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) onSaved(before);
  }

  const s = book.summary;
  const source = taxSource?.status === "found" ? taxSource : null;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Poplatek z pobytu · {periodLabel(period)}</h2>
          <p className="mt-0.5 text-sm text-soft">
            {s.rate ? `${czk(s.rate)} za osobu a noc` : "Sazba není nastavená"}
            {source?.municipality && (
              <>
                {" · "}
                <a href={source.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  {source.municipality}
                </a>
              </>
            )}
            {" · "}vybráno od hostů v zaplacených rezervacích {czk(s.collected)}
          </p>
        </div>
        {book.remittance && !editing ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-pine/10 px-3 py-1 text-sm font-semibold text-pine">
              ✓ Odvedeno {full(book.remittance.paidAt)} · {czk(book.remittance.amount)}
            </span>
            <button type="button" className="text-sm text-soft hover:text-ink" onClick={() => setEditing(true)}>
              Upravit
            </button>
            <button type="button" className="text-sm text-soft hover:text-coral" onClick={undo}>
              Zrušit
            </button>
          </div>
        ) : null}
      </div>
      {(!book.remittance || editing) && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-soft">Odvedená částka (Kč)</span>
            <NumberField value={amount} onChange={setAmount} min={0} className="field !w-36 !py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-soft">Datum odvodu</span>
            <input type="date" className="field field-time !w-44 !py-2" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </label>
          <button type="button" className="btn-primary !px-5 !py-2.5 text-sm" onClick={save}>
            Označit jako odvedené
          </button>
          {editing && (
            <button type="button" className="text-sm text-soft hover:text-ink" onClick={() => setEditing(false)}>
              Zpět
            </button>
          )}
          <p className="w-full text-xs text-soft">Termín a způsob odvodu určuje vyhláška obce — obvykle do 15. dne po skončení období.</p>
          {error && <p className="w-full text-sm text-coral">{error}</p>}
        </div>
      )}
    </section>
  );
}

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
              <span className="block text-sm font-semibold">Cizinci pro Ubyport (UNL)</span>
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
