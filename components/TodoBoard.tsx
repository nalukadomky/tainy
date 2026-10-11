"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { TODO_CATEGORIES, TRASH_DAYS, isOpen, type TodoCategory, type TodoItem } from "@/lib/todos";

// Tabule úkolů (To-Do) ve třech sekcích — Nákupy, Opravy, Provoz. Stejná pro
// administraci i stránku uklízečky; co kdo smí, určuje `can` (server to hlídá znovu).

export type Assignee = { id: string | null; label: string };

export function TodoBoard({
  todos,
  assignees,
  defaultAssignee = null,
  can,
  forLabel,
  onAdd,
  onToggle,
  onUrgent,
  onDelete,
  onAssign,
  onClearDone,
  onRestore,
  onPurgeAll,
  onEdit,
  stacked = false,
}: {
  /** Upravit text / přesunout do jiné sekce (okno úkolu). */
  onEdit?: (t: TodoItem, patch: { title?: string; category?: TodoCategory }) => void;
  /** Sekce vždy pod sebou (úzká stránka uklízečky). */
  stacked?: boolean;
  todos: TodoItem[];
  /** Komu jde úkol dát (majitel: Majitel + personál; uklízečka: já / majitel). */
  assignees: Assignee[];
  defaultAssignee?: string | null;
  can: (t: TodoItem) => { toggle: boolean; remove: boolean; urgent: boolean; assign: boolean; edit: boolean };
  /** Popisek „pro koho“ u úkolu (např. „pro tebe“, „pro Janu“). */
  forLabel: (t: TodoItem) => string;
  onAdd: (category: TodoCategory, title: string, assignee: string | null, urgent: boolean) => void;
  onToggle: (t: TodoItem) => void;
  /** Zapnout / vypnout „Hoří“. */
  onUrgent: (t: TodoItem) => void;
  onDelete: (t: TodoItem) => void;
  /** Jen majitel: přeřadit úkol. */
  onAssign?: (t: TodoItem, assignee: string | null) => void;
  /** Jen majitel: smazat hotové úkoly sekce. */
  onClearDone?: (category: TodoCategory) => void;
  /** Karanténa: vrátit smazaný úkol / smazat natrvalo. */
  onRestore: (t: TodoItem) => void;
  /** Smazat natrvalo všechny (smazatelné) úkoly z karantény sekce. */
  onPurgeAll: (list: TodoItem[]) => void;
}) {
  // Okno s akcemi úkolu — jen na mobilu (velké dotykové plochy)
  const [sheetId, setSheetId] = useState<string | null>(null);
  const sheetTodo = todos.find((t) => t.id === sheetId && !t.deletedAt) ?? null;
  return (
    <>
    {sheetTodo && (
      <TodoSheet
        t={sheetTodo}
        can={can(sheetTodo)}
        assignees={assignees}
        forLabel={forLabel}
        onClose={() => setSheetId(null)}
        onToggle={onToggle}
        onUrgent={onUrgent}
        onAssign={onAssign}
        onEdit={onEdit}
        onDelete={(t) => {
          setSheetId(null);
          onDelete(t);
        }}
      />
    )}
    <div className={`grid items-start gap-4 ${stacked ? "" : "lg:grid-cols-3"}`}>
      {TODO_CATEGORIES.map((cat) => (
        <Column
          key={cat.key}
          cat={cat}
          todos={todos.filter((t) => t.category === cat.key)}
          assignees={assignees}
          defaultAssignee={defaultAssignee}
          can={can}
          forLabel={forLabel}
          onAdd={onAdd}
          onToggle={onToggle}
          onUrgent={onUrgent}
          onDelete={onDelete}
          onAssign={onAssign}
          onClearDone={onClearDone}
          onRestore={onRestore}
          onPurgeAll={onPurgeAll}
          stacked={stacked}
          onOpen={(t) => setSheetId(t.id)}
        />
      ))}
    </div>
    </>
  );
}

function Column({
  cat,
  todos,
  assignees,
  defaultAssignee,
  can,
  forLabel,
  onAdd,
  onToggle,
  onUrgent,
  onDelete,
  onAssign,
  onClearDone,
  onRestore,
  onPurgeAll,
  stacked,
  onOpen,
}: {
  onOpen: (t: TodoItem) => void;
  onRestore: (t: TodoItem) => void;
  /** Smazat natrvalo všechny (smazatelné) úkoly z karantény sekce. */
  onPurgeAll: (list: TodoItem[]) => void;
  stacked: boolean;
  cat: (typeof TODO_CATEGORIES)[number];
  todos: TodoItem[];
  assignees: Assignee[];
  defaultAssignee: string | null;
  can: (t: TodoItem) => { toggle: boolean; remove: boolean; urgent: boolean; assign: boolean; edit: boolean };
  forLabel: (t: TodoItem) => string;
  onAdd: (category: TodoCategory, title: string, assignee: string | null, urgent: boolean) => void;
  onToggle: (t: TodoItem) => void;
  onUrgent: (t: TodoItem) => void;
  onDelete: (t: TodoItem) => void;
  onAssign?: (t: TodoItem, assignee: string | null) => void;
  onClearDone?: (category: TodoCategory) => void;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string | null>(defaultAssignee);
  const [showDone, setShowDone] = useState(false);
  const [urgent, setUrgent] = useState(false);
  // Hořící úkoly nahoře
  const [showTrash, setShowTrash] = useState(false);
  const open = todos.filter(isOpen).sort((a, b) => Number(b.urgent) - Number(a.urgent));
  const done = todos.filter((t) => t.done && !t.deletedAt).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  // Karanténa: smazané úkoly jdou vrátit, nebo smazat natrvalo
  const trash = todos.filter((t) => t.deletedAt).sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(cat.key, title.trim(), assignee, urgent);
    setTitle("");
    setUrgent(false);
  }

  const row = (t: TodoItem) => {
    const c = can(t);
    const badge = (
      <AssigneeBadge
        t={t}
        label={forLabel(t)}
        assignees={assignees}
        onAssign={onAssign && !t.done && c.assign ? (id) => onAssign(t, id) : undefined}
      />
    );
    return (
      <li
        key={t.id}
        className={`group flex items-start gap-3 py-2.5 ${t.urgent && !t.done ? "-mx-2 rounded-xl bg-coral/5 px-2 shadow-[inset_3px_0_0_var(--coral)]" : ""}`}
      >
        <button
          type="button"
          onClick={() => c.toggle && onToggle(t)}
          disabled={!c.toggle}
          aria-label={t.done ? `Vrátit úkol ${t.title}` : `Hotovo: ${t.title}`}
          title={c.toggle ? undefined : "Tenhle úkol odškrtne ten, komu patří"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition max-sm:h-7 max-sm:w-7 max-sm:-mt-0.5 ${
            t.done ? "border-pine bg-pine text-white" : "border-line hover:border-pine"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {t.done && (
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5 10 17 19 7.5" />
            </svg>
          )}
        </button>
        <div
          className="min-w-0 flex-1 max-sm:cursor-pointer"
          // Jen na mobilu: klepnutí na úkol otevře okno s akcemi (na počítači se ovládá přímo v řádku)
          onClick={(e) => {
            if (!window.matchMedia("(max-width: 639px)").matches) return;
            if ((e.target as HTMLElement).closest("button, [role=menu]")) return;
            onOpen(t);
          }}
        >
          {/* Název a akce v jednom řádku; štítky pod tím mají celou šířku (i pod tlačítky) */}
          <div className="flex items-start gap-1">
            <p className={`min-w-0 flex-1 break-words pt-0.5 text-sm ${t.done ? "text-soft line-through" : "text-ink"}`}>{t.title}</p>
            <span aria-hidden className="pt-0.5 text-lg leading-none text-soft/60 sm:hidden">›</span>
            {c.urgent && !t.done && (
              <button
                type="button"
                onClick={() => onUrgent(t)}
                aria-pressed={t.urgent}
                aria-label={t.urgent ? `Už není urgentní: ${t.title}` : `Urgentní: ${t.title}`}
                title={t.urgent ? "Už není urgentní" : "Označit jako urgentní"}
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:bg-bg max-sm:hidden ${
                  t.urgent ? "text-coral" : "text-soft/45 hover:text-coral"
                }`}
              >
                <Icon name="flame" size={14} />
              </button>
            )}
            {c.remove && (
              <button
                type="button"
                onClick={() => onDelete(t)}
                aria-label={`Smazat úkol ${t.title}`}
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-soft opacity-60 transition hover:bg-bg hover:text-coral group-hover:opacity-100 max-sm:hidden"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-soft">
            {t.urgent && !t.done && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-coral"
                style={{ background: "rgba(239, 91, 60, 0.14)" }}
              >
                <Icon name="flame" size={11} />
                Urgentní
              </span>
            )}
            {badge}
            {t.createdBy === "cleaner" && <span>· přidal(a) {t.createdByName}</span>}
            {t.done && t.doneBy && <span>· hotovo: {t.doneBy}</span>}
          </p>
        </div>
      </li>
    );
  };

  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface p-4" aria-label={cat.label}>
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Icon name={cat.icon} size={18} className="text-pine" />
        {cat.label}
        {open.length > 0 && (
          <span className="ml-auto rounded-full bg-bg px-2 py-0.5 font-sans text-xs font-semibold text-soft">{open.length}</span>
        )}
      </h2>

      <ul className="mt-1 divide-y divide-line">
        {open.length === 0 && <li className="py-3 text-sm text-soft">Nic tu není.</li>}
        {open.map(row)}
      </ul>

      {/* Rychlé přidání */}
      <form onSubmit={submit} className="mt-3 space-y-2 border-t border-line pt-3">
        <div className="flex gap-2">
          <input
            className="control min-w-0 flex-1"
            placeholder={cat.key === "nakup" ? "Např. prací prášek" : cat.key === "oprava" ? "Např. kape kohoutek" : "Např. objednat dřevo"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={`Nový úkol — ${cat.label}`}
            maxLength={160}
          />
          {/* Priorita k textu úkolu — vysvětlivka v bublině po najetí */}
          <span className="group/tip relative shrink-0">
            <button
              type="button"
              onClick={() => setUrgent((u) => !u)}
              aria-pressed={urgent}
              aria-label="Urgentní úkol"
              aria-describedby={`urgent-tip-${cat.key}`}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                urgent ? "border-coral bg-coral text-white" : "border-line bg-surface text-soft hover:border-coral/50 hover:text-coral"
              }`}
            >
              <Icon name="flame" size={17} />
            </button>
            <span
              id={`urgent-tip-${cat.key}`}
              role="tooltip"
              className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-48 rounded-xl bg-ink px-3 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
            >
              <strong className="font-semibold">Urgentní úkol</strong> — bude vždy nahoře a označený.
              {urgent ? " Kliknutím zrušíš." : " Kliknutím zapneš."}
            </span>
          </span>
          <button
            type="submit"
            disabled={!title.trim()}
            aria-label="Přidat úkol"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine text-white transition hover:bg-pine-dark disabled:opacity-40"
          >
            <Icon name="plus" size={18} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
        {assignees.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Pro koho">
            {assignees.map((a) => {
              const on = assignee === a.id;
              return (
                <button
                  key={a.id ?? "owner"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setAssignee(a.id)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                    on ? "border-ink bg-ink text-white" : "border-line text-soft hover:border-ink/30"
                  }`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
        </div>
      </form>

      {done.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setShowDone((s) => !s)} className="text-xs font-semibold text-soft hover:text-ink" aria-expanded={showDone}>
              Hotové ({done.length}) {showDone ? "▴" : "▾"}
            </button>
            {showDone && onClearDone && (
              <button type="button" onClick={() => onClearDone(cat.key)} className="text-xs font-medium text-soft hover:text-coral">
                Smazat hotové
              </button>
            )}
          </div>
          {showDone && <ul className="divide-y divide-line">{done.map(row)}</ul>}
        </div>
      )}

      {trash.length > 0 && (
        <div className="mt-2 border-t border-dashed border-line pt-2">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setShowTrash((v) => !v)} className="text-xs font-semibold text-soft hover:text-ink" aria-expanded={showTrash}>
              Smazané ({trash.length}) {showTrash ? "▴" : "▾"}
            </button>
            {showTrash && trash.some((t) => can(t).remove) && (
              <button
                type="button"
                onClick={() => onPurgeAll(trash.filter((t) => can(t).remove))}
                className="text-xs font-medium text-soft hover:text-coral"
              >
                Smazat vše
              </button>
            )}
          </div>
          {showTrash && (
            <>
              <ul className="divide-y divide-line">
                {trash.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 break-words text-sm text-soft line-through">{t.title}</span>
                    {can(t).remove && (
                      <button type="button" onClick={() => onRestore(t)} className="shrink-0 text-xs font-medium text-pine hover:underline">
                        Vrátit
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="pt-1 text-[11px] text-soft">Smazané úkoly se po {TRASH_DAYS} dnech odstraní samy.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// Barvy štítků „pro koho“: majitel vždy zelený, personál podle pořadí v seznamu
const OWNER_TONE = { bg: "#e6f0ea", fg: "#2c5e3f" };
const STAFF_TONES = [
  { bg: "#e6eef9", fg: "#2b5aa8" },
  { bg: "#f1e8f6", fg: "#6b3d8a" },
  { bg: "#fbefd9", fg: "#8a5a0b" },
  { bg: "#f8e5e5", fg: "#a33b3b" },
  { bg: "#e1f2ef", fg: "#1f6b62" },
];
function toneOf(id: string | null, assignees: Assignee[]) {
  if (!id) return OWNER_TONE;
  const staff = assignees.filter((a) => a.id);
  const i = Math.max(0, staff.findIndex((a) => a.id === id));
  return STAFF_TONES[i % STAFF_TONES.length];
}

/** Barevný štítek, komu úkol patří; kdo smí, na něj klikne a úkol přeřadí. */
function AssigneeBadge({
  t,
  label,
  assignees,
  onAssign,
  large = false,
}: {
  /** Větší štítek vpravo v řádku (nabídka se pak otevírá doleva). */
  large?: boolean;
  t: TodoItem;
  label: string;
  assignees: Assignee[];
  onAssign?: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const tone = toneOf(t.cleanerId, assignees);
  const cls = `inline-flex items-center gap-1 rounded-full font-semibold ${large ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[11px]"}`;
  if (!onAssign)
    return (
      <span className={cls} style={{ background: tone.bg, color: tone.fg }}>
        {label}
      </span>
    );
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Komu úkol patří: ${label}`}
        className={`${cls} transition hover:brightness-95 max-sm:pointer-events-none`}
        style={{ background: tone.bg, color: tone.fg }}
      >
        {label}
        <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden className="max-sm:hidden">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {open && (
        <span
          role="menu"
          className={`absolute top-full z-20 mt-1 w-44 rounded-xl border border-line bg-surface p-1 shadow-lg ${large ? "right-0" : "left-0"}`}
        >
          {assignees.map((a) => {
            const at = toneOf(a.id, assignees);
            const on = a.id === t.cleanerId;
            return (
              <button
                key={a.id ?? "owner"}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  if (!on) onAssign(a.id);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-bg ${on ? "font-semibold" : ""}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: at.fg }} aria-hidden />
                <span className="flex-1 truncate">{a.label}</span>
                {on && <span aria-hidden className="text-pine">✓</span>}
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}

/**
 * Okno s akcemi úkolu na mobilu (velké dotykové plochy). Na počítači se
 * neotevírá — tam je ovládání přímo v řádku. Ukazuje jen akce, které uživatel smí.
 */
function TodoSheet({
  t,
  can,
  assignees,
  forLabel,
  onClose,
  onToggle,
  onUrgent,
  onAssign,
  onEdit,
  onDelete,
}: {
  t: TodoItem;
  can: { toggle: boolean; remove: boolean; urgent: boolean; assign: boolean; edit: boolean };
  assignees: Assignee[];
  forLabel: (t: TodoItem) => string;
  onClose: () => void;
  onToggle: (t: TodoItem) => void;
  onUrgent: (t: TodoItem) => void;
  onAssign?: (t: TodoItem, assignee: string | null) => void;
  onEdit?: (t: TodoItem, patch: { title?: string; category?: TodoCategory }) => void;
  onDelete: (t: TodoItem) => void;
}) {
  const [title, setTitle] = useState(t.title);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== t.title) onEdit?.(t, { title: v });
    else setTitle(t.title);
  };
  const canEdit = can.edit && !!onEdit && !t.done;
  const canAssign = can.assign && !!onAssign && !t.done;
  if (!mounted) return null;

  const cat = TODO_CATEGORIES.find((c) => c.key === t.category)!;
  const tone = toneOf(t.cleanerId, assignees);
  const chip = (on: boolean, color?: { bg: string; fg: string }) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition ${
      on ? "ring-2 ring-offset-1 ring-offset-surface" : "text-soft hover:text-ink"
    } ${on && !color ? "bg-bg text-ink ring-ink/20" : ""}`;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Úkol ${t.title}`}
        className="rise max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface px-5 pb-7 pt-3 shadow-2xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Úchyt spodního okna */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-soft">
              <Icon name={cat.icon} size={13} />
              {cat.label}
            </p>
            {canEdit ? (
              <input
                className="mt-1 w-full rounded-lg border-0 bg-transparent px-0 py-1 font-display text-xl font-semibold text-ink outline-none transition focus:bg-bg focus:px-2"
                value={title}
                maxLength={160}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                aria-label="Text úkolu (klepni a přepiš)"
              />
            ) : (
              <h2 className={`mt-1 break-words font-display text-xl font-semibold ${t.done ? "text-soft line-through" : ""}`}>{t.title}</h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-soft hover:bg-bg hover:text-ink"
          >
            ×
          </button>
        </div>

        {/* Stejné štítky jako v seznamu */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-soft">
          {t.urgent && !t.done && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-coral"
              style={{ background: "rgba(239, 91, 60, 0.14)" }}
            >
              <Icon name="flame" size={11} />
              Urgentní
            </span>
          )}
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
            {forLabel(t)}
          </span>
          {t.createdBy === "cleaner" && <span>· přidal(a) {t.createdByName}</span>}
          {t.done && t.doneBy && <span>· hotovo: {t.doneBy}</span>}
        </div>

        {/* Nastavení úkolu jako seznam řádků */}
        {((can.urgent && !t.done) || canAssign || canEdit) && (
          <div className="mt-5 divide-y divide-line rounded-2xl border border-line">
            {can.urgent && !t.done && (
              <button
                type="button"
                role="switch"
                aria-checked={t.urgent}
                onClick={() => onUrgent(t)}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm"
              >
                <span className="flex items-center gap-2.5">
                  <Icon name="flame" size={17} className={t.urgent ? "text-coral" : "text-soft"} />
                  <span>
                    <span className="block font-medium">Urgentní</span>
                    <span className="block text-xs text-soft">Bude vždy nahoře</span>
                  </span>
                </span>
                <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${t.urgent ? "bg-coral" : "bg-line"}`} aria-hidden>
                  <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: t.urgent ? 18 : 2 }} />
                </span>
              </button>
            )}

            {canAssign && (
              <div className="px-4 py-3">
                <p className="mb-2 text-sm font-medium">Pro koho</p>
                <div className="flex flex-wrap gap-2">
                  {assignees.map((a) => {
                    const on = a.id === t.cleanerId;
                    const c = toneOf(a.id, assignees);
                    return (
                      <button
                        key={a.id ?? "owner"}
                        type="button"
                        onClick={() => !on && onAssign!(t, a.id)}
                        aria-pressed={on}
                        className={chip(on, c)}
                        style={on ? { background: c.bg, color: c.fg, ["--tw-ring-color" as string]: c.fg } : undefined}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.fg }} aria-hidden />
                        {a.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {canEdit && (
              <div className="px-4 py-3">
                <p className="mb-2 text-sm font-medium">Sekce</p>
                <div className="flex flex-wrap gap-2">
                  {TODO_CATEGORIES.map((c) => {
                    const on = c.key === t.category;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => !on && onEdit!(t, { category: c.key })}
                        aria-pressed={on}
                        className={chip(on)}
                      >
                        <Icon name={c.icon} size={15} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hlavní akce dole */}
        {(can.toggle || can.remove) && (
          <div className="mt-5 flex gap-2">
            {can.remove && (
              <button
                type="button"
                onClick={() => onDelete(t)}
                className={`btn-ghost !py-3 text-sm !text-coral ${can.toggle ? "" : "flex-1"}`}
                aria-label={t.done ? "Smazat natrvalo" : "Smazat úkol"}
              >
                <Icon name="trash" size={16} className="mr-1.5" />
                Smazat
              </button>
            )}
            {can.toggle && (
              <button
                type="button"
                onClick={() => {
                  onToggle(t);
                  if (!t.done) onClose();
                }}
                className={`flex-1 !py-3 text-sm ${t.done ? "btn-ghost" : "btn-primary"}`}
              >
                {t.done ? "Vrátit mezi otevřené" : "✓ Hotovo"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
