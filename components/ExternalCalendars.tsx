"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDate, useAdminData } from "@/lib/admin";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/Skeleton";
import { plural } from "@/lib/pricing";

// Nastavení → Externí rezervace: výměna obsazenosti s Airbnb, Booking.com
// a dalšími portály přes iCal (zdarma). Odkaz na kalendář webu pro portály,
// připojené kalendáře z portálů, překryvy termínů a návody krok za krokem.

type Source = "airbnb" | "booking" | "other";
type Feed = {
  id: string;
  source: Source;
  name: string;
  url: string;
  lastSyncAt: string | null;
  lastError: string;
  eventCount: number;
  /** Právě se připojuje / synchronizuje (optimisticky). */
  busy?: boolean;
};
type Conflict = {
  external: { label: string; start: string; end: string };
  own: { id: string; guestName: string; start: string; end: string };
};

const SOURCE_NAME: Record<Source, string> = { airbnb: "Airbnb", booking: "Booking.com", other: "Jiný portál" };
const SOURCE_DOT: Record<Source, string> = { airbnb: "#ff5a5f", booking: "#003580", other: "var(--soft)" };

function ago(iso: string | null): string {
  if (!iso) return "zatím nesynchronizováno";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "právě teď";
  if (min < 60) return `před ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `před ${h} h`;
  return new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ExternalCalendars() {
  const { slug, reload } = useAdminData();
  const toast = useToast();
  const confirmDlg = useConfirm();
  const [token, setToken] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState("");

  // Každá úprava zvýší verzi — starší načtení, které doběhne později, ji nepřepíše
  const version = useRef(0);
  const load = useCallback(async () => {
    if (!slug) return;
    const started = version.current;
    const res = await fetch(`/api/sites/${slug}/feeds`).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (started !== version.current) return;
    if (!res?.ok || !data) {
      setError("Externí kalendáře se nepodařilo načíst.");
      return;
    }
    setToken(data.icalToken);
    setFeeds(data.feeds);
    setConflicts(data.conflicts);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const exportUrl = token ? `${window.location.origin}/api/ical/${token}.ics` : "";

  async function regenerate() {
    const ok = await confirmDlg.ask({
      title: "Vytvořit nový odkaz?",
      message:
        "Starý odkaz přestane platit. Nový pak musíš znovu vložit do Airbnb, Bookingu a dalších portálů — do té doby tam nebudou vidět termíny z tvého webu.",
      confirmLabel: "Vytvořit nový odkaz",
      cancelLabel: "Nechat starý",
      tone: "primary",
    });
    if (!ok || !slug) return;
    const res = await fetch(`/api/sites/${slug}/ical-token`, { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.icalToken) return toast.show("Nový odkaz se nepodařilo vytvořit.");
    setToken(data.icalToken);
    toast.show("Nový odkaz je hotový — vlož ho znovu do portálů.", "success");
  }

  async function addFeed(source: Source, url: string): Promise<boolean> {
    if (!slug) return false;
    version.current++;
    const tmp: Feed = { id: `tmp-${Date.now()}`, source, name: "", url, lastSyncAt: null, lastError: "", eventCount: 0, busy: true };
    setFeeds((f) => [...(f ?? []), tmp]);
    const res = await fetch(`/api/sites/${slug}/feeds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, url }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setFeeds((f) => (f ?? []).filter((x) => x.id !== tmp.id));
      toast.show(data?.error ?? "Kalendář se nepodařilo připojit.");
      return false;
    }
    setFeeds((f) => (f ?? []).map((x) => (x.id === tmp.id ? data.feed : x)));
    setConflicts(data.conflicts);
    reload();
    toast.show(
      data.feed.lastError
        ? "Kalendář je připojený, ale stažení se nepovedlo — zkontroluj odkaz."
        : `${SOURCE_NAME[source]} je připojený — ${data.feed.eventCount} ${plural(data.feed.eventCount, "termín", "termíny", "termínů")}.`,
      data.feed.lastError ? "error" : "success"
    );
    return true;
  }

  async function syncNow(feed: Feed) {
    version.current++;
    setFeeds((f) => (f ?? []).map((x) => (x.id === feed.id ? { ...x, busy: true } : x)));
    const res = await fetch(`/api/feeds/${feed.id}`, { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data) {
      setFeeds((f) => (f ?? []).map((x) => (x.id === feed.id ? { ...x, busy: false } : x)));
      return toast.show("Synchronizace se nepovedla.");
    }
    setFeeds((f) => (f ?? []).map((x) => (x.id === feed.id ? data.feed : x)));
    setConflicts(data.conflicts);
    if (data.changed) reload();
    if (!data.feed.lastError) toast.show("Kalendář je aktuální.", "success");
  }

  async function remove(feed: Feed) {
    const ok = await confirmDlg.ask({
      title: `Odpojit ${SOURCE_NAME[feed.source]}?`,
      message: "Termíny stažené z tohoto kalendáře zmizí z kalendáře i rezervací a portál se přestane hlídat.",
      confirmLabel: "Odpojit",
      cancelLabel: "Nechat",
      tone: "danger",
    });
    if (!ok) return;
    version.current++;
    const before = feeds;
    setFeeds((f) => (f ?? []).filter((x) => x.id !== feed.id));
    const res = await fetch(`/api/feeds/${feed.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setFeeds(before);
      return toast.show("Kalendář se nepodařilo odpojit.");
    }
    reload();
    load();
  }

  if (error) return <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-soft">{error}</p>;

  return (
    <div className="space-y-6">
      {confirmDlg.node}
      {toast.node}

      <div className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-soft">
        Pronajímáš i přes <strong className="text-ink">Airbnb</strong> nebo <strong className="text-ink">Booking.com</strong>?
        Propoj kalendáře a obsazené termíny se budou hlídat navzájem — host si nezarezervuje termín, který už je pryč
        jinde. Funguje to přes <strong className="text-ink">iCal</strong>, zdarma a bez registrace u portálů.
      </div>

      {conflicts.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-coral/30 bg-coral/5 p-5">
          <p className="font-semibold text-coral">⚠ Překrývající se termíny</p>
          <p className="text-sm text-soft">
            Termín z portálu se kryje s rezervací z tvého webu. Domluv se s jedním z hostů na jiném termínu nebo rezervaci
            zruš.
          </p>
          <ul className="space-y-1.5 text-sm">
            {conflicts.map((c, i) => (
              <li key={i} className="rounded-xl bg-surface px-3 py-2">
                <strong>{c.external.label}</strong> {fmtDate(c.external.start)} – {fmtDate(c.external.end)} ×{" "}
                <a href={`/admin/rezervace?detail=${c.own.id}`} className="font-semibold text-pine hover:underline">
                  {c.own.guestName}
                </a>{" "}
                {fmtDate(c.own.start)} – {fmtDate(c.own.end)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 1. Kalendář webu pro portály */}
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">Krok 1 · z tainy do portálů</p>
          <h2 className="font-display text-lg font-semibold">Tvůj kalendář pro portály</h2>
          <p className="text-sm text-soft">
            Vlož tenhle odkaz do Airbnb a Bookingu. Uvidí v něm termíny obsazené přes tvůj web, ruční blokace i rezervace
            z ostatních portálů — jen jako „Obsazeno“, bez jmen hostů.
          </p>
        </div>
        {token ? <CopyField value={exportUrl} /> : <Skeleton className="h-12 w-full rounded-xl" />}
        <Guide title="Jak odkaz vložit do Airbnb">
          <li>Na Airbnb otevři <strong>Kalendář</strong> a vyber své ubytování.</li>
          <li>
            Klikni na <strong>Dostupnost</strong> (případně ikonu nastavení) → <strong>Připojit kalendáře</strong> /{" "}
            <strong>Synchronizace kalendářů</strong>.
          </li>
          <li>
            Zvol <strong>Připojit k jinému webu</strong> (Import kalendáře), vlož odkaz výše a pojmenuj ho třeba „tainy“.
          </li>
          <li>Ulož. Airbnb si kalendář stahuje samo, obvykle několikrát denně.</li>
        </Guide>
        <Guide title="Jak odkaz vložit do Booking.com">
          <li>
            V extranetu Booking.com otevři <strong>Ceny a dostupnost</strong> → <strong>Synchronizovat kalendáře</strong>.
          </li>
          <li>
            Vyber pokoj nebo ubytování → <strong>Přidat propojení kalendáře</strong> → <strong>Importovat kalendář</strong>.
          </li>
          <li>Vlož odkaz výše, pojmenuj ho „tainy“ a ulož.</li>
        </Guide>
        <button type="button" onClick={regenerate} className="text-sm font-medium text-soft underline-offset-4 hover:text-ink hover:underline">
          Vytvořit nový odkaz (starý přestane platit)
        </button>
      </section>

      {/* 2. Kalendáře z portálů */}
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">Krok 2 · z portálů do tainy</p>
          <h2 className="font-display text-lg font-semibold">Kalendáře z portálů</h2>
          <p className="text-sm text-soft">
            Vlož odkaz na kalendář z Airbnb nebo Bookingu. Obsazené termíny se zablokují na tvém webu a uvidíš je
            v Kalendáři. Rezervace z Airbnb se objeví i v Rezervacích — jméno a cenu jim doplníš jedním klikem.
          </p>
        </div>

        {feeds === null ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-2">
            {feeds.map((f) => (
              <FeedRow key={f.id} feed={f} onSync={() => syncNow(f)} onRemove={() => remove(f)} />
            ))}
            {feeds.length === 0 && (
              <p className="rounded-xl bg-bg px-4 py-3 text-sm text-soft">Zatím není připojený žádný kalendář.</p>
            )}
          </div>
        )}

        <AddFeedForm onAdd={addFeed} />

        <Guide title="Kde na Airbnb najdu odkaz na kalendář">
          <li>
            Na Airbnb otevři <strong>Kalendář</strong> → vyber ubytování → <strong>Dostupnost</strong> →{" "}
            <strong>Připojit kalendáře</strong>.
          </li>
          <li>
            Klikni na <strong>Připojit k jinému webu</strong> a zkopíruj odkaz z části <strong>Export kalendáře</strong>{" "}
            (končí na <code>.ics</code>).
          </li>
          <li>Vlož ho sem, vyber Airbnb a klikni na Připojit.</li>
        </Guide>
        <Guide title="Kde na Booking.com najdu odkaz na kalendář">
          <li>
            V extranetu otevři <strong>Ceny a dostupnost</strong> → <strong>Synchronizovat kalendáře</strong>.
          </li>
          <li>
            U pokoje klikni na <strong>Přidat propojení kalendáře</strong> → <strong>Exportovat kalendář</strong> a zkopíruj
            odkaz.
          </li>
          <li>
            Vlož ho sem a vyber Booking.com. Booking neodlišuje rezervace od blokací — termíny se proto objeví jako blokace
            a v Kalendáři je jedním klikem převedeš na rezervaci.
          </li>
        </Guide>
      </section>

      {/* 3. Jak často */}
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5 text-sm text-soft">
        <h2 className="font-display text-lg font-semibold text-ink">Jak často se kalendáře synchronizují</h2>
        <p>
          <strong className="text-ink">tainy</strong> stahuje kalendáře z portálů vždy, když host na webu vybírá termín
          nebo odesílá rezervaci, a při otevření administrace. Na tvém webu tak termín z Airbnb nebo Bookingu nikdo
          nezarezervuje.
        </p>
        <p>
          <strong className="text-ink">Portály</strong> si tvůj kalendář stahují samy, obvykle několikrát denně — to
          ovlivnit nejde. Když ti přijde rezervace na poslední chvíli, zavři pro jistotu termín na portálu i ručně.
        </p>
        <Guide title="Chci synchronizaci i když nikdo web neotevře (nepovinné)">
          <li>
            Založ si zdarma účet na <strong>cron-job.org</strong> a vytvoř novou úlohu (Create cronjob).
          </li>
          <li>
            Jako adresu vlož <code className="break-all">{typeof window !== "undefined" ? window.location.origin : ""}/api/ical/sync</code>{" "}
            a nastav opakování každých 15 minut.
          </li>
          <li>Ulož. Kalendáře z portálů se pak budou stahovat pravidelně samy.</li>
        </Guide>
      </section>
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="field min-w-0 flex-1 font-mono text-xs" />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard?.writeText(value).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="btn-primary shrink-0 !px-4 !py-2 text-sm"
      >
        {copied ? "✓ Zkopírováno" : "Kopírovat"}
      </button>
    </div>
  );
}

function Guide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl bg-bg px-4 py-3 text-sm">
      <summary className="cursor-pointer list-none font-medium text-pine marker:hidden">
        <span className="inline-block transition group-open:rotate-90">›</span> {title}
      </summary>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-soft">{children}</ol>
    </details>
  );
}

function FeedRow({ feed, onSync, onRemove }: { feed: Feed; onSync: () => void; onRemove: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SOURCE_DOT[feed.source] }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{feed.name || SOURCE_NAME[feed.source]}</p>
        <p className="truncate text-xs text-soft" title={feed.url}>
          {feed.busy
            ? "Stahuji kalendář…"
            : `${feed.eventCount} ${plural(feed.eventCount, "termín", "termíny", "termínů")} · ${ago(feed.lastSyncAt)}`}
        </p>
        {feed.lastError && !feed.busy && <p className="mt-1 text-xs text-coral">{feed.lastError}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onSync}
          disabled={feed.busy || feed.id.startsWith("tmp-")}
          className="btn-ghost !px-3 !py-1.5 text-xs"
        >
          {feed.busy ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-label="Synchronizuji" />
          ) : (
            "↻ Synchronizovat"
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={feed.id.startsWith("tmp-")}
          className="btn-ghost !px-3 !py-1.5 text-xs !text-coral"
        >
          Odpojit
        </button>
      </div>
    </div>
  );
}

function AddFeedForm({ onAdd }: { onAdd: (source: Source, url: string) => Promise<boolean> }) {
  const [source, setSource] = useState<Source>("airbnb");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^(https?|webcal):\/\/\S+$/i.test(url.trim());
  const segment = (on: boolean) =>
    `flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${on ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onAdd(source, url.trim());
    setBusy(false);
    if (ok) setUrl("");
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-dashed border-line p-4">
      <p className="text-sm font-semibold">Připojit kalendář</p>
      <div className="flex max-w-md rounded-xl border border-line bg-bg p-1" role="radiogroup" aria-label="Portál">
        {(Object.keys(SOURCE_NAME) as Source[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={source === s} onClick={() => setSource(s)} className={segment(source === s)}>
            {SOURCE_NAME[s]}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="field min-w-0 flex-1"
          type="url"
          inputMode="url"
          placeholder={source === "booking" ? "https://admin.booking.com/hotel/hoteladmin/ical.html?t=…" : "https://www.airbnb.cz/calendar/ical/….ics?s=…"}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" disabled={!valid || busy} className="btn-primary shrink-0 !px-5 !py-2.5 text-sm">
          {busy ? "Připojuji…" : "Připojit"}
        </button>
      </div>
    </form>
  );
}
