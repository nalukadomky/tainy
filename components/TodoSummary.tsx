"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { plural } from "@/lib/pricing";
import { isOpen, type TodoItem } from "@/lib/todos";

// Karta v Přehledu: kolik úkolů je otevřených a kolik z nich je pro majitele
// (typicky co personál nahlásil). Bez otevřených úkolů se neukáže.
export function TodoSummary({ slug }: { slug: string | null }) {
  const [open, setOpen] = useState<TodoItem[] | null>(null);
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/todos?site=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOpen((d.todos as TodoItem[]).filter(isOpen)))
      .catch(() => {});
  }, [slug]);
  if (!open?.length) return null;
  const mine = open.filter((t) => !t.cleanerId);
  const fromStaff = mine.filter((t) => t.createdBy === "cleaner").length;
  return (
    <Link
      href="/admin/ukoly"
      className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-pine/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pine/10 text-pine">
        <Icon name="clipboard" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          {open.length} {plural(open.length, "otevřený úkol", "otevřené úkoly", "otevřených úkolů")}
        </span>
        <span className="block truncate text-sm text-soft">
          {open.some((t) => t.urgent) && (
            <span className="mr-1.5 font-semibold text-coral">{open.filter((t) => t.urgent).length} urgentní ·</span>
          )}
          {mine.length} pro tebe
          {fromStaff > 0 && ` · ${fromStaff} ${plural(fromStaff, "nahlásil", "nahlásili", "nahlásil")} personál`}
          {mine[0] && ` · např. „${mine[mine.length - 1].title}“`}
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium text-pine group-hover:underline">Zobrazit →</span>
    </Link>
  );
}
