"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { prefetchSection } from "@/lib/section-cache";

/** Přepínač nahoře v sekci Rezervace: seznam rezervací | kniha ubytovaných. */
export function ReservationTabs({ active }: { active: "list" | "book" }) {
  const tab = (on: boolean) =>
    `flex items-center gap-1.5 rounded-full px-4 py-1.5 transition ${on ? "bg-pine text-white" : "text-soft hover:text-ink"}`;
  return (
    <nav aria-label="Rezervace" className="inline-flex rounded-full border border-line bg-surface p-1 text-sm font-semibold">
      <Link href="/admin/rezervace" className={tab(active === "list")} aria-current={active === "list" ? "page" : undefined}>
        Rezervace
      </Link>
      <Link href="/admin/rezervace/kniha" onPointerEnter={() => prefetchSection("/admin/rezervace/kniha")} onTouchStart={() => prefetchSection("/admin/rezervace/kniha")} className={tab(active === "book")} aria-current={active === "book" ? "page" : undefined}>
        <Icon name="clipboard" size={14} />
        Kniha ubytovaných
      </Link>
    </nav>
  );
}
