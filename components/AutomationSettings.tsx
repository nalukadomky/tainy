"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminData, type Reservation, type Site } from "@/lib/admin";
import {
  EMAIL_KINDS,
  EMAIL_VARS,
  SCHEDULED_TIME,
  defaultsOf,
  emailMeta,
  parseEmailSettings,
  parseLocks,
  renderEmail,
  serializeEmailSettings,
  switchTone,
  type EmailConfig,
  type EmailKind,
  type EmailMeta,
  type Lock,
  type StayMail,
} from "@/lib/email-templates";
import { buildPayment } from "@/lib/payment";
import { nightsBetween, plural } from "@/lib/pricing";
import { addDays, todayISO } from "@/lib/stay";
import { RichTextEditor } from "@/components/RichTextEditor";
import { AddressInput } from "@/components/AddressInput";

// Nastavení → Automatizace: e-maily hostům (informativní / komerční / pro tebe),
// kódy k zámkům a informace k příjezdu. Ukládá se společným tlačítkem editoru.

type SetField = <K extends keyof Site>(key: K, value: Site[K]) => void;

export function AutomationSettings({ form, set }: { form: Site; set: SetField }) {
  const settings = useMemo(() => parseEmailSettings(form.emailSettings), [form.emailSettings]);
  const update = (kind: EmailKind, patch: Partial<EmailConfig>) =>
    set("emailSettings", serializeEmailSettings({ ...settings, [kind]: { ...settings[kind], ...patch } }));
  const [preview, setPreview] = useState<EmailKind | null>(null);
  // Po přepnutí tónu: kolik e-mailů má vlastní text, který je potřeba přepsat ručně
  const [customLeft, setCustomLeft] = useState(0);
  function setTone(formal: boolean) {
    if (formal === settings.formal) return;
    const { settings: next, custom } = switchTone(settings, formal);
    set("emailSettings", serializeEmailSettings(next));
    setCustomLeft(custom);
  }
  const segment = (on: boolean) =>
    `flex-1 rounded-lg px-4 py-1.5 text-sm font-medium transition ${on ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"}`;

  const group = (g: EmailMeta["group"]) =>
    EMAIL_KINDS.filter((m) => m.group === g).map((m) => (
      <EmailCard
        key={m.kind}
        meta={m}
        formal={settings.formal}
        cfg={settings[m.kind]}
        onChange={(patch) => update(m.kind, patch)}
        onPreview={() => setPreview(m.kind)}
      />
    ));

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Oslovení hostů</h2>
            <p className="text-sm text-soft">
              {settings.formal ? "„Děkujeme za rezervaci, máte u nás…“" : "„Díky za rezervaci, Jano! Máš u nás…“"}
            </p>
          </div>
          <div
            className="flex w-full rounded-xl border border-line bg-bg p-1 sm:w-64"
            role="radiogroup"
            aria-label="Oslovení hostů"
          >
            {(
              [
                [false, "Tykat"],
                [true, "Vykat"],
              ] as const
            ).map(([formal, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={settings.formal === formal}
                onClick={() => setTone(formal)}
                className={segment(settings.formal === formal)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {customLeft > 0 && (
          <p className="rounded-xl bg-amber/15 px-4 py-2.5 text-sm text-[#92600a]">
            Výchozí texty jsme přepsali.{" "}
            {customLeft === 1
              ? "Jeden e-mail má tvůj vlastní text — zůstal beze změny, zkontroluj ho."
              : `${customLeft} ${plural(customLeft, "e-mail", "e-maily", "e-mailů")} ${plural(customLeft, "má", "mají", "má")} tvůj vlastní text — zůstaly beze změny, zkontroluj je.`}
          </p>
        )}
      </div>

      <p className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-soft">
        Tady nastavíš, co hostům chodí e-mailem. Teď upravíš texty a uvidíš náhled. Hned po rezervaci už se posílá
        e-mail <strong className="text-ink">Přijetí rezervace</strong> podle tohoto nastavení. Ostatní e-maily začnou
        chodit, až zapneme jejich automatické odesílání.
      </p>

      <Section
        title="Informativní e-maily"
        hint="K samotné rezervaci — chodí všem hostům, kteří rezervují přes tvůj web."
      >
        {group("info")}
      </Section>

      <Section
        title="Komerční e-maily"
        hint="Nabídky a poděkování. Chodí jen hostům, kteří se neodhlásili — v patičce je vždy odkaz na odhlášení."
      >
        {group("marketing")}
      </Section>

      <Section title="Pro tebe" hint="Co chodí tobě na kontaktní e-mail webu.">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5">
          <div>
            <p className="font-semibold">Upozornění na novou rezervaci</p>
            <p className="text-sm text-soft">
              {form.contactEmail ? `Na ${form.contactEmail}` : "Doplň kontaktní e-mail v záložce Název a kontakt."}
            </p>
          </div>
          <Switch
            on={settings.ownerNotify}
            label="Upozornění na novou rezervaci"
            onChange={(on) => set("emailSettings", serializeEmailSettings({ ...settings, ownerNotify: on }))}
          />
        </div>
      </Section>

      <Section
        title="Příjezd a zámky"
        hint={`Posílá se hostům v e-mailu Před příjezdem (${settings.arrival.days} ${plural(settings.arrival.days, "den", "dny", "dní")} předem).`}
      >
        <LocksCard value={form.locks} onChange={(v) => set("locks", v)} />
        <ArrivalCard form={form} set={set} />
      </Section>

      {preview && <PreviewDialog kind={preview} form={form} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <p className="text-sm text-soft">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Switch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60"
      style={{ width: 44, height: 26, background: on ? "var(--pine)" : "var(--line)" }}
    >
      <span
        className="absolute rounded-full bg-white shadow transition-all"
        style={{ top: 3, left: on ? 21 : 3, width: 20, height: 20 }}
      />
    </button>
  );
}

function whenLabel(meta: EmailMeta, cfg: EmailConfig): string {
  if (meta.kind === "booking") return "Ihned po rezervaci";
  if (meta.kind === "paid") return "Po označení „Zaplaceno“";
  if (meta.kind === "cancelled") return "Po zrušení rezervace";
  const d = cfg.days;
  if (meta.timing === "before")
    return d === 0
      ? `V den příjezdu v ${SCHEDULED_TIME}`
      : `${d} ${plural(d, "den", "dny", "dní")} před příjezdem v ${SCHEDULED_TIME}`;
  return d === 0
    ? `V den odjezdu v ${SCHEDULED_TIME}`
    : `${d} ${plural(d, "den", "dny", "dní")} po odjezdu v ${SCHEDULED_TIME}`;
}

function EmailCard({
  meta,
  formal,
  cfg,
  onChange,
  onPreview,
}: {
  meta: EmailMeta;
  formal: boolean;
  cfg: EmailConfig;
  onChange: (patch: Partial<EmailConfig>) => void;
  onPreview: () => void;
}) {
  const [open, setOpen] = useState(false);
  const insertText = useRef<((text: string) => void) | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  // Proměnná se vloží tam, kde byl kurzor naposledy — do předmětu, nebo do textu
  const [target, setTarget] = useState<"subject" | "text">("text");
  const defaults = defaultsOf(meta, formal);
  const isDefault = cfg.subject === defaults.subject && cfg.text === defaults.text;
  // Po „Vrátit výchozí“ se editor znovu vytvoří s výchozím textem
  const [editorKey, setEditorKey] = useState(0);

  function insertVar(name: string) {
    const token = `{${name}}`;
    const input = subjectRef.current;
    if (target === "subject" && input) {
      const start = input.selectionStart ?? cfg.subject.length;
      const end = input.selectionEnd ?? start;
      onChange({ subject: cfg.subject.slice(0, start) + token + cfg.subject.slice(end) });
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(start + token.length, start + token.length);
      });
    } else insertText.current?.(token);
  }

  return (
    <div className={`rounded-2xl border bg-surface transition ${open ? "border-pine/30" : "border-line"}`}>
      <div className="flex items-start gap-3 p-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${cfg.enabled ? "" : "text-soft"}`}>{meta.title}</span>
            <span className="rounded-full bg-bg px-2.5 py-0.5 text-[11px] font-semibold text-soft">
              {whenLabel(meta, cfg)}
            </span>
          </span>
          <span className="mt-1 block text-sm text-soft">{meta.includes}</span>
          <span className="mt-2 block text-sm font-medium text-pine">{open ? "Skrýt ▴" : "Upravit text ▾"}</span>
        </button>
        <Switch
          on={cfg.enabled}
          disabled={meta.required}
          label={meta.required ? `${meta.title} — posílá se vždy` : meta.title}
          onChange={(enabled) => onChange({ enabled })}
        />
      </div>
      {meta.required && open && (
        <p className="-mt-2 px-5 pb-3 text-xs text-soft">
          Tenhle e-mail se posílá vždy — host v něm dostává údaje k platbě.
        </p>
      )}

      {open && (
        <div className="space-y-4 border-t border-line p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Předmět</span>
            <input
              ref={subjectRef}
              className="field"
              value={cfg.subject}
              maxLength={150}
              onFocus={() => setTarget("subject")}
              onChange={(e) => onChange({ subject: e.target.value })}
            />
          </label>

          <div onFocusCapture={(e) => e.target !== subjectRef.current && setTarget("text")}>
            <span className="mb-1.5 block text-sm font-medium">Text e-mailu</span>
            <RichTextEditor
              key={editorKey}
              value={cfg.text}
              onChange={(text) => onChange({ text })}
              placeholder="Úvodní text e-mailu"
              insertRef={insertText}
            />
            <p className="mt-1.5 text-xs text-soft">
              Pod tvůj text se automaticky doplní: {meta.includes.toLowerCase()}.
            </p>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Vložit údaj z rezervace</span>
            <div className="flex flex-wrap gap-1.5">
              {EMAIL_VARS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // nepřijít o kurzor v textu
                  onClick={() => insertVar(v)}
                  className="rounded-full border border-line bg-bg px-3 py-1 text-xs font-medium text-ink transition hover:border-pine/40"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
          </div>

          {meta.timing && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Odeslat</span>
              <NumberField value={cfg.days} min={0} max={30} onChange={(days) => onChange({ days })} />
              <span className="text-soft">
                {plural(cfg.days, "den", "dny", "dní")} {meta.timing === "before" ? "před příjezdem" : "po odjezdu"} v{" "}
                {SCHEDULED_TIME}
              </span>
            </label>
          )}

          {meta.kind === "thanks" && <ThanksOptions cfg={cfg} onChange={onChange} />}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={onPreview} className="btn-primary !px-5 !py-2 text-sm">
              Náhled e-mailu
            </button>
            {!isDefault && (
              <button
                type="button"
                onClick={() => {
                  onChange(defaults);
                  setEditorKey((k) => k + 1);
                }}
                className="btn-ghost !px-4 !py-2 text-sm"
              >
                Vrátit výchozí text
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ThanksOptions({ cfg, onChange }: { cfg: EmailConfig; onChange: (patch: Partial<EmailConfig>) => void }) {
  const [url, setUrl] = useState(cfg.reviewUrl);
  const urlBad = url.trim() !== "" && !/^https?:\/\/\S+$/i.test(url.trim());
  const d = cfg.discount;
  return (
    <div className="space-y-4 rounded-xl bg-bg p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Sleva na další pobyt</p>
          <p className="text-xs text-soft">
            Každý host dostane vlastní jednorázový kód (např. DIKY-4F7K). Objeví se ve Voucherech.
          </p>
        </div>
        <Switch
          on={d.enabled}
          label="Sleva na další pobyt"
          onChange={(enabled) => onChange({ discount: { ...d, enabled } })}
        />
      </div>
      {d.enabled && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-soft">Sleva</span>
            <NumberField
              value={d.percent}
              min={1}
              max={90}
              onChange={(percent) => onChange({ discount: { ...d, percent } })}
            />
            <span>%</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-soft">Platí</span>
            <NumberField
              value={d.months}
              min={1}
              max={36}
              onChange={(months) => onChange({ discount: { ...d, months } })}
            />
            <span>{plural(d.months, "měsíc", "měsíce", "měsíců")}</span>
          </label>
        </div>
      )}
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Odkaz na recenzi (nepovinné)</span>
        <input
          className="field"
          type="url"
          inputMode="url"
          placeholder="https://g.page/r/…/review"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            const v = e.target.value.trim();
            if (!v || /^https?:\/\/\S+$/i.test(v)) onChange({ reviewUrl: v });
          }}
        />
        <span className={`mt-1 block text-xs ${urlBad ? "text-coral" : "text-soft"}`}>
          {urlBad
            ? "Odkaz musí začínat https:// — jinak se v e-mailu nezobrazí."
            : "Třeba na Google, Booking nebo Airbnb. V e-mailu bude tlačítko „Napsat recenzi“."}
        </span>
      </label>
    </div>
  );
}

/** Malé číselné pole: píše se volně, uloží se jen číslo v rozsahu (po opuštění pole se srovná). */
function NumberField({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="field !w-16 !px-2 !py-1.5 text-center tabular-nums"
      style={{ width: "4rem" }}
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, "").slice(0, 2);
        setText(t);
        const n = Number(t);
        if (t && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        const n = Math.max(min, Math.min(max, Number(text) || min));
        setText(String(n));
        if (n !== value) onChange(n);
      }}
    />
  );
}

function LocksCard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Rozepsané řádky (i prázdné) drží komponenta, uloží se jen vyplněné
  const [rows, setRows] = useState<Lock[]>(() => {
    const saved = parseLocks(value);
    return saved.length ? saved : [{ name: "", code: "" }];
  });
  const commit = (next: Lock[]) => {
    setRows(next);
    onChange(
      JSON.stringify(next.map((l) => ({ name: l.name.trim(), code: l.code.trim() })).filter((l) => l.name || l.code)),
    );
  };
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h3 className="font-semibold">Kódy k zámkům</h3>
        <p className="text-sm text-soft">
          Stálé kódy (vchod, branka, schránka na klíče). Kód zadaný přímo u rezervace má přednost.
        </p>
      </div>
      {rows.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="field min-w-0 flex-1"
            placeholder="Např. Vchod"
            maxLength={40}
            value={l.name}
            onChange={(e) => commit(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
          />
          <input
            className="field tabular-nums"
            style={{ width: "8rem" }}
            placeholder="Kód"
            maxLength={40}
            value={l.code}
            onChange={(e) => commit(rows.map((r, j) => (j === i ? { ...r, code: e.target.value } : r)))}
          />
          <button
            type="button"
            aria-label="Odebrat zámek"
            onClick={() => commit(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ name: "", code: "" }])}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-soft transition hover:bg-bg hover:text-coral"
          >
            ×
          </button>
        </div>
      ))}
      {rows.length < 10 && (
        <button
          type="button"
          onClick={() => setRows([...rows, { name: "", code: "" }])}
          className="text-sm font-medium text-pine hover:underline"
        >
          + Přidat zámek
        </button>
      )}
    </div>
  );
}

function ArrivalCard({ form, set }: { form: Site; set: SetField }) {
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h3 className="font-semibold">Informace k příjezdu</h3>
        <p className="text-sm text-soft">
          Host je dostane v e-mailu před příjezdem — Wi‑Fi a pokyny se na webu neukazují.
        </p>
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-medium">Adresa ubytování</span>
        <AddressInput
          value={form.arrivalAddress}
          onChange={(v) => set("arrivalAddress", v)}
          placeholder="Začni psát adresu — např. Dolní Pertoltice 12"
        />
        <span className="mt-1 block text-xs text-soft">
          V e-mailu před příjezdem bude vždy celá adresa i odkaz na mapu. Jak ji ukázat na webu, nastavíš v Můj web →
          Kde nás najdete.
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Wi‑Fi — název sítě</span>
          <input
            className="field"
            maxLength={100}
            value={form.wifiName}
            onChange={(e) => set("wifiName", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Wi‑Fi — heslo</span>
          <input
            className="field"
            maxLength={100}
            value={form.wifiPassword}
            onChange={(e) => set("wifiPassword", e.target.value)}
          />
        </label>
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-medium">Jak se k nám dostaneš</span>
        <RichTextEditor
          value={form.arrivalInfo}
          onChange={(v) => set("arrivalInfo", v)}
          placeholder="Parkování, kde jsou klíče, jak funguje topení, pravidla domu…"
          collapsible
        />
      </div>
    </div>
  );
}

/* ---------- Náhled ---------- */

/** Datum za `months` měsíců (ISO). */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().slice(0, 10);
}

/** Data pro náhled: nejbližší skutečná rezervace, jinak ukázková. */
function previewData(form: Site, reservations: Reservation[]): { stay: StayMail; accessCode: string } {
  const today = todayISO();
  const r =
    reservations
      .filter((x) => x.status !== "cancelled" && !x.anonymized && x.endDate.slice(0, 10) >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  const start = r?.startDate.slice(0, 10) ?? addDays(today, 14);
  const end = r?.endDate.slice(0, 10) ?? addDays(today, 17);
  const guests = r?.guests ?? 2;
  return {
    accessCode: r?.accessCode ?? "",
    stay: {
      publicId: r?.publicId ?? "K7M2QX",
      siteName: form.name,
      guestName: r?.guestName ?? "Jana Nováková",
      firstName: r?.firstName ?? "Jana",
      email: r?.email ?? "jana@example.com",
      phone: r?.phone ?? "",
      guests,
      guestSummary: `${guests} ${plural(guests, "host", "hosté", "hostů")}`,
      startDate: start,
      endDate: end,
      nights: nightsBetween(new Date(start), new Date(end)),
      total: r?.totalPrice ?? form.pricePerNight * 3,
      discount: r?.discount,
      voucherCode: r?.voucherCode,
      vatRate: r?.vatRate ?? (form.vatPayer ? form.vatRate : 0),
      vatAmount: r?.vatAmount ?? 0,
      paid: false,
      demo: false,
      checkInTime: r?.checkInTime ?? form.checkInTime,
      checkOutTime: r?.checkOutTime ?? form.checkOutTime,
      legal: form.businessName ? { provider: form.businessName } : undefined,
    },
  };
}

function PreviewDialog({ kind, form, onClose }: { kind: EmailKind; form: Site; onClose: () => void }) {
  const { reservations } = useAdminData();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { subject, html } = useMemo(() => {
    const { stay, accessCode } = previewData(form, reservations);
    const settings = parseEmailSettings(form.emailSettings);
    const pay = form.bankAccount ? buildPayment(form.bankAccount, stay.total, form.name, stay.publicId) : null;
    return renderEmail(
      kind,
      form,
      { ...stay, paid: kind === "paid" },
      {
        link: "#",
        payment: pay ? { account: form.bankAccount, vs: pay.vs, amount: stay.total } : null,
        holdUntil: new Date(Date.now() + 24 * 3600_000).toISOString(),
        accessCode,
        voucher: {
          code: "DIKY-4F7K",
          percent: settings.thanks.discount.percent,
          validTo: addMonths(todayISO(), settings.thanks.discount.months),
        },
        unsubscribeUrl: "#",
      },
    );
  }, [kind, form, reservations]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Náhled: ${emailMeta(kind).title}`}
        className="rise flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
        style={{ height: "92dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">Náhled · {emailMeta(kind).title}</p>
            <p className="mt-0.5 truncate font-semibold">{subject}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-soft outline-none transition hover:bg-bg hover:text-ink focus-visible:ring-2 focus-visible:ring-pine/40"
          >
            ×
          </button>
        </div>
        {/* Bez skriptů a odkazů ven — jen vykreslený e-mail */}
        <iframe title="Náhled e-mailu" srcDoc={html} sandbox="" className="min-h-0 w-full flex-1 bg-bg" />
        <p className="border-t border-line px-5 py-3 text-xs text-soft">
          Náhled s údaji z tvé nejbližší rezervace (nebo ukázkovými). Slevový kód je jen ukázka — skutečný se vytvoří
          při odeslání.
        </p>
      </div>
    </div>,
    document.body,
  );
}

