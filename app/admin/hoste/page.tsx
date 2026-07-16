"use client";

import { useMemo } from "react";
import { useAdminData, fmtDate } from "@/lib/admin";
import { czk } from "@/lib/pricing";

export default function GuestsPage() {
  const { reservations, loading, error } = useAdminData();

  const guests = useMemo(() => {
    const map = new Map<
      string,
      { name: string; email: string; phone: string; stays: number; spent: number; lastStay: string }
    >();
    for (const r of reservations) {
      if (r.status === "cancelled") continue;
      const key = r.email.toLowerCase();
      const g = map.get(key) ?? {
        name: r.guestName,
        email: r.email,
        phone: r.phone,
        stays: 0,
        spent: 0,
        lastStay: r.startDate,
      };
      g.stays += 1;
      if (r.status === "paid") g.spent += r.totalPrice;
      if (new Date(r.startDate) > new Date(g.lastStay)) g.lastStay = r.startDate;
      if (r.phone) g.phone = r.phone;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.spent - a.spent);
  }, [reservations]);

  if (loading) return <p className="py-16 text-center text-soft">Načítám hosty…</p>;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Hosté</h1>
        <p className="mt-1 text-sm text-soft">
          Přehled všech, kdo u tebe byli nebo se chystají ({guests.length}).
        </p>
      </div>

      <div className="space-y-3">
        {guests.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-soft">
            Zatím žádní hosté — po první rezervaci se tady objeví.
          </p>
        )}
        {guests.map((g) => (
          <div key={g.email} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pine/10 font-display text-lg font-semibold text-pine">
              {g.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{g.name}</p>
              <p className="truncate text-sm text-soft">
                {g.email}
                {g.phone && ` · ${g.phone}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold">{czk(g.spent)}</p>
              <p className="text-xs text-soft">
                {g.stays}× pobyt · naposledy {fmtDate(g.lastStay)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
