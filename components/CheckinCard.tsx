"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { GuestPersonFields } from "@/components/GuestPersonFields";
import type { Reservation, Site } from "@/lib/admin";
import { czk, plural } from "@/lib/pricing";
import { nightsOf } from "@/lib/stay";
import {
  ageAt,
  countryName,
  docTypeShort,
  emptyPerson,
  exemptionOf,
  maskDoc,
  validatePerson,
  type GuestPerson,
} from "@/lib/guestbook";

// Check-in v detailu rezervace: kdo z pobytu je v knize ubytovaných, ruční
// doplnění (třeba při příjezdu), odkaz pro hosta a poplatek z pobytu.
// Údaje se načítají až tady (dešifruje je server, zobrazení se zapisuje do
// historie přístupů) — seznam rezervací zná jen počet vyplněných osob.

type Slot = { position: number; label: string };
type Stored = { position: number; person: GuestPerson; filledBy: string; reportedAt?: string | null };
type Data = {
  ready: boolean;
  enabled: boolean;
  slots: Slot[];
  persons: Stored[];
  link: string | null;
  checkinMailAt: string | null;
  checkinReminderAt: string | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

export function CheckinCard({ r, site, onChange }: { r: Reservation; site: Site | null; onChange?: (r: Reservation) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<number | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/reservations/${r.id}/checkin`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d: Data) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [r.id]);

  function flash(text: string) {
    setNote(text);
    window.setTimeout(() => setNote(""), 2500);
  }

  const start = r.startDate.slice(0, 10);
  const end = r.endDate.slice(0, 10);
  const nights = nightsOf(start, end);
  const total = data?.slots.length ?? 0;
  const filled = data ? data.persons.filter((p) => p.position < total).length : r.checkinCount ?? 0;
  const done = !!data && filled >= total;

  /** Uložená osoba se hned propíše, při chybě vrátí. */
  async function save(position: number, person: GuestPerson): Promise<string | null> {
    if (!data) return "Načítám…";
    const before = data;
    const persons = [...data.persons.filter((p) => p.position !== position), { position, person, filledBy: "owner" }].sort(
      (a, b) => a.position - b.position,
    );
    setData({ ...data, persons });
    const res = await fetch(`/api/reservations/${r.id}/checkin`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ position, person }),
    }).catch(() => null);
    if (!res?.ok) {
      setData(before);
      return (await res?.json().catch(() => null))?.error ?? "Uložení se nepovedlo. Zkus to znovu.";
    }
    const state: { done: boolean; filled: number } = await res.json();
    onChange?.({ ...r, checkinCount: state.filled, checkinDoneAt: state.done ? new Date().toISOString() : null });
    return null;
  }

  async function remove(position: number) {
    if (!data) return;
    const before = data;
    setData({ ...data, persons: data.persons.filter((p) => p.position !== position) });
    const res = await fetch(`/api/reservations/${r.id}/checkin?position=${position}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setData(before);
      flash("Smazání se nepovedlo.");
      return;
    }
    const state: { done: boolean; filled: number } = await res.json();
    onChange?.({ ...r, checkinCount: state.filled, checkinDoneAt: state.done ? r.checkinDoneAt ?? new Date().toISOString() : null });
  }

  async function copyLink() {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link);
      flash("Odkaz pro hosta je zkopírovaný.");
    } catch {
      window.prompt("Odkaz na check-in:", data.link);
    }
  }

  async function sendNow() {
    if (!data) return;
    const before = data;
    setData({ ...data, checkinMailAt: new Date().toISOString() });
    const res = await fetch(`/api/reservations/${r.id}/checkin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "send" }),
    }).catch(() => null);
    if (!res?.ok) {
      setData(before);
      flash((await res?.json().catch(() => null))?.error ?? "E-mail se nepodařilo odeslat.");
    } else flash("Odkaz na check-in odešel hostovi.");
  }

  // Poplatek z pobytu: z knihy (data narození, osvobození), dokud není kompletní, podle ceníku
  const rate = site?.touristTax ?? 0;
  const taxFromBook = data?.persons.reduce((sum, p) => sum + (exemptionOf(p.person, start, nights) ? 0 : rate * nights), 0) ?? 0;

  const badge = !data
    ? null
    : done
      ? { text: "hotovo", cls: "bg-pine/10 text-pine" }
      : { text: `${filled} z ${total} ${plural(total, "osoby", "osob", "osob")}`, cls: filled ? "bg-amber/20 text-[#92600a]" : "bg-bg text-soft" };

  const mailable = !!r.email.trim() && !r.anonymized && !["airbnb", "booking"].includes(r.source);

  return (
    <section className="rounded-xl border border-line bg-surface px-4 py-3.5 sm:col-span-2">
      <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-soft">
        <Icon name="clipboard" size={16} className="text-pine" />
        Check-in · kniha ubytovaných
        {badge && <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.text}</span>}
      </h3>

      {failed ? (
        <p className="text-sm text-soft">Check-in se nepodařilo načíst.</p>
      ) : !data ? (
        <div className="space-y-2" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-bg" />
          ))}
        </div>
      ) : !data.ready ? (
        <p className="text-sm text-soft">Check-in zatím nejde použít — v nastavení serveru chybí šifrovací klíč (GUEST_DATA_KEY).</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {data.slots.map((s) => {
              const stored = data.persons.find((x) => x.position === s.position);
              const p = stored?.person;
              const sub = p
                ? [
                    `${ageAt(p.birthDate, start)} let`,
                    countryName(p.nationality),
                    p.docNumber ? `${docTypeShort(p.docType)} ${maskDoc(p.docNumber)}` : "bez dokladu",
                    ...(p.nationality !== "CZE" ? [stored?.reportedAt ? "nahlášen policii ✓" : "čeká na nahlášení policii"] : []),
                  ].join(" · ")
                : `${s.label} · zatím nevyplněno`;
              return (
                <li key={s.position} className="flex items-center gap-3 py-2">
                  {p ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pine text-[10px] font-bold text-white">✓</span>
                  ) : (
                    <span className="h-5 w-5 shrink-0 rounded-full border-2 border-dashed border-line" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${p ? "" : "text-soft"}`}>{p ? `${p.firstName} ${p.lastName}` : `Osoba ${s.position + 1}`}</span>
                    <span className="block truncate text-xs text-soft">{sub}</span>
                  </span>
                  <button type="button" className="shrink-0 text-sm font-medium text-pine hover:underline" onClick={() => setDialog(s.position)}>
                    {p ? "Zobrazit" : "Doplnit"}
                  </button>
                </li>
              );
            })}
          </ul>

          {rate > 0 && (
            <p className="mt-1 flex flex-wrap justify-between gap-x-4 border-t border-line pt-2.5 text-sm">
              <span className="text-soft">Poplatek z pobytu</span>
              <span className="font-medium">
                {done ? czk(taxFromBook) : `${czk(rate)} / os. / noc`}
                <span className="ml-1.5 font-normal text-soft">
                  · {r.status === "paid" ? "zaplaceno s rezervací" : r.status === "cancelled" ? "zrušeno" : "zatím nezaplaceno"}
                </span>
              </span>
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {!done && (
              <button type="button" className="btn-ghost !px-4 !py-2 text-sm" onClick={() => setDialog(data.slots.find((s) => !data.persons.some((p) => p.position === s.position))?.position ?? 0)}>
                Doplnit ručně
              </button>
            )}
            {data.link && (
              <button type="button" className="btn-ghost !px-4 !py-2 text-sm" onClick={copyLink}>
                Kopírovat odkaz pro hosta
              </button>
            )}
            {data.link && mailable && !done && (
              <button type="button" className="btn-ghost !px-4 !py-2 text-sm" onClick={sendNow}>
                {data.checkinMailAt ? "Poslat znovu" : "Poslat e-mailem"}
              </button>
            )}
            <span className="ml-auto text-xs text-soft" role="status">
              {note ||
                (data.checkinMailAt
                  ? `Odkaz odešel ${when(data.checkinMailAt)}${data.checkinReminderAt ? ` · připomínka ${when(data.checkinReminderAt)}` : ""}`
                  : !mailable
                    ? "Rezervace nemá e-mail hosta — pošli mu odkaz sám, nebo doplň údaje ručně."
                    : !data.enabled
                      ? "Check-in je v Automatizaci vypnutý."
                      : "")}
            </span>
          </div>
        </>
      )}

      {dialog !== null && data && (
        <PersonDialog
          slots={data.slots}
          persons={data.persons}
          start={dialog}
          arrival={start}
          guestName={r.guestName}
          onSave={save}
          onDelete={remove}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

/** Ruční doplnění / úprava osob — krokování po osobách. */
function PersonDialog({
  slots,
  persons,
  start,
  arrival,
  guestName,
  onSave,
  onDelete,
  onClose,
}: {
  slots: Slot[];
  persons: Stored[];
  start: number;
  arrival: string;
  guestName: string;
  onSave: (position: number, p: GuestPerson) => Promise<string | null>;
  onDelete: (position: number) => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState(start);
  const stored = (i: number) => persons.find((p) => p.position === i)?.person;
  const [draft, setDraft] = useState<GuestPerson>(() => stored(start) ?? emptyPerson(start === 0 ? guestName : ""));
  const [error, setError] = useState<{ text: string; field: keyof GuestPerson | null } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function go(i: number) {
    setPos(i);
    setError(null);
    setDraft(stored(i) ?? emptyPerson(i === 0 ? guestName : ""));
  }

  async function submit() {
    const v = validatePerson(draft, arrival);
    if ("error" in v) return setError({ text: v.error, field: v.field });
    setSaving(true);
    const err = await onSave(pos, v.person);
    setSaving(false);
    if (err) return setError({ text: err, field: null });
    const next = slots.find((s) => s.position > pos && !stored(s.position));
    if (next) go(next.position);
    else onClose();
  }

  const slot = slots.find((s) => s.position === pos)!;
  const isStored = !!stored(pos);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Osoba ${pos + 1}`}
        className="rise flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold">
              Osoba {pos + 1} z {slots.length}
            </h2>
            <p className="text-sm text-soft">Kategorie z rezervace: {slot.label}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden gap-1 sm:flex">
              {slots.map((s) => (
                <button
                  key={s.position}
                  type="button"
                  aria-label={`Osoba ${s.position + 1}`}
                  onClick={() => go(s.position)}
                  className={`h-1.5 w-7 rounded-full ${s.position === pos ? "bg-pine" : stored(s.position) ? "bg-pine/40" : "bg-line"}`}
                />
              ))}
            </div>
            <button type="button" onClick={onClose} aria-label="Zavřít" className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-xl text-soft hover:bg-bg hover:text-ink">
              ×
            </button>
          </div>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-5">
          <GuestPersonFields value={draft} onChange={setDraft} arrival={arrival} errorField={error?.field} owner />
          {error && (
            <p className="mt-4 text-sm text-coral" role="alert">
              {error.text}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          {isStored ? (
            <button
              type="button"
              className="text-sm font-medium text-coral hover:underline"
              onClick={() => {
                onDelete(pos);
                onClose();
              }}
            >
              Smazat osobu
            </button>
          ) : pos > 0 ? (
            <button type="button" className="text-sm font-medium text-soft hover:text-ink" onClick={() => go(pos - 1)}>
              ← Osoba {pos}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
            {slots.some((s) => s.position > pos && !stored(s.position)) ? "Uložit a další →" : "Uložit"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
