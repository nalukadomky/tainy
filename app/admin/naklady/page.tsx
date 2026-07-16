"use client";

import { useMemo, useState } from "react";
import { useAdminData, fmtDate } from "@/lib/admin";
import { czk } from "@/lib/pricing";

const CATEGORIES = ["provoz", "energie", "služby", "údržba", "pojištění", "jiné"];

export default function CostsPage() {
  const { slug, reservations, costs, loading, error, reload } = useAdminData();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("provoz");
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const revenue = reservations
      .filter((r) => r.status === "paid")
      .reduce((s, r) => s + r.totalPrice, 0);
    const spent = costs.reduce((s, c) => s + c.amount, 0);
    return { revenue, spent, balance: revenue - spent };
  }, [reservations, costs]);

  async function addCost() {
    setSaving(true);
    await fetch("/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: slug, label, amount: Number(amount), category }),
    });
    setLabel("");
    setAmount("");
    await reload();
    setSaving(false);
  }

  async function remove(id: string) {
    await fetch(`/api/costs/${id}`, { method: "DELETE" });
    await reload();
  }

  if (loading) return <p className="py-16 text-center text-soft">Načítám náklady…</p>;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Náklady</h1>

      {/* Bilance */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tržby", value: czk(totals.revenue), cls: "" },
          { label: "Náklady", value: `− ${czk(totals.spent)}`, cls: "text-coral" },
          {
            label: "Čistý zisk",
            value: czk(totals.balance),
            cls: totals.balance >= 0 ? "text-pine" : "text-coral",
          },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-medium text-soft">{t.label}</p>
            <p className={`mt-1 font-display text-lg font-semibold sm:text-2xl ${t.cls}`}>{t.value}</p>
          </div>
        ))}
      </div>

      {/* Přidání nákladu */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold">Přidat náklad</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
          <input
            className="field"
            placeholder="např. Dřevo do kamen"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="field"
            type="number"
            inputMode="numeric"
            placeholder="Částka (Kč)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            className="btn-primary !py-3"
            disabled={saving || !label.trim() || !(Number(amount) > 0)}
            onClick={addCost}
          >
            + Přidat
          </button>
        </div>
      </div>

      {/* Seznam */}
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {costs.length === 0 && (
          <p className="p-6 text-center text-sm text-soft">Zatím žádné náklady.</p>
        )}
        {costs.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div>
              <p className="font-medium">{c.label}</p>
              <p className="text-xs text-soft">
                {fmtDate(c.date)} · <span className="rounded-full bg-line/60 px-2 py-0.5">{c.category}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="font-semibold text-coral">− {czk(c.amount)}</p>
              <button
                onClick={() => remove(c.id)}
                className="text-soft transition hover:text-coral"
                title="Smazat náklad"
                aria-label={`Smazat náklad ${c.label}`}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
