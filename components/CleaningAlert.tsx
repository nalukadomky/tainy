import Link from "next/link";
import type { CleaningAlert } from "@/lib/cleaning";
import type { Reservation } from "@/lib/admin";
import { todayISO } from "@/lib/stay";
import { Icon } from "@/components/Icon";

// Upozornění, že úklid před příjezdem (po předchozím pobytu, nebo ručně
// naplánovaný) ještě není hotový, a přitom dnes nebo zítra přijíždějí hosté
// (počítá server v /api/admin-data).

const when = (a: CleaningAlert) => (a.arrival === todayISO() ? "Dnes" : "Zítra");
const fmtDay = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return iso === todayISO() ? "dnes" : `${d}. ${m}.`;
};

/** Pruh nahoře v Přehledu — jeden řádek za každý ohrožený příjezd. */
export function CleaningAlerts({ reservations }: { reservations: Reservation[] }) {
  const list = reservations
    .filter((r) => r.cleaningAlert)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!list.length) return null;
  return (
    <div className="space-y-2" role="alert">
      {list.map((r) => {
        const a = r.cleaningAlert!;
        return (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber/40 bg-amber/10 px-5 py-4"
          >
            <div className="min-w-0">
              <p className="font-semibold text-[#7a4f06]">
                <Icon name="broom" className="mr-1.5" />{a.kind === "unassigned" ? "Úklid zatím nikdo nemá přiřazený" : "Úklid ještě není hotový"}
              </p>
              <p className="mt-0.5 text-sm text-ink/80">
                {when(a)}
                {a.arrivalTime && ` v ${a.arrivalTime}`} přijíždí <strong>{r.guestName}</strong>.{" "}
                {a.prevGuest ? `Po odjezdu: ${a.prevGuest}.` : `Naplánovaný úklid „${a.title}“ (${fmtDay(a.date)}).`}
                {a.kind === "todo" &&
                  ` ${a.cleaner ? `Uklízí ${a.cleaner}` : "Uklízí se"}${a.total ? ` · hotovo ${a.done} z ${a.total} úkolů` : ""}.`}
              </p>
            </div>
            <Link href="/admin/kalendar/uklid" className="btn-ghost shrink-0 !bg-surface !px-4 !py-2 text-sm">
              {a.kind === "unassigned" ? "Přiřadit úklid →" : "Otevřít úklid →"}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

/** Štítek u přijíždějící rezervace (seznamy, detail). */
export function CleaningBadge({ alert, withLink = false }: { alert?: CleaningAlert | null; withLink?: boolean }) {
  if (!alert) return null;
  const label = alert.kind === "unassigned" ? "Úklid nepřiřazený" : "Úklid nehotový";
  const cls =
    "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber/15 px-2.5 py-0.5 text-xs font-semibold text-[#7a4f06]";
  const title = `${when(alert)} přijíždějí hosté a ${
    alert.prevGuest ? `úklid po pobytu ${alert.prevGuest}` : `naplánovaný úklid „${alert.title}“`
  } ${alert.kind === "unassigned" ? "nikdo nemá přiřazený" : "ještě není hotový"}.`;
  return withLink ? (
    <Link href="/admin/kalendar/uklid" className={`${cls} hover:bg-amber/25`} title={title}>
      <Icon name="broom" className="mr-1" />{label} →
    </Link>
  ) : (
    <span className={cls} title={title}>
      <Icon name="broom" className="mr-1" />{label}
    </span>
  );
}
