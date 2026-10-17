"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SOURCE_LABEL, type Reservation, type Site } from "@/lib/admin";
import { czk, nightsBetween, plural } from "@/lib/pricing";
import { StatusMenu } from "@/components/StatusMenu";
import { Sheet } from "@/components/Sheet";

// Přehled → „Od minula přišly 3 nové rezervace“: zelený pruh nahoře, klik otevře okno
// se seznamem (stav jde rovnou přepnout, klik na rezervaci otevře detail). „Hotovo,
// viděl jsem“ i křížek uloží čas potvrzení (Site.newSeenAt) — pruh zmizí do další novinky.

const MONTHS = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];

/** „dnes v 9:05“, „včera v 18:20“, jinak „14. 10. v 18:20“. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("cs-CZ", { hour: "numeric", minute: "2-digit" });
  const day = (x: Date) => x.toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  // Nezalomitelné mezery: „12. 10. v 15:32“ vždy na jednom řádku
  if (day(d) === day(new Date())) return `dnes\u00a0v\u00a0${time}`;
  if (day(d) === day(yesterday)) return `včera\u00a0v\u00a0${time}`;
  return `${d.getDate()}.\u00a0${d.getMonth() + 1}.\u00a0v\u00a0${time}`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** „20.–23. 11. 2026“ */
function range(startIso: string, endIso: string) {
  const [sy, sm, sd] = startIso.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = endIso.slice(0, 10).split("-").map(Number);
  if (sy === ey && sm === em) return `${sd}.–${ed}. ${em}. ${ey}`;
  if (sy === ey) return `${sd}. ${sm}. – ${ed}. ${em}. ${ey}`;
  return `${sd}. ${sm}. ${sy} – ${ed}. ${em}. ${ey}`;
}

export function NewReservations({
  site,
  reservations,
  onStatus,
}: {
  site: Site;
  reservations: Reservation[];
  onStatus: (id: string, status: Reservation["status"]) => Promise<void>;
}) {
  const router = useRouter();
  const [seenAt, setSeenAt] = useState<string | null>(site.newSeenAt ?? null);
  const [open, setOpen] = useState(false);

  // První návštěva: nic neukazovat (všechny staré rezervace by byly „nové“), jen si zapamatovat čas
  useEffect(() => {
    setSeenAt(site.newSeenAt ?? null);
    if (!site.newSeenAt) markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.slug]);

  function markSeen() {
    const now = new Date().toISOString();
    setSeenAt(now);
    setOpen(false);
    fetch(`/api/sites/${site.slug}/seen`, { method: "POST" }).catch(() => {});
  }

  if (!seenAt) return null;
  const fresh = reservations
    .filter((r) => r.status !== "cancelled" && r.createdAt > seenAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!fresh.length) return null;

  const total = fresh.reduce((s, r) => s + r.totalPrice, 0);
  const pending = fresh.filter((r) => r.status === "pending").length;
  const names = fresh.map((r) => r.guestName);
  const nameList =
    names.length <= 3 ? names.join(", ").replace(/, ([^,]*)$/, " a $1") : `${names.slice(0, 2).join(", ")} a ${names.length - 2} další`;
  const n = fresh.length;
  const title = `Od minula ${plural(n, "přišla", "přišly", "přišlo")} ${n} ${plural(n, "nová rezervace", "nové rezervace", "nových rezervací")}`;

  const avatars = (
    <div className="flex shrink-0 pl-2" aria-hidden>
      {fresh.slice(0, 3).map((r) => (
        <span
          key={r.id}
          className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-pine text-xs font-bold text-pine"
          style={{ background: "#e9f0ea" }}
        >
          {initials(r.guestName)}
        </span>
      ))}
    </div>
  );
  const summary = (
    <>
      <span className="block font-semibold">{title}</span>
      <span className="block text-[13px] text-white/75">
        {nameList}
        {total > 0 && ` · ${czk(total)}`}
        {pending > 0 && ` · ${pending} ${plural(pending, "čeká", "čekají", "čeká")} na platbu`} · naposledy jsi tu byl {whenLabel(seenAt)}
      </span>
    </>
  );
  const close = (
    <button
      type="button"
      onClick={markSeen}
      aria-label="Skrýt — rezervace jsem viděl"
      className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-white/70 transition hover:bg-white/10 hover:text-white"
    >
      ×
    </button>
  );

  return (
    <>
      {/* Telefon: text nahoře (× v pravém horním rohu), dole kolečka vlevo a Zobrazit vpravo */}
      <div className="relative grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 rounded-2xl bg-pine px-5 py-4 text-white [grid-template-areas:'text_text'_'avatars_show'] sm:hidden">
        <div className="[grid-area:avatars]">{avatars}</div>
        <button type="button" onClick={() => setOpen(true)} className="min-w-0 pr-8 text-left [grid-area:text]">
          {summary}
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="justify-self-end rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink transition [grid-area:show] hover:bg-cream"
        >
          Zobrazit
        </button>
        <span className="absolute right-2 top-2">{close}</span>
      </div>

      {/* Počítač: kolečka · text · Zobrazit · × */}
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-pine px-5 py-4 text-white sm:flex">
        {avatars}
        <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 basis-40 text-left">
          {summary}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-cream">
            Zobrazit
          </button>
          {close}
        </div>
      </div>

      {open && (
        <Sheet
          title={`${n} ${plural(n, "nová rezervace", "nové rezervace", "nových rezervací")}`}
          subtitle={
            <span className="text-soft">
              od tvé poslední návštěvy {whenLabel(seenAt)}
              {total > 0 && ` · ${czk(total)}`}
            </span>
          }
          onClose={() => setOpen(false)}
          footer={
            <>
              <span className="mr-auto text-[13px] text-soft max-sm:hidden">Klikni na rezervaci pro detail, kód k zámku nebo poznámku.</span>
              <button type="button" onClick={markSeen} className="btn-primary !px-5 !py-2 text-sm max-sm:w-full">
                Hotovo, viděl jsem
              </button>
            </>
          }
        >
          <div className="-mx-5 -my-5 divide-y divide-line sm:-mx-6">
            {fresh.map((r) => {
              const d = new Date(r.startDate);
              const nights = nightsBetween(new Date(r.startDate), new Date(r.endDate));
              const portal = r.guestName.startsWith("Host z ");
              const detail = () => router.push(`/admin/rezervace?detail=${r.id}`);
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => !(e.target as HTMLElement).closest("button, [role=menu]") && detail()}
                  onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && detail()}
                  className="flex cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-bg sm:gap-4 sm:px-6"
                >
                  <span className="w-10 shrink-0 text-center leading-tight">
                    <span className="block text-[11px] font-semibold uppercase text-soft">{MONTHS[d.getMonth()]}</span>
                    <span className="font-display text-xl font-semibold">{d.getDate()}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{r.guestName}</span>
                      <span className="shrink-0 rounded-full border border-line px-2 py-px text-[11px] font-semibold text-soft">
                        {SOURCE_LABEL[r.source] ?? (r.source === "demo" ? "Web" : r.source)}
                      </span>
                    </p>
                    <p className="truncate text-[13px] text-soft">
                      {range(r.startDate, r.endDate)} · {nights} {plural(nights, "noc", "noci", "nocí")}
                      {r.guests > 0 && ` · ${r.guests} ${plural(r.guests, "host", "hosté", "hostů")}`}
                      {r.status === "pending" && r.expiresAt && ` · splatné do ${new Date(r.expiresAt).toLocaleDateString("cs-CZ")}`}
                    </p>
                  </div>
                  {portal ? (
                    <button type="button" onClick={detail} className="btn-ghost shrink-0 !px-3 !py-1 !text-xs">
                      Doplnit údaje
                    </button>
                  ) : (
                    <span className="shrink-0 font-semibold tabular-nums max-sm:hidden">{czk(r.totalPrice)}</span>
                  )}
                  <span className="shrink-0">
                    <StatusMenu status={r.status} guestName={r.guestName} onChange={(st) => onStatus(r.id, st)} />
                  </span>
                </div>
              );
            })}
          </div>
        </Sheet>
      )}
    </>
  );
}
