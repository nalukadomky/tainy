"use client";

import { useState } from "react";
import { useAdminData, fmtDate, STATUS_LABEL, STATUS_STYLE, type Reservation } from "@/lib/admin";
import { czk } from "@/lib/pricing";

type Filter = "all" | Reservation["status"];

export default function ReservationsPage() {
  const { reservations, loading, error, reload } = useAdminData();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: Reservation["status"]) {
    setBusy(id);
    await fetch(`/api/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await reload();
    setBusy(null);
  }

  const shown = reservations.filter((r) => filter === "all" || r.status === filter);

  if (loading) return <p className="py-16 text-center text-soft">Načítám rezervace…</p>;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Rezervace</h1>

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
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              filter === id
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface text-soft hover:border-ink/30"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-soft">
            Žádné rezervace v tomto filtru.
          </p>
        )}
        {shown.map((r) => (
          <div key={r.id} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold">{r.guestName}</p>
                <p className="mt-0.5 text-sm text-soft">
                  {fmtDate(r.startDate)} – {fmtDate(r.endDate)} · {r.guests}{" "}
                  {r.guests === 1 ? "host" : r.guests < 5 ? "hosté" : "hostů"}
                </p>
                <p className="mt-0.5 text-sm text-soft">
                  {r.email}
                  {r.phone && ` · ${r.phone}`}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-semibold">{czk(r.totalPrice)}</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
            </div>
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
    </div>
  );
}
