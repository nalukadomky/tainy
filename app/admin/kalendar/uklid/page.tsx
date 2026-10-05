"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAdminData, guestsLabel, type Reservation } from "@/lib/admin";
import { czk } from "@/lib/pricing";
import { todayISO } from "@/lib/stay";
import { Dropdown } from "@/components/Dropdown";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  CLEANER_FIELDS,
  PAY_LABEL,
  checklistFromTemplate,
  cleaningAmount,
  fmtMinutes,
  parseCleanerFields,
  type ChecklistItem,
  type PayMode,
} from "@/lib/cleaning";

// Úklidy po odjezdu hostů: přiřazení uklízečkám, úkoly, zaplacení (→ Náklady),
// správa uklízeček a jejich odkazů a nastavení, co uklízečky uvidí.

type Cleaner = {
  id: string;
  name: string;
  token: string;
  payMode: PayMode;
  rate: number;
  active: boolean;
  _count: { cleanings: number };
};

type Cleaning = {
  id: string;
  cleanerId: string | null;
  cleaner: { id: string; name: string; payMode: PayMode; rate: number } | null;
  checklist: ChecklistItem[];
  minutes: number | null;
  status: "todo" | "done";
  note: string;
  paid: boolean;
  amount: number | null;
};

/** Úklid po pobytu (`key` = ID rezervace) nebo ruční úklid (`key` = ID úklidu). */
type Item = {
  key: string;
  kind: "stay" | "manual";
  // úklid po pobytu
  guestName?: string;
  guests?: number;
  guestBreakdown?: string;
  // ruční úklid
  title?: string;
  createdBy?: "owner" | "cleaner";
  window: { date: string; from: string; nextArrival: { date: string; time: string } | null; sameDay: boolean };
  cleaning: Cleaning | null;
};

type Tab = "uklidy" | "uklizecky" | "nastaveni";
type Filter = "upcoming" | "unpaid" | "all";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("cs-CZ", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  });

const cleanerLink = (token: string) =>
  typeof window === "undefined" ? `/uklid/${token}` : `${window.location.origin}/uklid/${token}`;

export default function CleaningPage() {
  const { slug, site, setSite, loading, error } = useAdminData();
  const [tab, setTab] = useState<Tab>("uklidy");
  const [cleaners, setCleaners] = useState<Cleaner[] | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    if (!slug) return;
    const [c, i] = await Promise.all([
      fetch(`/api/cleaners?site=${slug}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/cleanings?site=${slug}`).then((r) => (r.ok ? r.json() : [])),
    ]);
    setCleaners(c);
    setItems(i);
  }, [slug]);

  // Načíst znovu i po návratu na stránku — uklízečka mezitím mohla úklid
  // dokončit, nebo se v jiném okně změnil seznam uklízeček.
  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Úprava úklidu: změna se ukáže hned (odhad podle toho, co server udělá),
  // ukládá se na pozadí a požadavky jdou jeden po druhém. Odpověď serveru se
  // propíše, až když u úklidu nečeká žádná další změna — jinak by starší
  // odpověď přepsala novější kliknutí. Při chybě se stav srovná se serverem.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef<Record<string, number>>({});
  const patchCleaning = useCallback(
    (key: string, body: Record<string, unknown>) => {
      setItems(
        (list) =>
          list?.map((it) =>
            it.key === key
              ? { ...it, cleaning: predict(it.cleaning, body, cleaners ?? [], site?.cleaningChecklist ?? "") }
              : it
          ) ?? list
      );
      pending.current[key] = (pending.current[key] ?? 0) + 1;

      const run = queue.current.then(async () => {
        try {
          const res = await fetch(`/api/cleanings/${key}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }).catch(() => null);
          const data = await res?.json().catch(() => ({}));
          if (!res?.ok) {
            load(); // stránka mohla mít zastaralá data
            throw new Error(data?.error || "Úklid se nepodařilo uložit.");
          }
          if (pending.current[key] === 1) {
            setItems((list) => list?.map((it) => (it.key === key ? { ...it, cleaning: data } : it)) ?? list);
          }
          return data as Cleaning;
        } finally {
          pending.current[key] -= 1;
        }
      });
      queue.current = run.catch(() => {});
      return run;
    },
    [load, cleaners, site?.cleaningChecklist]
  );

  // Ruční úklid: hned se ukáže v seznamu, po uložení se načte s dopočítaným oknem.
  const createManual = useCallback(
    async (body: { date: string; time: string; title: string; cleanerId: string }) => {
      if (!slug) return;
      const tmpKey = `tmp-${Date.now()}`;
      const cl = (cleaners ?? []).find((x) => x.id === body.cleanerId);
      setItems((list) => [
        ...(list ?? []),
        {
          key: tmpKey,
          kind: "manual" as const,
          title: body.title || "Úklid",
          createdBy: "owner" as const,
          window: { date: body.date, from: body.time, nextArrival: null, sameDay: false },
          cleaning: predict(null, { cleanerId: cl?.id ?? null }, cleaners ?? [], site?.cleaningChecklist ?? ""),
        } satisfies Item,
      ].sort((a, b) => `${a.window.date} ${a.window.from}`.localeCompare(`${b.window.date} ${b.window.from}`)));
      const res = await fetch("/api/cleanings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: slug, ...body, cleanerId: body.cleanerId || null }),
      }).catch(() => null);
      if (!res?.ok) {
        const data = await res?.json().catch(() => ({}));
        toast.show(data?.error || "Úklid se nepodařilo vytvořit.");
      }
      load();
    },
    [slug, cleaners, site?.cleaningChecklist, load, toast]
  );

  const deleteManual = useCallback(
    async (key: string) => {
      setItems((list) => list?.filter((it) => it.key !== key) ?? list);
      const res = await fetch(`/api/cleanings/${key}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) {
        const data = await res?.json().catch(() => ({}));
        toast.show(data?.error || "Úklid se nepodařilo smazat.");
        load();
      }
    },
    [load, toast]
  );

  if (loading || !site) return <p className="py-16 text-center text-soft">{error || "Načítám úklidy…"}</p>;

  const toPay = (items ?? []).filter((i) => i.cleaning?.status === "done" && !i.cleaning.paid).length;

  return (
    <div className="space-y-5">
      {toast.node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/kalendar" className="text-sm font-medium text-soft hover:text-ink">
            ← Kalendář
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Úklid</h1>
          <p className="mt-1 text-sm text-soft">
            Úklidy po odjezdu hostů. Každý člen personálu má svůj odkaz, kde vidí jen své úklidy — nikdy ceny pobytů.
          </p>
        </div>
      </div>

      <div className="flex rounded-2xl border border-line bg-bg p-1" role="tablist" aria-label="Části úklidu">
        {(
          [
            ["uklidy", "Úklidy", toPay ? `${toPay} k zaplacení` : "Přiřazení a průběh"],
            ["uklizecky", "Personál", cleaners ? `${cleaners.filter((c) => c.active).length} aktivní` : ""],
            ["nastaveni", "Nastavení", "Úkoly a co personál uvidí"],
          ] as const
        ).map(([t, label, hint]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-3 py-2.5 text-left transition sm:px-4 ${
              tab === t ? "bg-surface shadow-sm" : "hover:bg-surface/50"
            }`}
          >
            <span className={`block text-sm font-semibold ${tab === t ? "text-ink" : "text-soft"}`}>{label}</span>
            <span className="hidden text-xs text-soft sm:block">{hint}</span>
          </button>
        ))}
      </div>

      {tab === "uklidy" && (
        <Cleanings
          items={items}
          cleaners={cleaners ?? []}
          site={site}
          patch={patchCleaning}
          toast={toast.show}
          onNoCleaners={() => setTab("uklizecky")}
          onCreate={createManual}
          onDelete={deleteManual}
        />
      )}
      {tab === "uklizecky" && slug && (
        <Cleaners slug={slug} cleaners={cleaners} setCleaners={setCleaners} toast={toast.show} reload={load} />
      )}
      {tab === "nastaveni" && slug && (
        <Settings
          slug={slug}
          checklist={site.cleaningChecklist}
          fields={site.cleanerFields}
          onSaved={(patch) => setSite((s) => (s ? { ...s, ...patch } : s))}
          toast={toast.show}
        />
      )}
    </div>
  );
}

/** Odhad stavu úklidu po změně — ukáže se hned, server ho pak potvrdí. */
function predict(prev: Cleaning | null, body: Record<string, unknown>, cleaners: Cleaner[], template: string): Cleaning {
  const next: Cleaning = prev
    ? { ...prev, checklist: [...prev.checklist] }
    : {
        id: "tmp",
        cleanerId: null,
        cleaner: null,
        checklist: checklistFromTemplate(template),
        minutes: null,
        status: "todo",
        note: "",
        paid: false,
        amount: null,
      };
  if ("cleanerId" in body) {
    const cl = cleaners.find((x) => x.id === body.cleanerId);
    next.cleanerId = cl?.id ?? null;
    next.cleaner = cl ? { id: cl.id, name: cl.name, payMode: cl.payMode, rate: cl.rate } : null;
  }
  if (typeof body.addTask === "string" && body.addTask.trim()) {
    next.checklist.push({ id: `tmp-${Date.now()}`, label: body.addTask.trim(), done: false, extra: true });
  }
  if (typeof body.removeTask === "string") next.checklist = next.checklist.filter((i) => i.id !== body.removeTask);
  if (body.paid === true) {
    next.paid = true;
    next.amount = next.cleaner ? cleaningAmount(next.cleaner, next.minutes) : 0;
  }
  if (body.paid === false) {
    next.paid = false;
    next.amount = null;
  }
  if (body.reopen === true) next.status = "todo";
  return next;
}

/* ------------------------------ Úklidy ------------------------------ */

function Cleanings({
  items,
  cleaners,
  site,
  patch,
  toast,
  onNoCleaners,
  onCreate,
  onDelete,
}: {
  items: Item[] | null;
  cleaners: Cleaner[];
  site: NonNullable<ReturnType<typeof useAdminData>["site"]>;
  patch: (key: string, body: Record<string, unknown>) => Promise<Cleaning>;
  toast: (text: string, tone?: "error" | "success") => void;
  onNoCleaners: () => void;
  onCreate: (body: { date: string; time: string; title: string; cleanerId: string }) => void;
  onDelete: (key: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const today = todayISO();

  const shown = useMemo(() => {
    const list = items ?? [];
    if (filter === "upcoming") return list.filter((i) => i.window.date >= today);
    if (filter === "unpaid") return list.filter((i) => i.cleaning?.status === "done" && !i.cleaning.paid);
    return [...list].reverse();
  }, [items, filter, today]);

  if (!items) return <p className="py-10 text-center text-soft">Načítám úklidy…</p>;

  const active = cleaners.filter((c) => c.active);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Dropdown
          label="Které úklidy"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          items={[
            { value: "upcoming", label: "Nadcházející" },
            { value: "unpaid", label: "K zaplacení" },
            { value: "all", label: "Všechny" },
          ]}
        />
        <div className="flex items-center gap-3">
          {active.length === 0 && (
            <button type="button" onClick={onNoCleaners} className="text-sm font-medium text-pine hover:underline">
              Nejdřív přidej personál →
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className={adding ? "btn-ghost h-10 !px-4 !py-0 text-sm" : "btn-primary h-10 !px-4 !py-0 text-sm"}
          >
            {adding ? "Zrušit" : "+ Přidat úklid"}
          </button>
        </div>
      </div>

      {adding && (
        <AddCleaning
          cleaners={active}
          onSubmit={(body) => {
            onCreate(body);
            setAdding(false);
            toast("Úklid přidán.", "success");
          }}
        />
      )}

      {shown.length === 0 && (
        <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-soft">
          {filter === "unpaid" ? "Žádný hotový úklid nečeká na zaplacení." : "Žádné úklidy v tomhle výběru."}
        </p>
      )}

      {shown.map((it) => (
        <CleaningCard
          key={it.key}
          item={it}
          cleaners={cleaners}
          site={site}
          expanded={open === it.key}
          onToggle={() => setOpen((o) => (o === it.key ? null : it.key))}
          patch={patch}
          toast={toast}
          onDelete={() => onDelete(it.key)}
        />
      ))}
    </div>
  );
}

function CleaningCard({
  item,
  cleaners,
  site,
  expanded,
  onToggle,
  patch,
  toast,
  onDelete,
}: {
  item: Item;
  cleaners: Cleaner[];
  site: NonNullable<ReturnType<typeof useAdminData>["site"]>;
  expanded: boolean;
  onToggle: () => void;
  patch: (key: string, body: Record<string, unknown>) => Promise<Cleaning>;
  toast: (text: string, tone?: "error" | "success") => void;
  onDelete: () => void;
}) {
  const c = item.cleaning;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [task, setTask] = useState("");

  // Poznámka od uklízečky: „nová", dokud ji majitel neotevře (pamatuje si prohlížeč;
  // když uklízečka poznámku změní, je zase nová).
  const noteKey = c?.note ? `tainy.cleaning-note.${c.id}` : "";
  const [noteSeen, setNoteSeen] = useState(true);
  useEffect(() => {
    if (!noteKey) return;
    try {
      setNoteSeen(localStorage.getItem(noteKey) === c!.note);
    } catch {}
  }, [noteKey, c?.note]);
  useEffect(() => {
    if (!expanded || !noteKey) return;
    try {
      localStorage.setItem(noteKey, c!.note);
    } catch {}
    setNoteSeen(true);
  }, [expanded, noteKey, c?.note]);
  const done = c?.checklist.filter((i) => i.done).length ?? 0;
  const total = c?.checklist.length ?? 0;
  const estimate = c?.cleaner ? cleaningAmount(c.cleaner, c.minutes) : null;
  const guests =
    item.kind === "stay"
      ? guestsLabel({ guests: item.guests ?? 0, guestBreakdown: item.guestBreakdown ?? "" } as Reservation, site)
      : "";

  // Změna je vidět hned, uložení běží na pozadí; ozve se jen chyba.
  function run(body: Record<string, unknown>, ok?: string) {
    if (ok) toast(ok, "success");
    patch(item.key, body).catch((e) => toast(e instanceof Error ? e.message : "Úklid se nepodařilo uložit."));
  }

  const status = !c?.cleanerId
    ? { label: "Nepřiřazeno", cls: "bg-coral/10 text-coral" }
    : c.paid
      ? { label: "Zaplaceno", cls: "bg-pine/10 text-pine" }
      : c.status === "done"
        ? { label: `Hotovo · ${fmtMinutes(c.minutes)}`, cls: "bg-pine/10 text-pine" }
        : { label: "Čeká na úklid", cls: "bg-amber/15 text-[#92600a]" };

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold">
            {day(item.window.date)}
            {item.window.from && <span className="font-sans text-sm font-normal text-soft"> od {item.window.from}</span>}
            {item.window.sameDay && (
              <span className="ml-2 rounded-full bg-amber/20 px-2 py-0.5 align-middle font-sans text-[11px] font-semibold text-[#92600a]">
                Stejný den příjezd
              </span>
            )}
          </p>
          {item.kind === "stay" ? (
            <p className="mt-0.5 text-sm text-soft">
              Odjezd: {item.guestName} · {guests}
            </p>
          ) : (
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{item.title}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  item.createdBy === "cleaner" ? "bg-pine/10 text-pine" : "bg-bg text-soft"
                }`}
              >
                {item.createdBy === "cleaner" ? "Zapsal personál" : "Ruční úklid"}
              </span>
            </p>
          )}
          <p className="text-sm text-soft">
            {item.window.nextArrival
              ? `Další příjezd: ${day(item.window.nextArrival.date)} od ${item.window.nextArrival.time}`
              : "Další příjezd zatím není"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.cls}`}>{status.label}</span>
          {c?.note && (
            <button
              type="button"
              onClick={() => !expanded && onToggle()}
              title={c.note}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                noteSeen ? "bg-bg text-soft hover:text-ink" : "bg-amber text-white shadow-sm hover:bg-amber/90"
              }`}
            >
              {!noteSeen && (
                <span className="relative flex h-1.5 w-1.5" aria-hidden>
                  <span className="absolute inset-0 animate-ping rounded-full bg-white" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
                </span>
              )}
              💬 {noteSeen ? "Poznámka" : "Nová poznámka"}
            </button>
          )}
          {total > 0 && (
            <span className="text-xs text-soft">
              ✓ {done}/{total} úkolů
            </span>
          )}
          {c?.status === "done" && !c.paid && (
            <button
              type="button"
              onClick={() => run({ reopen: true }, "Personál teď může úklid upravit a znovu ukončit.")}
              className="text-xs font-medium text-pine hover:underline"
              title="Ukončený úklid už personál sám měnit nemůže"
            >
              Povolit úpravu
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <Dropdown
          label="Kdo uklízí"
          size="sm"
          value={c?.cleanerId ?? ""}
          onChange={(v) => run({ cleanerId: v || null })}
          items={[
            { value: "", label: "Nepřiřazeno" },
            ...cleaners
              .filter((cl) => cl.active || cl.id === c?.cleanerId)
              .map((cl) => ({ value: cl.id, label: cl.name })),
          ]}
        />
        {c?.cleaner && (
          <span className="text-sm text-soft">
            {c.paid ? (
              <>Zaplaceno {czk(c.amount ?? 0)}</>
            ) : c.cleaner.payMode === "flat" ? (
              <>{czk(c.cleaner.rate)} za úklid</>
            ) : c.minutes ? (
              <>
                ≈ {czk(estimate ?? 0)} <span className="text-soft/80">({czk(c.cleaner.rate)}/h)</span>
              </>
            ) : (
              <>{czk(c.cleaner.rate)}/h</>
            )}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {c?.cleanerId && (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium" title="Zaplacený úklid se zapíše do Nákladů">
              Zaplaceno
              <input
                type="checkbox"
                className="peer sr-only"
                checked={c.paid}
                onChange={() =>
                  run({ paid: !c.paid }, !c.paid ? "Zaplaceno — zapsáno do Nákladů." : "Platba zrušena, náklad odebrán.")
                }
              />
              <span className="relative h-6 w-10 rounded-full bg-line transition peer-checked:bg-pine after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
            </label>
          )}
          {item.kind === "manual" && !c?.paid && !item.key.startsWith("tmp-") && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm font-medium text-soft hover:text-coral">
              Smazat
            </button>
          )}
          <button type="button" onClick={onToggle} className="text-sm font-medium text-pine hover:underline" aria-expanded={expanded}>
            {expanded ? "Skrýt" : "Úkoly a detail"}
          </button>
          {confirmDelete && (
            <ConfirmDialog
              title="Smazat úklid?"
              confirmLabel="Smazat úklid"
              onConfirm={() => {
                setConfirmDelete(false);
                onDelete();
              }}
              onCancel={() => setConfirmDelete(false)}
            >
              <p>
                „{item.title}" {day(item.window.date)} zmizí z kalendáře
                {c?.cleaner ? ` — ${c.cleaner.name} ho už neuvidí` : ""}.
              </p>
            </ConfirmDialog>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          {c && c.checklist.length > 0 ? (
            <ul className="space-y-1.5">
              {c.checklist.map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] ${
                      t.done ? "border-pine bg-pine text-white" : "border-line"
                    }`}
                    aria-hidden
                  >
                    {t.done ? "✓" : ""}
                  </span>
                  <span className={t.done ? "text-soft line-through" : ""}>{t.label}</span>
                  {t.extra && <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold text-soft">navíc</span>}
                  {t.extra && !c.paid && !t.id.startsWith("tmp-") && (
                    <button
                      type="button"
                      onClick={() => run({ removeTask: t.id })}
                      className="ml-auto text-xs text-soft hover:text-coral"
                      aria-label={`Odebrat úkol ${t.label}`}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-soft">Zatím žádné úkoly. Výchozí úkoly nastavíš v Nastavení.</p>
          )}
          {!c?.paid && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!task.trim()) return;
                run({ addTask: task });
                setTask("");
              }}
            >
              <input
                className="control flex-1"
                placeholder="Úkol navíc jen k tomuhle úklidu…"
                value={task}
                onChange={(e) => setTask(e.target.value)}
              />
              <button type="submit" className="btn-ghost h-10 !px-4 !py-0 text-sm" disabled={!task.trim()}>
                Přidat
              </button>
            </form>
          )}
          {c?.note && (
            <p className="rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm">
              <span className="font-semibold">💬 {c.cleaner?.name ?? "Personál"} píše:</span> {c.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AddCleaning({
  cleaners,
  onSubmit,
}: {
  cleaners: Cleaner[];
  onSubmit: (body: { date: string; time: string; title: string; cleanerId: string }) => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("10:00");
  const [title, setTitle] = useState("");
  const [cleanerId, setCleanerId] = useState(cleaners[0]?.id ?? "");
  return (
    <form
      className="space-y-3 rounded-2xl border border-dashed border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!date) return;
        onSubmit({ date, time, title: title.trim() || "Úklid", cleanerId });
      }}
    >
      <p className="font-display text-lg font-semibold">Nový úklid mimo pobyty</p>
      <input
        className="control w-full"
        placeholder="Např. Generální úklid, příprava na sezónu…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className="control" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum úklidu" />
        <input type="time" className="control w-[6.75rem]" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Čas úklidu" />
        <Dropdown
          label="Kdo uklízí"
          size="sm"
          value={cleanerId}
          onChange={setCleanerId}
          items={[{ value: "", label: "Nepřiřazeno" }, ...cleaners.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <button type="submit" className="btn-primary ml-auto h-10 !px-5 !py-0 text-sm" disabled={!date}>
          Přidat úklid
        </button>
      </div>
    </form>
  );
}

/* ----------------------------- Uklízečky ---------------------------- */

function Cleaners({
  slug,
  cleaners,
  setCleaners,
  toast,
  reload,
}: {
  slug: string;
  cleaners: Cleaner[] | null;
  setCleaners: React.Dispatch<React.SetStateAction<Cleaner[] | null>>;
  toast: (text: string, tone?: "error" | "success") => void;
  reload: () => void;
}) {
  const [name, setName] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("hourly");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmLink, setConfirmLink] = useState<Cleaner | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/cleaners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: slug, name, payMode, rate: Number(rate) || 0 }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return toast(data.error || "Člena personálu se nepodařilo přidat.");
    setCleaners((list) => [...(list ?? []), data]);
    setName("");
    setRate("");
    toast(`${data.name} je v personálu — pošli odkaz.`, "success");
  }

  // Jméno, platba, sazba a aktivita se ukážou hned, uloží se na pozadí.
  // Nový odkaz musí vygenerovat server, ten se ukáže až po odpovědi.
  async function update(c: Cleaner, body: Record<string, unknown>, ok?: string) {
    const local: Partial<Cleaner> = {};
    if (typeof body.name === "string") local.name = body.name.trim();
    if (body.payMode === "hourly" || body.payMode === "flat") local.payMode = body.payMode;
    if (typeof body.rate === "number") local.rate = Math.max(0, Math.round(body.rate));
    if (typeof body.active === "boolean") local.active = body.active;
    setCleaners((list) => list?.map((x) => (x.id === c.id ? { ...x, ...local } : x)) ?? list);
    if (ok && !body.newLink) toast(ok, "success");

    const res = await fetch(`/api/cleaners/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      reload();
      return toast(res?.status === 404 ? "Tenhle člen personálu už neexistuje — seznam jsem obnovil." : data?.error || "Změnu se nepodařilo uložit.");
    }
    if (body.newLink) {
      setCleaners((list) => list?.map((x) => (x.id === c.id ? { ...x, token: data.token } : x)) ?? list);
      if (ok) toast(ok, "success");
    }
  }

  async function remove(c: Cleaner) {
    const res = await fetch(`/api/cleaners/${c.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      reload();
      return toast(res.status === 404 ? "Tenhle člen personálu už neexistuje — seznam jsem obnovil." : data.error || "Člena personálu se nepodařilo smazat.");
    }
    setCleaners((list) => list?.filter((x) => x.id !== c.id) ?? list);
    toast("Odebráno z personálu.", "success");
  }

  async function copy(c: Cleaner) {
    try {
      await navigator.clipboard.writeText(cleanerLink(c.token));
      toast(`Odkaz pro ${c.name} zkopírován.`, "success");
    } catch {
      toast("Odkaz se nepodařilo zkopírovat.");
    }
  }

  async function share(c: Cleaner) {
    const url = cleanerLink(c.token);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Kalendář úklidů", text: `Ahoj, tady je tvůj kalendář úklidů:`, url });
        return;
      } catch {}
    }
    copy(c);
  }

  if (!cleaners) return <p className="py-10 text-center text-soft">Načítám personál…</p>;

  return (
    <div className="space-y-4">
      {cleaners.map((c) => (
        <div key={c.id} className={`rounded-2xl border border-line bg-surface p-4 ${c.active ? "" : "opacity-70"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              className="control max-w-xs font-semibold"
              defaultValue={c.name}
              aria-label="Jméno"
              onBlur={(e) => e.target.value.trim() !== c.name && update(c, { name: e.target.value }, "Jméno uloženo.")}
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm" title={c.active ? "Deaktivovat" : "Aktivovat"}>
              {c.active ? "Aktivní" : "Neaktivní"}
              <input
                type="checkbox"
                className="peer sr-only"
                checked={c.active}
                onChange={() => update(c, { active: !c.active }, c.active ? "Odkaz vypnut." : "Odkaz zapnut.")}
              />
              <span className="relative h-6 w-10 rounded-full bg-line transition peer-checked:bg-pine after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-bg px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-soft">{cleanerLink(c.token)}</span>
            <button type="button" onClick={() => copy(c)} className="text-sm font-medium text-pine hover:underline">
              Kopírovat
            </button>
            <button type="button" onClick={() => share(c)} className="text-sm font-medium text-pine hover:underline">
              Poslat
            </button>
            <a href={`/uklid/${c.token}`} target="_blank" className="text-sm font-medium text-pine hover:underline">
              Otevřít ↗
            </a>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Dropdown
              label="Platba"
              size="sm"
              value={c.payMode}
              onChange={(v) => update(c, { payMode: v }, "Platba uložena.")}
              items={(Object.keys(PAY_LABEL) as PayMode[]).map((m) => ({ value: m, label: PAY_LABEL[m] }))}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="number"
                min={0}
                className="control w-28"
                defaultValue={c.rate}
                aria-label="Sazba"
                onBlur={(e) => Number(e.target.value) !== c.rate && update(c, { rate: Number(e.target.value) }, "Sazba uložena.")}
              />
              {c.payMode === "hourly" ? "Kč / hod" : "Kč / úklid"}
            </label>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <button type="button" onClick={() => setConfirmLink(c)} className="font-medium text-soft hover:text-ink">
                Nový odkaz
              </button>
              {c._count.cleanings === 0 && (
                <button type="button" onClick={() => remove(c)} className="font-medium text-soft hover:text-coral">
                  Smazat
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      <form onSubmit={add} className="space-y-3 rounded-2xl border border-dashed border-line bg-surface p-4">
        <p className="font-display text-lg font-semibold">Přidat do personálu</p>
        <div className="flex flex-wrap gap-2">
          <input className="control min-w-0 flex-1" placeholder="Jméno, např. Jana" value={name} onChange={(e) => setName(e.target.value)} />
          <Dropdown
            label="Platba"
            size="sm"
            value={payMode}
            onChange={(v) => setPayMode(v as PayMode)}
            items={(Object.keys(PAY_LABEL) as PayMode[]).map((m) => ({ value: m, label: PAY_LABEL[m] }))}
          />
          <input
            type="number"
            min={0}
            className="control w-32"
            placeholder={payMode === "hourly" ? "Kč / hod" : "Kč / úklid"}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <button type="submit" className="btn-primary h-10 !px-5 !py-0 text-sm" disabled={saving || !name.trim()}>
            {saving ? "Přidávám…" : "Přidat"}
          </button>
        </div>
        <p className="text-xs text-soft">Každý dostane vlastní odkaz. Přihlašovat se nemusí.</p>
      </form>

      {confirmLink && (
        <ConfirmDialog
          title="Vytvořit nový odkaz?"
          confirmLabel="Vytvořit nový"
          onConfirm={() => {
            update(confirmLink, { newLink: true }, "Nový odkaz vytvořen — pošli ho znovu.");
            setConfirmLink(null);
          }}
          onCancel={() => setConfirmLink(null)}
        >
          <p>
            Starý odkaz pro {confirmLink.name} přestane fungovat. Hodí se, když se dostal k někomu dalšímu. Nový odkaz pak
            musíš poslat znovu.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/* ----------------------------- Nastavení ---------------------------- */

function Settings({
  slug,
  checklist,
  fields,
  onSaved,
  toast,
}: {
  slug: string;
  checklist: string;
  fields: string;
  onSaved: (patch: { cleaningChecklist?: string; cleanerFields?: string }) => void;
  toast: (text: string, tone?: "error" | "success") => void;
}) {
  const [tasks, setTasks] = useState<string[]>(() => checklist.split("\n").filter((t) => t.trim()));
  const [draft, setDraft] = useState("");
  const [visible, setVisible] = useState(() => parseCleanerFields(fields));
  const timer = useRef<number | null>(null);

  async function save(patch: { cleaningChecklist?: string; cleanerFields?: string }, ok = "Uloženo.") {
    const res = await fetch(`/api/sites/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) return toast("Nastavení se nepodařilo uložit.");
    onSaved(patch);
    toast(ok, "success");
  }

  // Úkoly se ukládají chvíli po poslední změně
  function setAndSave(next: string[]) {
    setTasks(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save({ cleaningChecklist: next.join("\n") }, "Výchozí úkoly uloženy."), 600);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Výchozí úkoly</h2>
          <p className="text-sm text-soft">
            Zkopírují se do každého nového úklidu. K jednotlivému úklidu můžeš přidat úkol navíc.
          </p>
        </div>
        <ul className="space-y-2">
          {tasks.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 text-right text-xs text-soft">{i + 1}.</span>
              <input
                className="control flex-1"
                value={t}
                onChange={(e) => setAndSave(tasks.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <button
                type="button"
                onClick={() => setAndSave(tasks.filter((_, j) => j !== i))}
                className="flex h-9 w-9 items-center justify-center rounded-full text-soft hover:bg-line/50 hover:text-coral"
                aria-label={`Odebrat úkol ${t}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            setAndSave([...tasks, draft.trim()]);
            setDraft("");
          }}
        >
          <input
            className="control flex-1"
            placeholder="Např. Vyměnit povlečení, doplnit kávu…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn-ghost h-10 !px-4 !py-0 text-sm" disabled={!draft.trim()}>
            Přidat úkol
          </button>
        </form>
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Co personál uvidí</h2>
          <p className="text-sm text-soft">Termíny a časy příjezdů a odjezdů vidí vždy. O hostech jen to, co tu zaškrtneš.</p>
        </div>
        {CLEANER_FIELDS.map((f) => (
          <label key={f.key} className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--pine)]"
              checked={visible.includes(f.key)}
              onChange={(e) => {
                const next = e.target.checked ? [...visible, f.key] : visible.filter((k) => k !== f.key);
                setVisible(next);
                save({ cleanerFields: next.join(",") });
              }}
            />
            {f.label}
          </label>
        ))}
        <p className="rounded-xl bg-bg px-3 py-2 text-xs text-soft">🔒 Cenu pobytu ani e-mail hosta personál nikdy neuvidí.</p>
      </div>
    </div>
  );
}
