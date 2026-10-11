"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wordmark } from "@/components/Logo";
import { ConfirmDialog, useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { greetingName } from "@/lib/vocative";
import { cleaningAmount, cleaningStart, finishedEarly, fmtFinished, fmtMinutes, fmtStart, type ChecklistItem } from "@/lib/cleaning";
import { czk, plural } from "@/lib/pricing";
import { addDays, todayISO } from "@/lib/stay";
import { Skeleton, CardsSkeleton } from "@/components/Skeleton";
import { HATCH, Legend, StayCalendar, currentMonth, monthBounds, shortRange } from "@/components/StayCalendar";
import { createPortal } from "react-dom";
import { TodoBoard } from "@/components/TodoBoard";
import { cleanerCanRemove, isOpen, type TodoCategory, type TodoItem } from "@/lib/todos";
import { Icon } from "@/components/Icon";

// Kalendář úklidů uklízečky (tajný odkaz, bez přihlášení). Vidí jen své úklidy,
// termíny a časy, údaje o hostech, které majitel povolil, a svou odměnu — nikdy
// ceny pobytů. Ukončený úklid už nejde upravit; znovu ho může otevřít jen majitel.

type Cleaning = {
  id: string;
  /** stay = úklid po pobytu, manual = ruční úklid (zadal majitel nebo zapsala uklízečka) */
  kind: "stay" | "manual";
  /** Plánovaný začátek úklidu (ukončit jde i dřív — pak „uklizeno dřív“). */
  startsAt: string;
  finishedAt?: string | null;
  window: { date: string; from: string; nextArrival: { date: string; time: string } | null; sameDay: boolean };
  // úklid po pobytu
  arrival?: { date: string; time: string };
  departure?: { date: string; time: string };
  guest?: { guests?: string; name?: string; note?: string; phone?: string };
  // ruční úklid
  title?: string;
  ownCreated?: boolean;
  checklist: ChecklistItem[];
  minutes: number | null;
  status: "todo" | "done";
  note: string;
  paid: boolean;
  /** Vyplacená částka (jen u zaplaceného úklidu). */
  amount: number | null;
  /** Odměna za hotový úklid — dopočítaná podle sazby, u zaplaceného skutečná částka. */
  earned?: number | null;
};

type GuestInfo = { guests?: string; name?: string; note?: string; phone?: string };

/** Pobyt v kalendáři obsazenosti — jen termín, časy a údaje, které majitel povolil. */
type CalStay = {
  id: string;
  start: string;
  end: string;
  checkIn: string;
  checkOut: string;
  guest: GuestInfo;
  /** Úklid po pobytu, který má tahle uklízečka (jinak null). */
  cleaningId: string | null;
};

type Data = {
  cleaner: { name: string; payMode: string; rate: number };
  site: { name: string };
  cleanings: Cleaning[];
  calendar: { stays: CalStay[]; blocks: { id: string; start: string; end: string }[] };
  /** ID uklízečky (pro práva u úkolů). */
  me: string;
  todos: TodoItem[];
};

type Tab = "list" | "calendar" | "todos";
const TAB_KEY = "tainy.cleaner-tab";

const day = (iso: string, long = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("cs-CZ", {
    weekday: long ? "long" : "short",
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  });

export default function CleanerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // Úklidy / Kalendář — volbu si pamatuje prohlížeč
  const [tab, setTab] = useState<Tab>("list");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (saved === "calendar" || saved === "todos") setTab(saved);
    } catch {}
  }, []);
  function switchTab(t: Tab) {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
  }
  const toast = useToast();

  const load = useCallback(async () => {
    const res = await fetch(`/api/uklid/${token}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setMissing(true);
    setData(await res.json());
  }, [token]);

  useEffect(() => {
    load();
    // Majitel mezitím může přiřadit nový úklid nebo přidat úkol
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Změny se odesílají jedna po druhé (server je pomalejší než klikání) a hned
  // se ukážou. Odpověď serveru stav nepřepisuje — jinak by starší, pomalejší
  // odpověď vrátila už odškrtnutý úkol. Když něco selže, načteme stav znovu.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const patch = useCallback(
    (id: string, body: Record<string, unknown>, optimistic?: Partial<Cleaning>) => {
      if (optimistic) {
        setData((d) => d && { ...d, cleanings: d.cleanings.map((c) => (c.id === id ? { ...c, ...optimistic } : c)) });
      }
      const run = queue.current.then(async () => {
        const res = await fetch(`/api/uklid/${token}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => null);
        if (res?.ok) return true;
        const json = await res?.json().catch(() => ({}));
        toast.show(json?.error || "Nepodařilo se uložit, zkus to znovu.");
        await load();
        return false;
      });
      queue.current = run.catch(() => {});
      return run;
    },
    [token, toast, load]
  );

  // Smazání vlastního (ručního, neukončeného) úklidu — hned zmizí, při chybě se vrátí.
  const remove = useCallback(
    async (id: string) => {
      setData((d) => d && { ...d, cleanings: d.cleanings.filter((c) => c.id !== id) });
      const res = await fetch(`/api/uklid/${token}/${id}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) {
        const json = await res?.json().catch(() => ({}));
        toast.show(json?.error || "Úklid se nepodařilo smazat.");
        load();
      }
    },
    [token, toast, load]
  );

  const today = todayISO();
  const groups = useMemo(() => {
    const pay = data?.cleaner ?? { payMode: "hourly", rate: 0 };
    const list = (data?.cleanings ?? []).map((c) => ({
      ...c,
      earned: c.paid ? c.amount : c.status === "done" ? cleaningAmount(pay, c.minutes) : null,
    }));
    return {
      today: list.filter((c) => c.status === "todo" && c.window.date <= today),
      upcoming: list.filter((c) => c.status === "todo" && c.window.date > today),
      done: list.filter((c) => c.status === "done").reverse(),
    };
  }, [data, today]);

  if (missing) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl" aria-hidden>
          <Icon name="broom" size={40} className="text-soft" />
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold">Odkaz už neplatí</h1>
        <p className="mt-2 text-soft">Požádej majitele ubytování o nový odkaz na kalendář úklidů.</p>
      </main>
    );
  }
  if (!data)
    return (
      <main className="mx-auto min-h-dvh max-w-xl space-y-5 px-4 pt-6" role="status" aria-label="Načítám úklidy">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="mt-6 h-9 w-48" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-11 w-full rounded-full" />
        <CardsSkeleton count={3} />
      </main>
    );

  const todo = groups.today.length + groups.upcoming.length;
  const myOpenTodos = data.todos.filter((t) => isOpen(t) && t.cleanerId === data.me).length;
  const earnedTotal = groups.done.reduce((sum, c) => sum + (c.earned ?? 0), 0);

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-6">
      {toast.node}
      <header className="flex items-center justify-between">
        <Wordmark className="text-lg" />
        <span className="truncate rounded-full bg-line/60 px-3 py-1 text-xs font-semibold text-soft">{data.site.name}</span>
      </header>

      <h1 className="mt-7 font-display text-3xl font-semibold tracking-tight">Ahoj {greetingName(data.cleaner.name, "")}</h1>
      <p className="mt-1 text-soft">
        {todo
          ? `Máš ${todo} ${plural(todo, "úklid", "úklidy", "úklidů")} před sebou.`
          : "Teď nemáš žádný úklid. Až ti majitel nějaký přiřadí, objeví se tady."}
      </p>

      {/* Přepínač: seznam úklidů / kalendář obsazenosti */}
      <div className="mt-5 flex rounded-xl bg-line/50 p-1" role="tablist" aria-label="Zobrazení">
        {(
          [
            ["list", "Úklidy", "broom"],
            ["calendar", "Kalendář", "calendar"],
            ["todos", "Úkoly", "clipboard"],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => switchTab(id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === id ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"
            }`}
          >
            <Icon name={icon} className="mr-1.5 max-[380px]:hidden" />
            {label}
            {id === "todos" && myOpenTodos > 0 && (
              <span className="ml-1.5 rounded-full bg-amber px-1.5 text-[11px] font-bold text-white">{myOpenTodos}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "todos" ? (
        <CleanerTodos token={token} data={data} setData={setData} toast={toast.show} />
      ) : tab === "calendar" ? (
        <CleanerCalendar
          data={data}
          onOpenCleaning={(id) => {
            switchTab("list");
            setOpen(id);
            window.setTimeout(() => document.getElementById(`uklid-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
          }}
        />
      ) : (
      <>
      <AddOwn
        token={token}
        onAdded={load}
        toast={toast.show}
        addLocal={(c) => setData((d) => d && { ...d, cleanings: [...d.cleanings, c] })}
        removeLocal={(id) => setData((d) => d && { ...d, cleanings: d.cleanings.filter((c) => c.id !== id) })}
      />

      <Section title="Dnes a po termínu" items={groups.today} open={open} setOpen={setOpen} patch={patch} remove={remove} highlight />
      <Section title="Nadcházející" items={groups.upcoming} open={open} setOpen={setOpen} patch={patch} remove={remove} />
      <Section
        title="Hotové"
        aside={earnedTotal > 0 ? `Vyděláno ${czk(earnedTotal)}` : undefined}
        items={groups.done}
        open={open}
        setOpen={setOpen}
        patch={patch}
        remove={remove}
      />
      </>
      )}
    </main>
  );
}

function Section({
  title,
  aside,
  items,
  open,
  setOpen,
  patch,
  remove,
  highlight = false,
}: {
  title: string;
  aside?: string;
  items: Cleaning[];
  open: string | null;
  setOpen: (id: string | null) => void;
  patch: (id: string, body: Record<string, unknown>, optimistic?: Partial<Cleaning>) => Promise<unknown>;
  remove: (id: string) => void;
  highlight?: boolean;
}) {
  if (!items.length) return null;
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-soft">{title}</h2>
        {aside && <span className="text-sm font-semibold text-pine">{aside}</span>}
      </div>
      <div className="space-y-3">
        {items.map((c) => (
          <Card
            key={c.id}
            c={c}
            open={open === c.id}
            onToggle={() => setOpen(open === c.id ? null : c.id)}
            patch={patch}
            remove={remove}
            highlight={highlight}
          />
        ))}
      </div>
    </section>
  );
}

function Card({
  c,
  open,
  onToggle,
  patch,
  remove,
  highlight,
}: {
  c: Cleaning;
  open: boolean;
  onToggle: () => void;
  patch: (id: string, body: Record<string, unknown>, optimistic?: Partial<Cleaning>) => Promise<unknown>;
  remove: (id: string) => void;
  highlight: boolean;
}) {
  const done = c.checklist.filter((i) => i.done).length;
  const total = c.checklist.length;
  const locked = c.status === "done";

  return (
    <article
      id={`uklid-${c.id}`}
      className={`scroll-mt-4 overflow-hidden rounded-2xl border ${
        locked ? "border-pine/30 bg-[#eef5f0]" : highlight ? "border-pine/40 bg-surface shadow-sm" : "border-line bg-surface"
      }`}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold capitalize">{day(c.window.date, true)}</p>
            <p className="mt-0.5 text-sm text-soft">
              {c.kind === "manual"
                ? `${c.title}${c.window.from ? ` · od ${c.window.from}` : ""}`
                : `Úklid od ${c.window.from} — po odjezdu hostů`}
            </p>
            {c.ownCreated && (
              <span className="mt-1 inline-block rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold text-soft">Tvůj zápis</span>
            )}
          </div>
          {locked ? (
            <span className="shrink-0 rounded-full bg-pine px-2.5 py-1 text-[11px] font-semibold text-white">
              ✓ Hotovo
            </span>
          ) : c.window.sameDay ? (
            <span className="shrink-0 rounded-full bg-amber/20 px-2.5 py-1 text-[11px] font-semibold text-[#92600a]">
              Hosté přijedou týž den
            </span>
          ) : null}
        </div>

        {locked && c.finishedAt && finishedEarly(c.finishedAt, c.window.date, c.window.from) && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-amber/20 px-2.5 py-0.5 text-[11px] font-semibold text-[#92600a]">Uklizeno dřív</span>
            <span className="text-soft">dokončeno {fmtFinished(c.finishedAt)}</span>
          </p>
        )}
        {locked && (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm text-pine">
            <strong className="font-display text-lg font-semibold">{czk(c.earned ?? 0)}</strong>
            <span>
              za {fmtMinutes(c.minutes)} · {c.paid ? "zaplaceno" : "čeká na proplacení"}
            </span>
          </p>
        )}
        <p className="mt-2 text-sm">
          {c.window.nextArrival ? (
            <>
              Další hosté: <strong className="font-semibold">{day(c.window.nextArrival.date)} od {c.window.nextArrival.time}</strong>
            </>
          ) : (
            <span className="text-soft">Další hosté zatím nejsou objednaní.</span>
          )}
        </p>

        {total > 0 && !locked && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/60">
              <div className="h-full rounded-full bg-pine transition-all" style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <span className="text-xs font-medium text-soft">
              {done}/{total}
            </span>
          </div>
        )}
      </button>

      {open && <Detail c={c} patch={patch} remove={remove} />}
    </article>
  );
}

function Detail({
  c,
  patch,
  remove,
}: {
  c: Cleaning;
  patch: (id: string, body: Record<string, unknown>, optimistic?: Partial<Cleaning>) => Promise<unknown>;
  remove: (id: string) => void;
}) {
  // Před plánovaným začátkem jde úklid ukončit taky — jen na to upozorníme
  const early = new Date(c.startsAt).getTime() > Date.now();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locked = c.status === "done";
  const [hours, setHours] = useState(String(Math.floor((c.minutes ?? 0) / 60) || ""));
  const [mins, setMins] = useState(String((c.minutes ?? 0) % 60 || ""));
  const [note, setNote] = useState(c.note);
  const [confirm, setConfirm] = useState(false);
  const minutesTotal = (Number(hours) || 0) * 60 + (Number(mins) || 0);
  const timer = useRef<number | null>(null);

  // Čas se ukládá průběžně, ať se neztratí, když uklízečka stránku zavře.
  function saveTime(h: string, m: string) {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const total = (Number(h) || 0) * 60 + (Number(m) || 0);
      if (total !== (c.minutes ?? 0)) patch(c.id, { minutes: total }, { minutes: total });
    }, 600);
  }

  return (
    <div className="space-y-5 border-t border-line px-4 pb-5 pt-4">
      {/* Pobyt a hosté (jen u úklidu po pobytu) */}
      {c.kind === "manual" ? (
        <p className="text-sm">
          <span className="text-soft">Úklid:</span> <strong className="font-semibold">{c.title}</strong>
          {c.window.from ? `, ${day(c.window.date)} od ${c.window.from}` : `, ${day(c.window.date)}`}
        </p>
      ) : c.arrival && c.departure && c.guest ? (
      <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-soft">Příjezd hostů</dt>
        <dd>
          {day(c.arrival.date)} od {c.arrival.time}
        </dd>
        <dt className="text-soft">Odjezd hostů</dt>
        <dd>
          {day(c.departure.date)} do {c.departure.time}
        </dd>
        {c.guest.guests && (
          <>
            <dt className="text-soft">Hosté</dt>
            <dd>{c.guest.guests}</dd>
          </>
        )}
        {c.guest.name && (
          <>
            <dt className="text-soft">Jméno</dt>
            <dd>{c.guest.name}</dd>
          </>
        )}
        {c.guest.phone && (
          <>
            <dt className="text-soft">Telefon</dt>
            <dd>
              <a href={`tel:${c.guest.phone.replace(/\s/g, "")}`} className="text-pine underline">
                {c.guest.phone}
              </a>
            </dd>
          </>
        )}
      </dl>
      {c.guest.note && <p className="rounded-xl bg-bg px-3 py-2 text-sm"><Icon name="chat" className="mr-1.5 text-soft" />{c.guest.note}</p>}
      </>
      ) : null}

      {/* Úkoly */}
      {c.checklist.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">Co udělat</h3>
          <ul className="space-y-1.5">
            {c.checklist.map((t) => (
              <li key={t.id}>
                <label
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                    t.done ? "border-pine/30 bg-pine/5" : "border-line bg-surface"
                  } ${locked || c.paid ? "cursor-default" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={t.done}
                    disabled={locked}
                    onChange={() =>
                      patch(
                        c.id,
                        { toggle: t.id, done: !t.done },
                        { checklist: c.checklist.map((i) => (i.id === t.id ? { ...i, done: !t.done } : i)) }
                      )
                    }
                  />
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-sm text-white transition ${
                      t.done ? "border-pine bg-pine" : "border-line"
                    }`}
                    aria-hidden
                  >
                    {t.done ? "✓" : ""}
                  </span>
                  <span className={`text-[15px] ${t.done ? "text-soft line-through" : ""}`}>{t.label}</span>
                  {t.extra && (
                    <span className="ml-auto rounded-full bg-amber/20 px-2 py-0.5 text-[10px] font-semibold text-[#92600a]">navíc</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {locked ? (
        /* Ukončený úklid: jen shrnutí, upravit ho může povolit majitel */
        <div className="space-y-3">
          <div className="rounded-2xl bg-pine px-4 py-4 text-white">
            <p className="text-sm text-white/80">Úklid je hotový ✓</p>
            <p className="mt-1 font-display text-3xl font-semibold">{czk(c.earned ?? 0)}</p>
            <p className="mt-1 text-sm text-white/85">
              {fmtMinutes(c.minutes)} · {c.paid ? "zaplaceno" : "čeká na proplacení od majitele"}
            </p>
          </div>
          {c.note && (
            <p className="rounded-xl bg-surface px-3 py-2 text-sm">
              <span className="font-medium">Tvoje poznámka:</span> {c.note}
            </p>
          )}
          <p className="text-center text-xs text-soft">
            Uložený úklid už nejde měnit. Kdyby bylo potřeba něco opravit, domluv se s majitelem — úpravu ti může povolit.
          </p>
        </div>
      ) : (
        <>
      {/* Čas a poznámka */}
      <div>
        <h3 className="mb-2 font-semibold">Jak dlouho úklid trval</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={24}
            className="control w-20 text-center !text-lg"
            value={hours}
            disabled={locked}
            aria-label="Hodiny"
            onChange={(e) => {
              setHours(e.target.value);
              saveTime(e.target.value, mins);
            }}
          />
          <span className="text-soft">h</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            step={5}
            className="control w-20 text-center !text-lg"
            value={mins}
            disabled={locked}
            aria-label="Minuty"
            onChange={(e) => {
              setMins(e.target.value);
              saveTime(hours, e.target.value);
            }}
          />
          <span className="text-soft">min</span>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block font-semibold">Poznámka pro majitele</span>
        <textarea
          className="field min-h-20"
          placeholder="Např. došel prací prášek, rozbitá sklenička…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== c.note && patch(c.id, { note }, { note })}
        />
      </label>

      {early && (
        <p className="rounded-xl bg-bg px-3 py-2 text-sm text-soft">
          Úklid je naplánovaný na {fmtStart(c.window.date, c.window.from)}. Když ho ukončíš teď, uloží se jako uklizený dřív.
        </p>
      )}
      <button type="button" className="btn-primary w-full" disabled={minutesTotal <= 0} onClick={() => setConfirm(true)}>
        {minutesTotal > 0 ? (early ? "Ukončit úklid dřív" : "Ukončit úklid") : "Vyplň čas a ukonči úklid"}
      </button>
      {c.ownCreated && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="w-full text-center text-sm font-medium text-soft hover:text-coral"
        >
          Smazat tenhle úklid
        </button>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Smazat úklid?"
          confirmLabel="Smazat"
          onConfirm={() => {
            setConfirmDelete(false);
            remove(c.id);
          }}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>„{c.title}" zmizí z tvého kalendáře i z přehledu majitele.</p>
        </ConfirmDialog>
      )}

        </>
      )}

      {confirm && (
        <ConfirmDialog
          title="Ukončit úklid?"
          confirmLabel="Ukončit úklid"
          onConfirm={async () => {
            setConfirm(false);
            await patch(c.id, { minutes: minutesTotal, note, finish: true }, { status: "done", minutes: minutesTotal, note, finishedAt: new Date().toISOString() });
          }}
          onCancel={() => setConfirm(false)}
        >
          <p>
            Úklid {day(c.window.date)} trval <strong className="text-ink">{fmtMinutes(minutesTotal)}</strong>.
            {c.checklist.some((i) => !i.done) &&
              ` Pozor, ${c.checklist.filter((i) => !i.done).length} ${plural(
                c.checklist.filter((i) => !i.done).length,
                "úkol není odškrtnutý",
                "úkoly nejsou odškrtnuté",
                "úkolů není odškrtnutých"
              )}.`}
          </p>
          {early && <p>Úklid se uloží jako uklizený dřív, než byl naplánovaný.</p>}
          <p>Po uložení už úklid nepůjde upravit — případnou opravu ti může povolit jen majitel.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Uklízečka si zapíše vlastní úklid (třeba generální úklid nebo úklid navíc). */
function AddOwn({
  token,
  onAdded,
  toast,
  addLocal,
  removeLocal,
}: {
  token: string;
  onAdded: () => Promise<void> | void;
  toast: (text: string, tone?: "error" | "success") => void;
  addLocal: (c: Cleaning) => void;
  removeLocal: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [other, setOther] = useState(false);
  const dayChoice = other ? "other" : date === todayISO() ? "today" : date === addDays(todayISO(), 1) ? "tomorrow" : "other";

  // Zapsaný úklid se v seznamu ukáže hned; úkoly a další hosty doplní server.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    const tmpId = `tmp-${Date.now()}`;
    addLocal({
      id: tmpId,
      kind: "manual",
      title: title.trim(),
      ownCreated: true,
      startsAt: cleaningStart(date, time).toISOString(),
      window: { date, from: time, nextArrival: null, sameDay: false },
      checklist: [],
      minutes: null,
      status: "todo",
      note: "",
      paid: false,
      amount: null,
    });
    const body = { date, time, title };
    setTitle("");
    setTime("");
    setDate(todayISO());
    setOther(false);
    setOpen(false);
    toast("Úklid zapsaný — majitel ho uvidí v přehledu.", "success");
    const res = await fetch(`/api/uklid/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      const json = await res?.json().catch(() => ({}));
      removeLocal(tmpId);
      return toast(json?.error || "Úklid se nepodařilo zapsat.");
    }
    onAdded();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost mt-5 w-full !py-2.5 text-sm">
        + Zapsat úklid navíc
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-5 space-y-3 rounded-2xl border border-dashed border-line bg-surface p-4">
      <p className="font-semibold">Zapsat úklid navíc</p>
      <input
        className="field"
        placeholder="Co se uklízí, např. generální úklid"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      {/* Den: rychlá volba, vlastní datum až na požádání */}
      <div>
        <span className="mb-1.5 block text-sm font-medium">Kdy</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Den úklidu">
          {(
            [
              ["today", "Dnes"],
              ["tomorrow", "Zítra"],
              ["other", "Jiný den"],
            ] as const
          ).map(([id, label]) => {
            const on = dayChoice === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  if (id === "today") setDate(todayISO());
                  if (id === "tomorrow") setDate(addDays(todayISO(), 1));
                  if (id === "other" && dayChoice !== "other") setDate(addDays(todayISO(), 2));
                  setOther(id === "other");
                }}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  on ? "border-ink bg-ink text-white" : "border-line bg-surface text-soft hover:border-ink/30"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {dayChoice === "other" && (
          <label className="mt-2 flex items-center gap-3">
            <input
              type="date"
              className="control w-44"
              value={date}
              min={todayISO()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Datum úklidu"
            />
            <span className="text-sm capitalize text-soft">{day(date, true)}</span>
          </label>
        )}
      </div>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          Od kolika <span className="font-normal text-soft">(nepovinné)</span>
        </span>
        <input type="time" className="control w-28" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Čas začátku" />
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1 !py-2.5 text-sm" onClick={() => setOpen(false)}>
          Zrušit
        </button>
        <button type="submit" className="btn-primary flex-1 !py-2.5 text-sm" disabled={!title.trim() || !date}>
          Zapsat
        </button>
      </div>
    </form>
  );
}

/* --------------------------- Kalendář obsazenosti --------------------------- */

/**
 * Stejná mřížka jako Kalendář v administraci: pobyty jako pruhy (jméno hosta jen
 * když ho majitel povolil, jinak „Obsazeno“), blokace šrafovaně, 🧹 u dnů s jejím
 * úklidem. Klik na pobyt ukáže termín, časy a povolené údaje o hostech.
 */
function CleanerCalendar({ data, onOpenCleaning }: { data: Data; onOpenCleaning: (id: string) => void }) {
  const [cursor, setCursor] = useState(currentMonth);
  const [detail, setDetail] = useState<CalStay | null>(null);
  const { stays, blocks } = data.calendar;
  const { monthStart, monthEnd } = monthBounds(cursor);
  const label = (s: CalStay) => s.guest.name || "Obsazeno";

  // Dny, kdy má uklízečka úklid (hotový i nehotový)
  const marks = useMemo(() => {
    const m: Record<string, React.ReactNode> = {};
    for (const c of data.cleanings) m[c.window.date] = <Icon name={c.status === "done" ? "checkCircle" : "broom"} size={15} className={c.status === "done" ? "text-pine" : "text-ink"} />;
    return m;
  }, [data.cleanings]);

  const monthStays = stays.filter((s) => s.start < monthEnd && s.end > monthStart).sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="mt-5 space-y-5">
      <StayCalendar
        cursor={cursor}
        onCursor={setCursor}
        bars={[
          ...stays.map((s) => ({ id: s.id, start: s.start, end: s.end, label: label(s), variant: "stay" as const })),
          ...blocks.map((b) => ({ id: b.id, start: b.start, end: b.end, label: "Blokováno", variant: "block" as const })),
        ]}
        onBarClick={(id) => setDetail(stays.find((s) => s.id === id) ?? null)}
        marks={marks}
        legend={
          <>
            <Legend className="bg-pine">Obsazeno</Legend>
            <Legend style={HATCH}>Blokováno</Legend>
            <span className="inline-flex items-center gap-1.5"><Icon name="broom" size={14} /> tvůj úklid</span>
          </>
        }
      />

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-soft">Pobyty v tomhle měsíci</h2>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {monthStays.length === 0 && <p className="p-5 text-center text-sm text-soft">V tomhle měsíci nikdo neubytovaný není.</p>}
          {monthStays.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setDetail(s)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-bg/60"
            >
              <span aria-hidden className="h-8 w-1.5 shrink-0 rounded-full bg-pine" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{label(s)}</span>
                <span className="block text-xs text-soft">
                  {shortRange(s.start, s.end, "stay")} · příjezd {s.checkIn}, odjezd {s.checkOut}
                  {s.guest.guests && ` · ${s.guest.guests}`}
                </span>
              </span>
              {s.cleaningId && <span className="shrink-0 text-soft" title="Po odjezdu uklízíš ty"><Icon name="broom" /></span>}
            </button>
          ))}
        </div>
      </section>

      {detail && <StayDetail s={detail} onClose={() => setDetail(null)} onOpenCleaning={onOpenCleaning} />}
    </div>
  );
}

function StayDetail({ s, onClose, onOpenCleaning }: { s: CalStay; onClose: () => void; onOpenCleaning: (id: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-soft">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pobyt"
        className="rise w-full max-w-sm rounded-t-3xl bg-surface p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">{s.guest.name || "Pobyt"}</h2>
            <p className="text-sm text-soft">{shortRange(s.start, s.end, "stay")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-xl text-soft hover:bg-bg hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="mt-3 divide-y divide-line">
          {row("Příjezd", `${day(s.start, true)} od ${s.checkIn}`)}
          {row("Odjezd", `${day(s.end, true)} do ${s.checkOut}`)}
          {s.guest.guests && row("Hosté", s.guest.guests)}
          {s.guest.phone && row("Telefon", <a href={`tel:${s.guest.phone}`} className="text-pine underline-offset-2 hover:underline">{s.guest.phone}</a>)}
        </div>
        {s.guest.note && <p className="mt-3 rounded-xl bg-bg px-3 py-2 text-sm"><Icon name="chat" className="mr-1.5 text-soft" />{s.guest.note}</p>}
        {s.cleaningId && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCleaning(s.cleaningId!);
            }}
            className="btn-primary mt-4 w-full !py-2.5 text-sm"
          >
            <Icon name="broom" className="mr-1.5" />Můj úklid po pobytu →
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------- Úkoly (To-Do) ------------------------------- */

/**
 * Úkoly uklízečky: vidí své a majitelovy. Přidá úkol pro sebe nebo pro majitele,
 * odškrtne jen své, smaže jen ty, které sama přidala (server to hlídá znovu).
 */
function CleanerTodos({
  token,
  data,
  setData,
  toast,
}: {
  token: string;
  data: Data;
  setData: React.Dispatch<React.SetStateAction<Data | null>>;
  toast: (text: string, tone?: "error" | "success") => void;
}) {
  const me = data.me;
  const confirmDlg = useConfirm();
  const setTodos = (fn: (list: TodoItem[]) => TodoItem[]) => setData((d) => d && { ...d, todos: fn(d.todos) });
  const replace = (id: string, next: TodoItem | null) => setTodos((list) => list.flatMap((t) => (t.id === id ? (next ? [next] : []) : [t])));

  async function add(category: TodoCategory, title: string, assignee: string | null, urgent: boolean) {
    const tmp: TodoItem = {
      id: `tmp-${Date.now()}`,
      title,
      category,
      cleanerId: assignee,
      cleanerName: assignee ? data.cleaner.name : "",
      createdBy: "cleaner",
      createdById: me,
      createdByName: data.cleaner.name,
      urgent,
      done: false,
      doneAt: null,
      doneBy: "",
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };
    setTodos((list) => [...list, tmp]);
    const res = await fetch(`/api/uklid/${token}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, forOwner: !assignee, urgent }),
    }).catch(() => null);
    if (!res?.ok) {
      replace(tmp.id, null);
      const json = await res?.json().catch(() => ({}));
      return toast(json?.error || "Úkol se nepodařilo přidat.");
    }
    replace(tmp.id, await res.json());
    if (!assignee) toast("Majitel úkol uvidí ve svém přehledu.", "success");
  }

  async function toggle(t: TodoItem) {
    replace(t.id, { ...t, done: !t.done, doneBy: t.done ? "" : data.cleaner.name, doneAt: t.done ? null : new Date().toISOString() });
    const res = await fetch(`/api/uklid/${token}/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    }).catch(() => null);
    if (!res?.ok) {
      replace(t.id, t);
      const json = await res?.json().catch(() => ({}));
      return toast(json?.error || "Nepodařilo se uložit.");
    }
    replace(t.id, await res.json());
  }

  async function setUrgent(t: TodoItem) {
    replace(t.id, { ...t, urgent: !t.urgent });
    const res = await fetch(`/api/uklid/${token}/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urgent: !t.urgent }),
    }).catch(() => null);
    if (!res?.ok) {
      replace(t.id, t);
      const json = await res?.json().catch(() => ({}));
      return toast(json?.error || "Nepodařilo se uložit.");
    }
    replace(t.id, await res.json());
  }

  // Upravit text / sekci (jen svůj zápis)
  async function edit(t: TodoItem, patch: { title?: string; category?: TodoCategory }) {
    replace(t.id, { ...t, ...patch });
    const res = await fetch(`/api/uklid/${token}/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) {
      replace(t.id, t);
      const json = await res?.json().catch(() => ({}));
      return toast(json?.error || "Nepodařilo se uložit.");
    }
    replace(t.id, await res.json());
  }

  // Přeřadit (jen svůj zápis): pro mě ↔ pro majitele
  async function reassign(t: TodoItem, assignee: string | null) {
    replace(t.id, { ...t, cleanerId: assignee, cleanerName: assignee ? data.cleaner.name : "" });
    const res = await fetch(`/api/uklid/${token}/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forOwner: !assignee }),
    }).catch(() => null);
    if (!res?.ok) {
      replace(t.id, t);
      const json = await res?.json().catch(() => ({}));
      return toast(json?.error || "Nepodařilo se uložit.");
    }
    replace(t.id, await res.json());
  }

  // Smazat: otevřený úkol do karantény (jde vrátit); hotový, nebo natrvalo z karantény, hned pryč
  async function remove(t: TodoItem, final = false) {
    if (t.id.startsWith("tmp-")) return;
    const gone = final || t.done;
    replace(t.id, gone ? null : { ...t, deletedAt: new Date().toISOString() });
    const res = await fetch(`/api/uklid/${token}/todos/${t.id}${final ? "?final=1" : ""}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      replace(t.id, t);
      if (gone) setTodos((list) => (list.some((x) => x.id === t.id) ? list : [...list, t]));
      const json = await res?.json().catch(() => ({}));
      toast(json?.error || "Úkol se nepodařilo smazat.");
    }
  }

  async function restore(t: TodoItem) {
    replace(t.id, { ...t, deletedAt: null });
    const res = await fetch(`/api/uklid/${token}/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    }).catch(() => null);
    if (!res?.ok) {
      replace(t.id, t);
      const json = await res?.json().catch(() => ({}));
      return toast(json?.error || "Nepodařilo se vrátit.");
    }
    replace(t.id, await res.json());
  }

  return (
    <div className="mt-5 space-y-3">
      <p className="text-sm text-soft">
        Tvoje úkoly a úkoly pro majitele. Když něco dojde nebo se rozbije, napiš to sem a vyber „Majitel“.
      </p>
      {confirmDlg.node}
      <TodoBoard
        stacked
        todos={data.todos}
        assignees={[
          { id: me, label: "Já" },
          { id: null, label: "Majitel" },
        ]}
        defaultAssignee={me}
        can={(t) => ({
          toggle: t.cleanerId === me,
          remove: cleanerCanRemove(t, me),
          urgent: true,
          assign: t.createdBy === "cleaner" && t.createdById === me,
          edit: t.createdBy === "cleaner" && t.createdById === me,
        })}
        onUrgent={setUrgent}
        onAssign={reassign}
        onEdit={edit}
        forLabel={(t) => (t.cleanerId === me ? "Já" : "Majitel")}
        onAdd={add}
        onToggle={toggle}
        onDelete={(t) => remove(t)}
        onRestore={restore}
        onClearDone={async (category) => {
          const list = data.todos.filter((t) => t.category === category && t.done && !t.deletedAt && cleanerCanRemove(t, me));
          const ok = await confirmDlg.ask({
            title: "Smazat hotové úkoly?",
            message: `${list.length} ${list.length === 1 ? "hotový úkol se smaže" : "hotové úkoly se smažou"} natrvalo.`,
            confirmLabel: "Smazat",
          });
          if (ok) list.forEach((t) => remove(t));
        }}
        onPurgeAll={async (list) => {
          const ok = await confirmDlg.ask({
            title: "Smazat natrvalo?",
            message: `${list.length} ${list.length === 1 ? "smazaný úkol" : "smazané úkoly"} už nepůjde vrátit.`,
            confirmLabel: "Smazat natrvalo",
          });
          if (ok) list.forEach((t) => remove(t, true));
        }}
      />
    </div>
  );
}
