"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { plural } from "@/lib/pricing";
import { todayISO, addDays } from "@/lib/stay";

// Přehled: upozornění, že je potřeba nahlásit cizince policii (Ubyport) —
// jen když lhůta končí dnes, zítra nebo už uplynula.
export function UbyportAlert({ slug }: { slug: string | null }) {
  const [data, setData] = useState<{ count: number; deadline: string | null } | null>(null);
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/sites/${slug}/guestbook/pending`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, [slug]);
  if (!data?.count || !data.deadline || data.deadline > addDays(todayISO(), 1)) return null;
  const today = todayISO();
  const when = data.deadline < today ? "lhůta už uplynula" : data.deadline === today ? "dnes je poslední den" : "zítra je poslední den";
  return (
    <Link
      href="/admin/rezervace/kniha"
      className="flex items-center gap-3 rounded-2xl border border-coral/30 bg-coral/[0.06] px-4 py-3 text-sm transition hover:border-coral/50"
    >
      <Icon name="alert" size={18} className="shrink-0 text-coral" />
      <span className="min-w-0 flex-1">
        <strong>
          {data.count} {plural(data.count, "cizinec čeká", "cizinci čekají", "cizinců čeká")} na nahlášení policii
        </strong>{" "}
        <span className="text-soft">— {when}.</span>
      </span>
      <span className="shrink-0 font-semibold text-pine">Nahlásit →</span>
    </Link>
  );
}
