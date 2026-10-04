"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wordmark } from "@/components/Logo";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { greetingName } from "@/lib/vocative";
import { cleaningAmount, fmtMinutes, fmtStart, type ChecklistItem } from "@/lib/cleaning";
import { czk, plural } from "@/lib/pricing";
import { todayISO } from "@/lib/stay";

// Kalendář úklidů uklízečky (tajný odkaz, bez přihlášení). Vidí jen své úklidy,
// termíny a časy, údaje o hostech, které majitel povolil, a svou odměnu — nikdy
// ceny pobytů. Ukončený úklid už nejde upravit; znovu ho může otevřít jen majitel.

type Cleaning = {
  id: string;
  /** stay = úklid po pobytu, manual = ruční úklid (zadal majitel nebo zapsala uklízečka) */
  kind: "stay" | "manual";
  /** Začátek úklidu — dřív ho nejde ukončit. */
  startsAt: string;
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

type Data = {
  cleaner: { name: string; payMode: string; rate: number };
  site: { name: string };
  cleanings: Cleaning[];
};

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
          🧹
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold">Odkaz už neplatí</h1>
        <p className="mt-2 text-soft">Požádej majitele ubytování o nový odkaz na kalendář úklidů.</p>
      </main>
    );
  }
  if (!data) return <p className="py-24 text-center text-sm text-soft">Načítám úklidy…</p>;

  const todo = groups.today.length + groups.upcoming.length;
  const earnedTotal = groups.done.reduce((sum, c) => sum + (c.earned ?? 0), 0);

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-6">
      {toast.node}
      <header className="flex items-center justify-between">
        <Wordmark className="text-lg" />
        <span className="truncate rounded-full bg-line/60 px-3 py-1 text-xs font-semibold text-soft">{data.site.name}</span>
      </header>

      <h1 className="mt-7 font-display text-3xl font-semibold tracking-tight">Ahoj {greetingName(data.cleaner.name, "")} 👋</h1>
      <p className="mt-1 text-soft">
        {todo
          ? `Máš ${todo} ${plural(todo, "úklid", "úklidy", "úklidů")} před sebou.`
          : "Teď nemáš žádný úklid. Až ti majitel nějaký přiřadí, objeví se tady."}
      </p>

      <AddOwn token={token} onAdded={load} toast={toast.show} />

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
      className={`overflow-hidden rounded-2xl border ${
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
              <span className="mt-1 inline-block rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold text-soft">Zapsala jsi</span>
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
  // Ukončit jde až od začátku úklidu — hlídáme průběžně, tlačítko se samo odemkne.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const tooEarly = new Date(c.startsAt).getTime() > now;
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
      {c.guest.note && <p className="rounded-xl bg-bg px-3 py-2 text-sm">💬 {c.guest.note}</p>}
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
            className="control w-20 text-center text-lg"
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
            className="control w-20 text-center text-lg"
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

      <button
        type="button"
        className="btn-primary w-full"
        disabled={minutesTotal <= 0 || tooEarly}
        onClick={() => setConfirm(true)}
      >
        {tooEarly
          ? `Ukončit půjde od ${fmtStart(c.window.date, c.window.from)}`
          : minutesTotal > 0
            ? "Ukončit úklid"
            : "Vyplň čas a ukonči úklid"}
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
            await patch(c.id, { minutes: minutesTotal, note, finish: true }, { status: "done", minutes: minutesTotal, note });
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
}: {
  token: string;
  onAdded: () => Promise<void> | void;
  toast: (text: string, tone?: "error" | "success") => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setSaving(true);
    const res = await fetch(`/api/uklid/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, time, title }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const json = await res?.json().catch(() => ({}));
      return toast(json?.error || "Úklid se nepodařilo zapsat.");
    }
    toast("Úklid zapsaný — majitel ho uvidí v přehledu.", "success");
    setTitle("");
    setTime("");
    setOpen(false);
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
      <div className="flex gap-2">
        <input type="date" className="field flex-1" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum" />
        <input type="time" className="field w-32" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Čas začátku" />
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1 !py-2.5 text-sm" onClick={() => setOpen(false)}>
          Zrušit
        </button>
        <button type="submit" className="btn-primary flex-1 !py-2.5 text-sm" disabled={saving || !title.trim() || !date}>
          {saving ? "Zapisuju…" : "Zapsat"}
        </button>
      </div>
    </form>
  );
}
