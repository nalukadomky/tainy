"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminData } from "@/lib/admin";
import { TodoBoard, type Assignee } from "@/components/TodoBoard";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { CardsPageSkeleton } from "@/components/Skeleton";
import { isOpen, type TodoCategory, type TodoItem } from "@/lib/todos";

// Úkoly (To-Do) majitele a personálu: Nákupy, Opravy, Provoz. Majitel spravuje
// všechno — přidá, přeřadí, odškrtne i smaže cokoli. Změny se ukážou hned,
// ukládají se na pozadí.

export default function TodosPage() {
  const { slug } = useAdminData();
  const [todos, setTodos] = useState<TodoItem[] | null>(null);
  const [cleaners, setCleaners] = useState<{ id: string; name: string }[]>([]);
  // Vidí personál úkoly, které si majitel zapsal sám pro sebe?
  const [staffSees, setStaffSees] = useState(true);
  const toast = useToast();
  const showToast = toast.show;
  const confirmDlg = useConfirm();

  const load = useCallback(async () => {
    if (!slug) return;
    const res = await fetch(`/api/todos?site=${encodeURIComponent(slug)}`).catch(() => null);
    if (!res?.ok) return showToast("Úkoly se nepodařilo načíst.");
    const data = await res.json();
    setTodos(data.todos);
    setCleaners(data.cleaners);
    setStaffSees(data.staffSeesOwnerTodos);
  }, [slug, showToast]);
  useEffect(() => {
    load();
  }, [load]);

  const replace = (id: string, next: TodoItem | null) =>
    setTodos((list) => (list ?? []).flatMap((t) => (t.id === id ? (next ? [next] : []) : [t])));

  /** Změna hned na obrazovce; při chybě se vrátí původní stav. */
  async function change(t: TodoItem, patch: Partial<TodoItem>, body: Record<string, unknown>) {
    replace(t.id, { ...t, ...patch });
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      replace(t.id, t);
      const data = await res?.json().catch(() => ({}));
      return toast.show(data?.error || "Změnu se nepodařilo uložit.");
    }
    replace(t.id, await res.json());
  }

  async function add(category: TodoCategory, title: string, cleanerId: string | null, urgent: boolean) {
    const tmp: TodoItem = {
      id: `tmp-${Date.now()}`,
      title,
      category,
      cleanerId,
      cleanerName: cleaners.find((c) => c.id === cleanerId)?.name ?? "",
      createdBy: "owner",
      createdById: null,
      createdByName: "Majitel",
      urgent,
      done: false,
      doneAt: null,
      doneBy: "",
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };
    setTodos((list) => [...(list ?? []), tmp]);
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: slug, title, category, cleanerId, urgent }),
    }).catch(() => null);
    if (!res?.ok) {
      replace(tmp.id, null);
      const data = await res?.json().catch(() => ({}));
      return toast.show(data?.error || "Úkol se nepodařilo přidat.");
    }
    replace(tmp.id, await res.json());
  }

  // Smazat: otevřený úkol do karantény (jde vrátit), hotový rovnou natrvalo
  async function remove(t: TodoItem) {
    if (t.id.startsWith("tmp-")) return;
    replace(t.id, t.done ? null : { ...t, deletedAt: new Date().toISOString() });
    const res = await fetch(`/api/todos/${t.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setTodos((l) => (l ?? []).some((x) => x.id === t.id) ? (l ?? []).map((x) => (x.id === t.id ? t : x)) : [...(l ?? []), t]);
      toast.show("Úkol se nepodařilo smazat.");
    }
  }

  // Smazat natrvalo vše z karantény sekce
  async function purgeAll(list: TodoItem[]) {
    const ok = await confirmDlg.ask({
      title: "Smazat natrvalo?",
      message: `${list.length} ${list.length === 1 ? "smazaný úkol" : "smazané úkoly"} už nepůjde vrátit.`,
      confirmLabel: "Smazat natrvalo",
    });
    if (!ok) return;
    for (const t of list) {
      replace(t.id, null);
      fetch(`/api/todos/${t.id}?final=1`, { method: "DELETE" })
        .then((r) => {
          if (!r.ok) throw new Error();
        })
        .catch(() => {
          setTodos((l) => [...(l ?? []), t]);
          toast.show("Některý úkol se nepodařilo smazat.");
        });
    }
  }

  async function clearDone(category: TodoCategory) {
    const done = (todos ?? []).filter((t) => t.category === category && t.done && !t.deletedAt);
    const ok = await confirmDlg.ask({
      title: "Smazat hotové úkoly?",
      message: `${done.length} ${done.length === 1 ? "hotový úkol se smaže" : "hotové úkoly se smažou"} natrvalo.`,
      confirmLabel: "Smazat",
    });
    if (ok) done.forEach(remove);
  }

  async function toggleStaffSees() {
    const next = !staffSees;
    setStaffSees(next);
    const res = await fetch(`/api/sites/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffSeesOwnerTodos: next }),
    }).catch(() => null);
    if (!res?.ok) {
      setStaffSees(!next);
      return toast.show("Nastavení se nepodařilo uložit.");
    }
    toast.show(next ? "Personál teď vidí i tvoje úkoly." : "Tvoje úkoly teď personál nevidí.", "success");
  }

  if (!todos) return <CardsPageSkeleton label="Načítám úkoly" />;

  const assignees: Assignee[] = [{ id: null, label: "Já" }, ...cleaners.map((c) => ({ id: c.id, label: c.name }))];
  const open = todos.filter(isOpen);
  const mine = open.filter((t) => !t.cleanerId).length;

  return (
    <div className="space-y-5">
      {toast.node}
      {confirmDlg.node}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Úkoly</h1>
          <p className="mt-1 text-sm text-soft">
            {open.length ? `${open.length} otevřených · ${mine} pro tebe.` : "Všechno je hotové."} Personál vidí své úkoly
            {staffSees ? " i tvoje" : ""} a může ti sem psát, co je potřeba.
          </p>
        </div>
        {cleaners.length > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-4 pr-2">
            <label htmlFor="staff-sees" className="cursor-pointer text-sm font-medium">
              Personál vidí moje úkoly
            </label>
            {/* Vysvětlivka v bublině (najetí myší, klávesnice i klepnutí na mobilu) */}
            <span className="group/help relative">
              <button
                type="button"
                aria-label="Co to znamená?"
                aria-describedby="staff-sees-help"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[11px] font-semibold text-soft transition hover:border-ink/30 hover:text-ink focus:border-ink/30 focus:text-ink"
              >
                ?
              </button>
              <span
                id="staff-sees-help"
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-64 rounded-xl bg-ink px-3 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition group-hover/help:opacity-100 group-focus-within/help:opacity-100"
              >
                Úkoly, které si zapíšeš „pro sebe“, uvidí i personál na svém odkazu. Úkoly, které ti nahlásil personál, vidí jejich autor
                vždy.
              </span>
            </span>
            <input id="staff-sees" type="checkbox" className="peer sr-only" checked={staffSees} onChange={toggleStaffSees} />
            <label
              htmlFor="staff-sees"
              aria-hidden
              className="relative ml-1 h-6 w-10 shrink-0 cursor-pointer rounded-full bg-line transition peer-checked:bg-pine after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
            />
          </div>
        )}
      </div>
      <TodoBoard
        todos={todos}
        assignees={assignees}
        can={() => ({ toggle: true, remove: true, urgent: true, assign: true, edit: true })}
        onEdit={(t, patch) => change(t, patch, patch)}
        onUrgent={(t) => change(t, { urgent: !t.urgent }, { urgent: !t.urgent })}
        forLabel={(t) => (t.cleanerId ? t.cleanerName || "Personál" : "Já")}
        onAdd={add}
        onToggle={(t) => change(t, { done: !t.done, doneBy: t.done ? "" : "Majitel" }, { done: !t.done })}
        onDelete={remove}
        onAssign={(t, cleanerId) =>
          change(t, { cleanerId, cleanerName: cleaners.find((c) => c.id === cleanerId)?.name ?? "" }, { cleanerId })
        }
        onClearDone={clearDone}
        onRestore={(t) => change(t, { deletedAt: null }, { restore: true })}
        onPurgeAll={purgeAll}
      />
    </div>
  );
}
