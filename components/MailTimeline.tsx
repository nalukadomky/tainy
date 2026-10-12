"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { guestsLabel, type Reservation, type Site } from "@/lib/admin";
import {
  arrivalDaysOf,
  parseEmailSettings,
  renderEmail,
  SCHEDULED_TIME,
  type EmailKind,
  type StayMail,
} from "@/lib/email-templates";
import { cleaningStart } from "@/lib/cleaning";
import { addDays, nightsOf, todayISO } from "@/lib/stay";
import { plural } from "@/lib/pricing";
import { fmtSendAt } from "@/lib/access-code";
import { providerLine, providerShort } from "@/lib/legal";
import { buildPayment } from "@/lib/payment";
import { Icon } from "@/components/Icon";

// Časová osa e-mailů hostovi v detailu rezervace: co už odešlo (s časem)
// a co teprve odejde. Každý krok jde rozkliknout — odeslaný e-mail ukáže
// přesně tak, jak odešel (uložený v GuestMail), naplánovaný jako náhled.
// Pravidla plánování odpovídají lib/guest-mails.ts.

type Kind = EmailKind | "arrivalCode" | "dateChange";
type Sent = { id: string; kind: Kind; subject: string; html: string; sentAt: string };
type Step = { key: string; kind: Kind; label: string; at?: string; plan?: string; mail?: Sent };

const LABEL: Record<Kind, string> = {
  booking: "Přijetí rezervace",
  paid: "Platba přijata",
  arrival: "Před příjezdem",
  arrivalCode: "Kód k zámku",
  cancelled: "Zrušení rezervace",
  dateChange: "Změna termínu",
  thanks: "Poděkování po pobytu",
};

const PORTALS = ["airbnb", "booking"];

function steps(r: Reservation, site: Site | null, log: Sent[]): Step[] {
  if (!r.email.trim() || r.anonymized || PORTALS.includes(r.source)) return [];
  const settings = parseEmailSettings(site?.emailSettings);
  const automatic = r.source !== "demo"; // ukázkové rezervace dostanou jen potvrzení
  const upcoming = r.startDate.slice(0, 10) >= todayISO();
  const active = r.status !== "cancelled";

  // Odeslané: z archivu, a starší odeslání (před archivem) podle časů u rezervace
  const sent: Step[] = log.map((m) => ({ key: m.id, kind: m.kind, label: LABEL[m.kind] ?? m.subject, at: m.sentAt, mail: m }));
  const logged = new Set(log.map((m) => m.kind));
  const older: [Kind, string | null | undefined][] = [
    ["booking", r.source === "web" || r.source === "demo" ? r.createdAt : null],
    ["paid", r.paidMailAt],
    ["arrival", r.arrivalMailAt],
    ["arrivalCode", r.arrivalCodeMailAt],
    ["cancelled", r.cancelMailAt],
  ];
  for (const [kind, at] of older) if (at && !logged.has(kind)) sent.push({ key: kind, kind, label: LABEL[kind], at });
  sent.sort((a, b) => a.at!.localeCompare(b.at!));
  for (const s of sent) {
    if (s.kind === "arrival" && r.accessCode && (!r.accessCodeSetAt || r.accessCodeSetAt <= s.at!))
      s.label = "Před příjezdem, s kódem k zámku";
  }

  // Naplánované
  const planned: Step[] = [];
  if (automatic && active && upcoming) {
    if (!r.paidMailAt && settings.paid.enabled) {
      if (r.status === "pending")
        planned.push({ key: "plan-paid", kind: "paid", label: LABEL.paid, plan: "po označení „Zaplaceno“" });
      else if (r.paidAt) planned.push({ key: "plan-paid", kind: "paid", label: LABEL.paid, plan: "odchází…" });
    }
    if (!r.arrivalMailAt && settings.arrival.enabled && (r.status === "pending" || r.paidAt)) {
      const due = cleaningStart(addDays(r.startDate.slice(0, 10), -arrivalDaysOf(site)), SCHEDULED_TIME);
      const future = due > new Date();
      const plan =
        r.status === "pending"
          ? future
            ? `${fmtSendAt(due)}, jen po zaplacení`
            : "hned po zaplacení"
          : future
            ? fmtSendAt(due)
            : "odchází…";
      planned.push({ key: "plan-arrival", kind: "arrival", label: LABEL.arrival, plan });
    }
  }
  return [...sent, ...planned];
}

/** Souhrn pobytu pro náhled e-mailu z dat administrace. */
function stayOf(r: Reservation, site: Site): StayMail {
  const start = r.startDate.slice(0, 10);
  const end = r.endDate.slice(0, 10);
  return {
    publicId: r.publicId,
    siteName: site.name,
    guestName: r.guestName,
    firstName: r.firstName,
    email: r.email,
    phone: r.phone,
    guests: r.guests,
    guestSummary: guestsLabel(r, site),
    startDate: start,
    endDate: end,
    nights: nightsOf(start, end),
    total: r.totalPrice,
    discount: r.discount,
    voucherCode: r.voucherCode,
    vatRate: r.vatRate,
    vatAmount: r.vatAmount,
    paid: r.status === "paid",
    demo: r.source === "demo",
    checkInTime: r.checkInTime || site.checkInTime,
    checkOutTime: r.checkOutTime || site.checkOutTime,
    legal: site.businessName ? { provider: providerLine(site), short: providerShort(site), address: site.businessAddress } : undefined,
  };
}

function preview(step: Step, r: Reservation, site: Site | null): { subject: string; html: string } | null {
  if (!site || step.kind === "dateChange" || step.kind === "thanks") return null;
  const kind: EmailKind = step.kind === "arrivalCode" ? "arrival" : step.kind;
  const pay = kind === "booking" && site.bankAccount ? buildPayment(site.bankAccount, r.totalPrice, site.name, r.publicId) : null;
  const stay = stayOf(r, site);
  // Potvrzení rezervace odešlo před zaplacením (kromě ukázkové platby)
  if (kind === "booking") stay.paid = r.source === "demo";
  return renderEmail(kind, site, stay, {
    link: `/r/${r.publicId}`,
    payment: pay ? { account: site.bankAccount, vs: pay.vs, amount: r.totalPrice } : null,
    holdUntil: r.expiresAt,
    accessCode: r.accessCode || undefined,
  });
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** E-mail v rámečku; výška podle obsahu, odkazy do nové karty. */
function MailFrame({ html }: { html: string }) {
  const [height, setHeight] = useState(400);
  return (
    <iframe
      aria-label="Obsah e-mailu"
      sandbox="allow-same-origin allow-popups"
      srcDoc={`<base target="_blank">${html}`}
      onLoad={(e) => setHeight(e.currentTarget.contentDocument?.documentElement.scrollHeight ?? 400)}
      style={{ height }}
      className="block w-full bg-white"
    />
  );
}

/** Okno s celým e-mailem nad detailem rezervace. Escape zavře jen tohle okno. */
function MailDialog({
  step,
  content,
  loading,
  onClose,
}: {
  step: Step;
  content: { subject: string; html: string } | null;
  loading: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const note = step.mail
    ? null
    : step.at
      ? "Náhled podle aktuálního textu — e-mail odešel před ukládáním obsahu."
      : "Náhled — takhle e-mail odejde.";
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step.label}
        className="rise flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl max-sm:h-[92dvh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-soft">
              {step.label} · {step.at ? fmt(step.at) : step.plan}
            </p>
            <p className="mt-0.5 font-semibold">{content?.subject ?? (loading ? "…" : "")}</p>
            {note && <p className="mt-1 text-xs text-soft">{note}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-soft hover:bg-bg hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain bg-[#f4f1ea]">
          {loading ? (
            <div className="m-5 h-96 animate-pulse rounded-xl bg-line/50" aria-label="Načítám e-mail" />
          ) : content ? (
            <MailFrame html={content.html} />
          ) : (
            <p className="p-5 text-sm text-soft">Obsah tohoto e-mailu není uložený.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function MailTimeline({ r, site }: { r: Reservation; site: Site | null }) {
  const [log, setLog] = useState<Sent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/reservations/${r.id}/mails`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Sent[]) => {
        if (!alive) return;
        setLog(list);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
    // Znovu po změně stavu / odeslání (časy u rezervace se mění)
  }, [r.id, r.status, r.paidMailAt, r.arrivalMailAt, r.arrivalCodeMailAt, r.cancelMailAt]);

  const list = useMemo(() => steps(r, site, log), [r, site, log]);
  // Po načtení archivu se klíč odeslaného e-mailu změní (druh → id záznamu)
  const current = open ? (list.find((s) => s.key === open) ?? list.find((s) => s.kind === open && s.at)) : undefined;
  if (!list.length) return null;

  const sentCount = list.filter((s) => s.at).length;
  const plannedCount = list.length - sentCount;
  const summary = [
    sentCount && `${sentCount} ${plural(sentCount, "odeslaný", "odeslané", "odeslaných")}`,
    plannedCount && `${plannedCount} ${plural(plannedCount, "naplánovaný", "naplánované", "naplánovaných")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-xl border border-line bg-surface sm:col-span-2">
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-expanded={shown}
        className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left transition hover:bg-bg/60"
      >
        <Icon name="mail" size={16} className="text-pine" />
        <span className="font-semibold">E-maily hostovi</span>
        <span className="min-w-0 flex-1 truncate text-xs text-soft">{summary}</span>
        <Icon name="chevronDown" size={16} className={`text-soft transition-transform ${shown ? "rotate-180" : ""}`} />
      </button>
      {shown && (
        <div className="border-t border-line px-4 py-3">
          <ol>
            {list.map((s, i) => {
              return (
                <li key={s.key} className="relative pb-1 last:pb-0">
                  {i < list.length - 1 && <span aria-hidden className="absolute bottom-0 left-[9px] top-6 w-px bg-line" />}
                  <button
                    type="button"
                    onClick={() => setOpen(s.key)}
                    aria-haspopup="dialog"
                    className="group relative flex w-full items-start gap-3 rounded-lg py-1 text-left"
                  >
                    <span
                      aria-hidden
                      className={`relative mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full ${
                        s.at ? "bg-pine text-white" : "border border-dashed border-soft/60 bg-surface"
                      }`}
                    >
                      {s.at && (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4">
                      <span className={`group-hover:underline ${s.at ? "" : "text-soft"}`}>{s.label}</span>
                      <span className="tabular-nums text-soft">{s.at ? fmt(s.at) : s.plan}</span>
                    </span>
                    <Icon name="chevronDown" size={14} className="mt-1 -rotate-90 text-soft/70" />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {current && (
        <MailDialog
          step={current}
          content={current.mail ?? preview(current, r, site)}
          loading={!!current.at && !current.mail && !loaded}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
