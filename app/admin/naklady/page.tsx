"use client";

import { useMemo, useState } from "react";
import { useAdminData, fmtDate, type Cost } from "@/lib/admin";
import { czk } from "@/lib/pricing";
import { todayISO } from "@/lib/stay";
import { Dropdown } from "@/components/Dropdown";
import { REPEAT_LABEL, isActive, monthlyFixed, spentToDate, type Repeat } from "@/lib/costs";
import { ListPageSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

const CATEGORIES = ["provoz", "energie", "služby", "úklid", "údržba", "pojištění", "vybavení", "jiné"];

const PER: Record<Repeat, string> = { once: "", monthly: " / měsíc", yearly: " / rok" };

export default function CostsPage() {
  const { slug, reservations, costs, setCosts, loading, error } = useAdminData();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("provoz");
  const [repeat, setRepeat] = useState<Repeat>("once");
  const [date, setDate] = useState(todayISO());
  const toast = useToast();

  const totals = useMemo(() => {
    const revenue = reservations.filter((r) => r.status === "paid").reduce((s, r) => s + r.totalPrice, 0);
    const spent = spentToDate(costs);
    return { revenue, spent, balance: revenue - spent, fixed: monthlyFixed(costs) };
  }, [reservations, costs]);

  const recurring = costs.filter((c) => c.repeat !== "once");
  const running = recurring.filter((c) => isActive(c));
  const ended = recurring.filter((c) => !isActive(c));
  const oneOff = costs.filter((c) => c.repeat === "once");

  // Všechny úpravy se ukážou hned a ukládají se na pozadí; při chybě se vrátí a ozve toast.
  const sortCosts = (list: Cost[]) => [...list].sort((a, b) => b.date.localeCompare(a.date));

  async function addCost() {
    const tmpId = `tmp-${Date.now()}`;
    const draft: Cost = { id: tmpId, label: label.trim(), amount: Math.round(Number(amount)), category, repeat, date, endDate: null };
    setCosts((list) => sortCosts([draft, ...list]));
    setLabel("");
    setAmount("");
    const res = await fetch("/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: slug, label: draft.label, amount: draft.amount, category, repeat, date }),
    }).catch(() => null);
    if (!res?.ok) {
      setCosts((list) => list.filter((x) => x.id !== tmpId));
      return toast.show("Náklad se nepodařilo uložit, zkus to znovu.");
    }
    const created: Cost = await res.json();
    setCosts((list) => sortCosts(list.map((x) => (x.id === tmpId ? created : x))));
  }

  async function setEnd(c: Cost, endDate: string | null) {
    if (c.id.startsWith("tmp-")) return; // ještě se ukládá
    if (endDate && !confirm(`Ukončit „${c.label}"? Od zítřka se přestane započítávat, dosavadní platby zůstanou.`)) return;
    setCosts((list) => list.map((x) => (x.id === c.id ? { ...x, endDate } : x)));
    const res = await fetch(`/api/costs/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endDate }),
    }).catch(() => null);
    if (!res?.ok) {
      setCosts((list) => list.map((x) => (x.id === c.id ? c : x)));
      return toast.show("Změnu se nepodařilo uložit, zkus to znovu.");
    }
    const updated: Cost = await res.json();
    setCosts((list) => list.map((x) => (x.id === c.id ? updated : x)));
  }

  async function remove(c: Cost) {
    if (c.id.startsWith("tmp-")) return; // ještě se ukládá
    const warn =
      c.repeat === "once"
        ? `Smazat náklad „${c.label}"?`
        : `Smazat „${c.label}" i s celou historií plateb? Pokud ho jen už neplatíš, použij raději Ukončit.`;
    if (!confirm(warn)) return;
    setCosts((list) => list.filter((x) => x.id !== c.id));
    const res = await fetch(`/api/costs/${c.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setCosts((list) => sortCosts([...list, c]));
      toast.show("Náklad se nepodařilo smazat, zkus to znovu.");
    }
  }

  if (loading) return <ListPageSkeleton label="Načítám náklady" tiles />;
  if (error) return <p className="py-16 text-center text-soft">{error}</p>;

  return (
    <div className="space-y-5">
      {toast.node}
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

        <div className="mt-3 inline-flex rounded-xl border border-line bg-bg p-1" role="radiogroup" aria-label="Opakování">
          {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={repeat === r}
              onClick={() => setRepeat(r)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                repeat === r ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"
              }`}
            >
              {REPEAT_LABEL[r]}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
          <input
            className="control w-full"
            placeholder={repeat === "once" ? "např. Oprava kamen" : "např. Elektřina"}
            aria-label="Položka"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="relative">
            <input
              className="control w-full !pr-16"
              type="number"
              inputMode="numeric"
              placeholder="Částka"
              aria-label="Částka v Kč"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-soft">
              Kč{PER[repeat]}
            </span>
          </div>
          <Dropdown
            label="Kategorie"
            value={category}
            onChange={setCategory}
            items={CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))}
          />
          <label className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-soft">
              {repeat === "once" ? "Dne" : "Od"}
            </span>
            <input
              className="control w-full !pl-10"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button
            className="btn-primary h-10 !px-5 !py-0 text-sm"
            disabled={!label.trim() || !(Number(amount) > 0) || !date}
            onClick={addCost}
          >
            + Přidat
          </button>
        </div>
        {repeat !== "once" && (
          <p className="mt-2 text-xs text-soft">
            Zadáš jednou, započítá se {repeat === "monthly" ? "každý měsíc" : "každý rok"} ve stejný den, dokud ho
            neukončíš.
          </p>
        )}
      </div>

      {/* Pravidelné náklady */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">Pravidelné</h2>
          {totals.fixed > 0 && <p className="text-sm text-soft">celkem cca {czk(totals.fixed)} měsíčně</p>}
        </div>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {running.length === 0 && ended.length === 0 && (
            <p className="p-5 text-center text-sm text-soft">Žádné pravidelné náklady.</p>
          )}
          {[...running, ...ended].map((c) => {
            const active = isActive(c);
            return (
              <div key={c.id} className={`flex items-center justify-between gap-3 px-5 py-3.5 ${active ? "" : "opacity-55"}`}>
                <div className="min-w-0">
                  <p className="font-medium">{c.label}</p>
                  <p className="text-xs text-soft">
                    {REPEAT_LABEL[c.repeat]} od {fmtDate(c.date)}
                    {c.endDate && ` · ukončeno ${fmtDate(c.endDate)}`} · {c.category}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="text-right font-semibold text-coral">
                    − {czk(c.amount)}
                    <span className="text-xs font-normal text-soft">{PER[c.repeat]}</span>
                  </p>
                  {active ? (
                    <button onClick={() => setEnd(c, todayISO())} className="text-xs font-medium text-soft hover:text-ink">
                      Ukončit
                    </button>
                  ) : (
                    <button onClick={() => setEnd(c, null)} className="text-xs font-medium text-pine hover:underline">
                      Obnovit
                    </button>
                  )}
                  <DeleteButton label={c.label} onClick={() => remove(c)} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Jednorázové náklady */}
      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Jednorázové</h2>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {oneOff.length === 0 && <p className="p-5 text-center text-sm text-soft">Žádné jednorázové náklady.</p>}
          {oneOff.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="font-medium">{c.label}</p>
                <p className="text-xs text-soft">
                  {fmtDate(c.date)} · {c.category}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p className="font-semibold text-coral">− {czk(c.amount)}</p>
                <DeleteButton label={c.label} onClick={() => remove(c)} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-soft transition hover:text-coral"
      title="Smazat náklad"
      aria-label={`Smazat náklad ${label}`}
    >
      🗑
    </button>
  );
}
