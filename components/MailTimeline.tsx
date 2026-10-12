"use client";

import type { Reservation, Site } from "@/lib/admin";
import { arrivalDaysOf, parseEmailSettings, SCHEDULED_TIME } from "@/lib/email-templates";
import { cleaningStart } from "@/lib/cleaning";
import { addDays, todayISO } from "@/lib/stay";
import { fmtSendAt } from "@/lib/access-code";
import { Icon } from "@/components/Icon";

// Časová osa e-mailů hostovi v detailu rezervace: co už odešlo (s časem)
// a co teprve odejde. Pravidla odpovídají lib/guest-mails.ts.

type Step = { label: string; at?: string; plan?: string };

const PORTALS = ["airbnb", "booking"];

function steps(r: Reservation, site: Site | null): Step[] {
  if (!r.email.trim() || r.anonymized || PORTALS.includes(r.source)) return [];
  const settings = parseEmailSettings(site?.emailSettings);
  const fromWeb = r.source === "web" || r.source === "demo";
  const automatic = r.source !== "demo"; // ukázkové rezervace dostanou jen potvrzení
  const upcoming = r.startDate.slice(0, 10) >= todayISO();
  const out: Step[] = [];

  // Potvrzení rezervace odchází hned při rezervaci z webu
  if (fromWeb) out.push({ label: "Přijetí rezervace", at: r.createdAt });

  if (r.paidMailAt) out.push({ label: "Platba přijata", at: r.paidMailAt });
  else if (automatic && settings.paid.enabled && upcoming && r.status !== "cancelled") {
    if (r.status === "pending") out.push({ label: "Platba přijata", plan: "po označení „Zaplaceno“" });
    else if (r.paidAt) out.push({ label: "Platba přijata", plan: "odchází…" });
  }

  if (r.arrivalMailAt) {
    const withCode = !!r.accessCode && (!r.accessCodeSetAt || r.accessCodeSetAt <= r.arrivalMailAt);
    out.push({ label: withCode ? "Před příjezdem, s kódem k zámku" : "Před příjezdem", at: r.arrivalMailAt });
  } else if (automatic && settings.arrival.enabled && upcoming && r.status !== "cancelled" && (r.status === "pending" || r.paidAt)) {
    const due = cleaningStart(addDays(r.startDate.slice(0, 10), -arrivalDaysOf(site)), SCHEDULED_TIME);
    const future = due > new Date();
    const plan =
      r.status === "pending" ? (future ? `${fmtSendAt(due)}, jen po zaplacení` : "hned po zaplacení") : future ? fmtSendAt(due) : "odchází…";
    out.push({ label: "Před příjezdem", plan });
  }
  if (r.arrivalCodeMailAt) out.push({ label: "Kód k zámku", at: r.arrivalCodeMailAt });
  if (r.cancelMailAt) out.push({ label: "Zrušení rezervace", at: r.cancelMailAt });
  return out;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function MailTimeline({ r, site }: { r: Reservation; site: Site | null }) {
  const list = steps(r, site);
  if (!list.length) return null;
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">E-maily hostovi</p>
      <ol className="relative">
        {list.map((s, i) => (
          <li key={s.label} className="relative flex items-start gap-3 pb-2.5 last:pb-0">
            {i < list.length - 1 && <span aria-hidden className="absolute left-[9px] top-5 h-full w-px bg-line" />}
            <span
              aria-hidden
              className={`relative mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full ${
                s.at ? "bg-pine text-white" : "border border-dashed border-soft/60 bg-surface"
              }`}
            >
              {s.at && <Icon name="mail" size={11} />}
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-4">
              <span className={s.at ? "font-medium" : "text-soft"}>{s.label}</span>
              <span className={s.at ? "font-medium tabular-nums" : "text-soft"}>{s.at ? fmt(s.at) : s.plan}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
