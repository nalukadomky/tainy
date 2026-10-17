"use client";

import { useEffect } from "react";
import Link from "next/link";
import { czk, plural } from "@/lib/pricing";
import { isOpen, type TodoItem } from "@/lib/todos";
import { fetchJson, SECTION_URL, useCachedJson } from "@/lib/section-cache";

// Přehled → „K vyřízení“: všechno, co čeká na majitele, v jednom seznamu seřazeném
// podle naléhavosti (červená → oranžová → šedá). Data úkolů a poukazů sdílí se
// sekcemi (stejná mezipaměť, menu je přednačítá). Bez položek: „Vše vyřízeno“.

type Tone = "urgent" | "warn" | "calm";
type Item = { key: string; tone: Tone; title: string; meta?: string; href: string };

const DOT: Record<Tone, string> = { urgent: "bg-coral", warn: "bg-amber", calm: "bg-line" };
const BG: Record<Tone, string> = { urgent: "bg-coral/[0.07] hover:bg-coral/10", warn: "bg-amber/10 hover:bg-amber/15", calm: "bg-bg hover:bg-line/40" };
const RANK: Record<Tone, number> = { urgent: 0, warn: 1, calm: 2 };

type GiftOrder = { status: string; price: number; buyerName: string };

export function ActionInbox({
  slug,
  pending,
  missing,
}: {
  slug: string;
  /** Nezaplacené rezervace (počet, součet, kolik po lhůtě, jméno první). */
  pending: { count: number; total: number; overdue: number; first?: string };
  /** Chybějící údaje webu (provozovatel, podmínky, účet). */
  missing: string[];
}) {
  const todosUrl = SECTION_URL.todos(slug);
  const giftsUrl = SECTION_URL.gifts(slug);
  const [todos, setTodos] = useCachedJson<{ todos: TodoItem[] }>(todosUrl);
  const [gifts, setGifts] = useCachedJson<{ orders: GiftOrder[] }>(giftsUrl);
  useEffect(() => {
    fetchJson<{ todos: TodoItem[] }>(todosUrl).then((d) => d && setTodos(d));
    fetchJson<{ orders: GiftOrder[] }>(giftsUrl).then((d) => d && setGifts(d));
  }, [todosUrl, giftsUrl, setTodos, setGifts]);

  const open = (todos?.todos ?? []).filter(isOpen);
  const urgent = open.filter((t) => t.urgent);
  const mine = open.filter((t) => !t.cleanerId && !t.urgent);
  const giftPending = (gifts?.orders ?? []).filter((o) => o.status === "pending");

  const items: Item[] = [];
  if (urgent.length)
    items.push({
      key: "urgent",
      tone: "urgent",
      title: `${urgent.length} ${plural(urgent.length, "urgentní úkol", "urgentní úkoly", "urgentních úkolů")}`,
      meta: urgent[urgent.length - 1].title,
      href: "/admin/ukoly",
    });
  if (pending.count)
    items.push({
      key: "pending",
      tone: pending.overdue ? "urgent" : "warn",
      title: `${pending.count} ${plural(pending.count, "rezervace", "rezervace", "rezervací")} k zaplacení`,
      meta: `${czk(pending.total)}${pending.overdue ? ` · ${pending.overdue} po lhůtě` : pending.first ? ` · ${pending.first}` : ""}`,
      href: "/admin/rezervace?stav=pending",
    });
  if (giftPending.length)
    items.push({
      key: "gifts",
      tone: "warn",
      title: `${giftPending.length} ${plural(giftPending.length, "poukaz", "poukazy", "poukazů")} k zaplacení`,
      meta: `${czk(giftPending.reduce((s, o) => s + o.price, 0))} · ${giftPending[giftPending.length - 1].buyerName}`,
      href: "/admin/vouchery/poukazy",
    });
  if (missing.length)
    items.push({
      key: "missing",
      tone: "warn",
      title: "Doplň údaje pro rezervace",
      meta: `Chybí ${missing.length > 1 ? `${missing.slice(0, -1).join(", ")} a ${missing.at(-1)}` : missing[0]}`,
      href: "/admin/nastaveni?sekce=pravni",
    });
  if (mine.length)
    items.push({
      key: "todos",
      tone: "calm",
      title: `${mine.length} ${plural(mine.length, "úkol", "úkoly", "úkolů")} pro tebe`,
      meta: mine[mine.length - 1].title,
      href: "/admin/ukoly",
    });
  items.sort((a, b) => RANK[a.tone] - RANK[b.tone]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 px-1 text-[15px] font-semibold">
        K vyřízení
        {items.length > 0 && (
          <span className="min-w-[20px] rounded-full bg-amber px-1.5 text-center text-xs leading-5 tabular-nums">{items.length}</span>
        )}
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 px-1 text-sm text-soft">Vše vyřízeno — nic na tebe nečeká.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.key}>
              <Link href={it.href} className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition ${BG[it.tone]}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[it.tone]}`} aria-hidden />
                <span className="min-w-0 text-sm">
                  <span className="block font-semibold">{it.title}</span>
                  {it.meta && <span className="block truncate text-[13px] text-soft">{it.meta}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
