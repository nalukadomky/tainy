"use client";

import { useEffect, useState } from "react";
import { DayPicker, type BookedRange } from "@/components/DayPicker";
import { fmtDate, type Reservation } from "@/lib/admin";
import { czk, plural } from "@/lib/pricing";
import { nightsOf } from "@/lib/stay";
import { Skeleton } from "@/components/Skeleton";

// Změna termínu rezervace: výběr v kalendáři (obsazenost bez této rezervace),
// náhled nové ceny podle ceníku a volba, jestli ji použít.

type Preview = {
  free: boolean;
  nights: number;
  belowMinNights: boolean;
  minNights: number;
  newTotal: number;
  oldTotal: number;
  discount: number;
  voucherWarning: string | null;
};

const iso = (s: string) => s.slice(0, 10);

export function RescheduleDialog({
  reservation: r,
  onClose,
  onSaved,
}: {
  reservation: Reservation;
  onClose: () => void;
  onSaved: (updated: Reservation) => void;
}) {
  const [blocked, setBlocked] = useState<BookedRange[] | null>(null);
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [price, setPrice] = useState<"new" | "keep">("new");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const oldStart = iso(r.startDate);
  const oldEnd = iso(r.endDate);
  const oldNights = nightsOf(oldStart, oldEnd);

  useEffect(() => {
    fetch(`/api/reservations/${r.id}/reschedule`)
      .then((res) => res.json())
      .then((d) => setBlocked(d.blocked ?? []))
      .catch(() => setError("Obsazenost se nepodařilo načíst."));
  }, [r.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Náhled ceny a volna pro vybraný termín
  useEffect(() => {
    setPreview(null);
    setError("");
    if (!range.start || !range.end) return;
    const ctrl = new AbortController();
    fetch(`/api/reservations/${r.id}/reschedule?start=${range.start}&end=${range.end}`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((d) => (d.error ? setError(d.error) : setPreview(d)))
      .catch(() => {});
    return () => ctrl.abort();
  }, [r.id, range.start, range.end]);

  const same = range.start === oldStart && range.end === oldEnd;
  const finalTotal = preview ? (price === "new" ? preview.newTotal : preview.oldTotal) : r.totalPrice;
  const diff = finalTotal - r.totalPrice;
  const paid = r.status === "paid";

  async function save() {
    if (!range.start || !range.end) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/reservations/${r.id}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: range.start, end: range.end, price, notify }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error || "Termín se nepodařilo změnit.");
    onSaved(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Změnit termín — ${r.guestName}`}
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5"
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

        <div className="pr-10">
          <p className="font-display text-xl font-semibold">Změnit termín</p>
          <p className="mt-0.5 text-sm text-soft">
            {r.guestName} · teď {fmtDate(r.startDate)} – {fmtDate(r.endDate)} ({oldNights}{" "}
            {plural(oldNights, "noc", "noci", "nocí")}, {czk(r.totalPrice)})
          </p>
        </div>

        <div className="mt-4">
          {blocked === null ? (
            <div role="status" aria-label="Načítám obsazenost" className="grid grid-cols-7 gap-1.5 py-2">
              {Array.from({ length: 35 }, (_, i) => (
                <Skeleton key={i} className="aspect-square w-full" />
              ))}
            </div>
          ) : (
            <DayPicker
              booked={blocked}
              start={range.start}
              end={range.end}
              onChange={setRange}
              initialMonth={oldStart}
            />
          )}
        </div>

        {range.start && range.end && (
          <div className="mt-4 space-y-3 rounded-2xl border border-line bg-bg/50 p-4 text-sm">
            <p>
              Nový termín:{" "}
              <strong>
                {fmtDate(range.start)} – {fmtDate(range.end)}
              </strong>
              {preview && (
                <span className="text-soft">
                  {" "}
                  · {preview.nights} {plural(preview.nights, "noc", "noci", "nocí")}
                </span>
              )}
            </p>

            {!preview && !error && <p className="text-soft">Počítám cenu…</p>}

            {preview && !preview.free && (
              <p className="font-medium text-coral">Termín se kryje s jinou rezervací nebo blokací.</p>
            )}

            {preview?.free && (
              <>
                {preview.belowMinNights && (
                  <p className="text-[#7a5208]">
                    Kratší než minimální pobyt ({preview.minNights} {plural(preview.minNights, "noc", "noci", "nocí")}) — jako
                    majitel ho uložit můžeš.
                  </p>
                )}
                {preview.voucherWarning && <p className="text-[#7a5208]">{preview.voucherWarning}</p>}
                {preview.discount > 0 && (
                  <p className="text-soft">
                    Cena podle ceníku už zahrnuje slevu z voucheru {r.voucherCode} (−{czk(preview.discount)}).
                  </p>
                )}
                {preview.newTotal !== preview.oldTotal ? (
                  <div className="space-y-1.5" role="radiogroup" aria-label="Cena">
                    <PriceOption checked={price === "new"} onClick={() => setPrice("new")}>
                      Použít cenu podle ceníku <strong>{czk(preview.newTotal)}</strong>
                    </PriceOption>
                    <PriceOption checked={price === "keep"} onClick={() => setPrice("keep")}>
                      Ponechat původní <strong>{czk(preview.oldTotal)}</strong>
                    </PriceOption>
                  </div>
                ) : (
                  <p className="text-soft">Cena zůstává {czk(preview.oldTotal)}.</p>
                )}
                {paid && diff !== 0 && (
                  <p className={diff > 0 ? "font-medium text-[#7a5208]" : "font-medium text-pine"}>
                    {diff > 0 ? `Host doplatí ${czk(diff)}.` : `Rozdíl k vrácení hostovi ${czk(-diff)}.`}
                  </p>
                )}
                <label className="flex cursor-pointer items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(e) => setNotify(e.target.checked)}
                    className="h-4 w-4 accent-[var(--pine)]"
                  />
                  Oznámit hostovi e-mailem
                </label>
              </>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm font-medium text-coral">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={saving || !preview?.free || same}
            onClick={save}
          >
            {saving ? "Ukládám…" : "Změnit termín"}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceOption({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
        checked ? "border-pine bg-surface" : "border-line hover:border-ink/30"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          checked ? "border-pine" : "border-line"
        }`}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-pine" />}
      </span>
      <span>{children}</span>
    </button>
  );
}
