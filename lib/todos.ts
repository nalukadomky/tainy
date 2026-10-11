// Úkoly (To-Do) majitele a personálu — sdílená logika administrace i stránky uklízečky.

export const TODO_CATEGORIES = [
  { key: "nakup", label: "Nákupy", icon: "cart" },
  { key: "oprava", label: "Opravy", icon: "wrench" },
  { key: "provoz", label: "Provoz", icon: "clipboard" },
] as const;

export type TodoCategory = (typeof TODO_CATEGORIES)[number]["key"];

export const cleanCategory = (v: unknown): TodoCategory =>
  TODO_CATEGORIES.some((c) => c.key === v) ? (v as TodoCategory) : "provoz";

export const cleanTitle = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 160) : "");

/** Úkol tak, jak ho dostane prohlížeč (majitel i uklízečka). */
export type TodoItem = {
  id: string;
  title: string;
  category: TodoCategory;
  /** Komu patří: null = majitel, jinak ID uklízečky. */
  cleanerId: string | null;
  cleanerName: string;
  createdBy: "owner" | "cleaner";
  /** ID uklízečky, která úkol přidala (u majitele null). */
  createdById: string | null;
  /** Jméno toho, kdo úkol přidal („Majitel“ / jméno uklízečky). */
  createdByName: string;
  /** „Hoří“ — priorita, řadí se nahoru. */
  urgent: boolean;
  done: boolean;
  doneAt: string | null;
  doneBy: string;
  /** Smazaný úkol v „karanténě“ — jde vrátit, nebo smazat natrvalo. */
  deletedAt: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  title: string;
  category: string;
  cleanerId: string | null;
  cleaner: { name: string } | null;
  createdBy: string;
  createdById: string | null;
  urgent: boolean;
  done: boolean;
  doneAt: Date | null;
  doneBy: string;
  deletedAt: Date | null;
  createdAt: Date;
};

/** Řádek z databáze → úkol pro prohlížeč (jména autorů podle seznamu personálu). */
export function toTodoItem(t: Row, names: Map<string, string>): TodoItem {
  return {
    id: t.id,
    title: t.title,
    category: cleanCategory(t.category),
    cleanerId: t.cleanerId,
    cleanerName: t.cleaner?.name ?? "",
    createdBy: t.createdBy === "cleaner" ? "cleaner" : "owner",
    createdById: t.createdById,
    createdByName: t.createdBy === "cleaner" ? (names.get(t.createdById ?? "") ?? "Personál") : "Majitel",
    urgent: t.urgent,
    done: t.done,
    doneAt: t.doneAt?.toISOString() ?? null,
    doneBy: t.doneBy,
    deletedAt: t.deletedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

/** Jak dlouho zůstává smazaný úkol v karanténě. */
export const TRASH_DAYS = 30;
export const trashSince = () => new Date(Date.now() - TRASH_DAYS * 86_400_000);

/** Otevřený úkol (ne hotový, ne v karanténě). */
export const isOpen = (t: Pick<TodoItem, "done" | "deletedAt">) => !t.done && !t.deletedAt;

/**
 * Smí uklízečka úkol smazat (do karantény / natrvalo) a vrátit z karantény?
 * Vlastní zápis vždy; úkol, který jí přidělil majitel, až když je hotový nebo už smazaný.
 */
export function cleanerCanRemove(
  t: { createdById: string | null; cleanerId: string | null; done: boolean; deletedAt: Date | string | null },
  me: string
) {
  return t.createdById === me || (t.cleanerId === me && (t.done || !!t.deletedAt));
}

export const TODO_INCLUDE = { cleaner: { select: { name: true } } } as const;
