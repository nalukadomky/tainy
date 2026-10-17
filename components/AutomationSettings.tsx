"use client";

import { providerLine, providerShort } from "@/lib/legal";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminData, type Reservation, type Site } from "@/lib/admin";
import {
  EMAIL_KINDS,
  EMAIL_VARS,
  SCHEDULED_TIME,
  defaultsOf,
  parseEmailSettings,
  parseLocks,
  handoverOf,
  type LockType,
  renderEmailParts,
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
import { EmailCanvas, EmailTextEditor, SubjectField } from "@/components/EmailEditor";
import { AddressInput } from "@/components/AddressInput";
import { Icon } from "@/components/Icon";
import { KeyIcon } from "@/components/AccessCode";
import { HelpTip } from "@/components/HelpTip";

// Nastavení → Automatizace: e-maily hostům (informativní / komerční / pro tebe),
// kódy k zámkům a informace k příjezdu. Ukládá se společným tlačítkem editoru.

type SetField = <K extends keyof Site>(key: K, value: Site[K]) => void;

export function AutomationSettings({ form, set }: { form: Site; set: SetField }) {
  const settings = useMemo(() => parseEmailSettings(form.emailSettings), [form.emailSettings]);
  const update = (kind: EmailKind, patch: Partial<EmailConfig>) =>
    set("emailSettings", serializeEmailSettings({ ...settings, [kind]: { ...settings[kind], ...patch } }));
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
        form={form}
        onChange={(patch) => update(m.kind, patch)}
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
        Tady nastavíš, co hostům chodí e-mailem. E-mail upravíš přímo v jeho podobě. Hned po rezervaci už se posílá
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
        <KeysCard
          value={form.locks}
          handover={form.keyHandover}
          onChange={(locks, handover) => {
            set("locks", locks);
            if (handover !== form.keyHandover) set("keyHandover", handover);
          }}
        />
        <ArrivalCard form={form} set={set} />
      </Section>

      <Section
        title="Check-in a kniha ubytovaných"
        hint={`Host vyplní údaje za všechny osoby online — odkaz dostane v e-mailu Check-in před příjezdem${
          settings.checkin.enabled ? ` (${settings.checkin.days} ${plural(settings.checkin.days, "den", "dny", "dní")} předem)` : ", ten je teď vypnutý"
        } a najde ho i na stránce rezervace.`}
      >
        <CheckinSettings form={form} set={set} />
      </Section>
    </div>
  );
}

function CheckinSettings({ form, set }: { form: Site; set: SetField }) {
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">Online check-in</p>
          <p className="text-sm text-soft">
            Údaje se ukládají šifrovaně a najdeš je v Rezervacích → Kniha ubytovaných. Ručně je doplníš v detailu rezervace.
          </p>
        </div>
        <Switch on={form.checkinEnabled} label="Online check-in" onChange={(on) => set("checkinEnabled", on)} />
      </div>
      {form.checkinEnabled && (
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--pine)]"
            checked={form.checkinReminder}
            onChange={(e) => set("checkinReminder", e.target.checked)}
          />
          Když host nevyplní všechny osoby, připomenout mu to ráno v den příjezdu
        </label>
      )}
      <div id="pole-ubyport" className="scroll-mt-24 space-y-3 border-t border-line pt-4">
        <div>
          <p className="font-semibold">Hlášení cizinců (Ubyport)</p>
          <p className="text-sm text-soft">
            Cizince musíš do 3 pracovních dnů nahlásit cizinecké policii. V Knize ubytovaných pro ně vytvoříme soubor k nahrání na
            ubyport.policie.cz. Identifikátor a zkratku ti přidělí policie při registraci do Ubyportu.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Identifikátor ubytovatele (IDUB)</span>
            <input className="field" value={form.ubyportIdub} maxLength={20} onChange={(e) => set("ubyportIdub", e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Zkratka ubytovatele</span>
            <input className="field" value={form.ubyportAbbr} maxLength={10} onChange={(e) => set("ubyportAbbr", e.target.value)} />
          </label>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="font-display text-xl font-semibold flex flex-wrap items-center">
          {title}
          <HelpTip>{hint}</HelpTip>
        </h2>
      </div>
      {children}
    </section>
  );
}

export function Switch({
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
  form,
  onChange,
}: {
  meta: EmailMeta;
  formal: boolean;
  cfg: EmailConfig;
  form: Site;
  onChange: (patch: Partial<EmailConfig>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex items-start gap-3 p-5">
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${cfg.enabled ? "" : "text-soft"}`}>{meta.title}</span>
            <span className="rounded-full bg-bg px-2.5 py-0.5 text-[11px] font-semibold text-soft">
              {whenLabel(meta, cfg)}
            </span>
          </span>
          <span className="mt-1 block text-sm text-soft">{meta.includes}</span>
          <span className="mt-2 block text-sm font-medium text-pine">Upravit e-mail →</span>
        </button>
        <Switch
          on={cfg.enabled}
          disabled={meta.required}
          label={meta.required ? `${meta.title} — posílá se vždy` : meta.title}
          onChange={(enabled) => onChange({ enabled })}
        />
      </div>
      {open && (
        <EmailDialog meta={meta} formal={formal} cfg={cfg} form={form} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/** Okno s e-mailem v jeho skutečné podobě — upravuje se předmět a průvodní text. */
function EmailDialog({
  meta,
  formal,
  cfg,
  form,
  onChange,
  onClose,
}: {
  meta: EmailMeta;
  formal: boolean;
  cfg: EmailConfig;
  form: Site;
  onChange: (patch: Partial<EmailConfig>) => void;
  onClose: () => void;
}) {
  const { reservations } = useAdminData();
  const insertText = useRef<((text: string) => void) | null>(null);
  const subjectRef = useRef<HTMLTextAreaElement>(null);
  // Proměnná se vloží tam, kde byl kurzor naposledy — do předmětu, nebo do textu
  const [target, setTarget] = useState<"subject" | "text">("text");
  const [filled, setFilled] = useState(false);
  const defaults = defaultsOf(meta, formal);
  const isDefault = cfg.subject === defaults.subject && cfg.text === defaults.text;
  // Po „Vrátit výchozí“ se editor znovu vytvoří s výchozím textem
  const [editorKey, setEditorKey] = useState(0);
  const parts = useMemo(() => sampleParts(meta.kind, form, reservations), [meta.kind, form, reservations]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

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

  // Do <body>: předek s CSS transformací by jinak rozbil `fixed` překryv.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`E-mail: ${meta.title}`}
        className="rise flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold leading-tight">{meta.title}</h2>
            <p className="mt-0.5 text-sm text-soft">
              {whenLabel(meta, cfg)}
              {meta.required && " · posílá se vždy, host v něm dostává údaje k platbě"}
            </p>
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-5">
          <div>
            <div className="flex items-start gap-3 rounded-t-2xl border border-line bg-white px-4 py-3 text-sm">
              <span className="w-16 shrink-0 py-0.5 text-soft">Předmět</span>
              {filled ? (
                <span className="min-w-0 flex-1 px-1 py-0.5 font-semibold leading-snug">{parts.subject}</span>
              ) : (
                <SubjectField
                  value={cfg.subject}
                  onChange={(subject) => onChange({ subject })}
                  inputRef={subjectRef}
                  onFocus={() => setTarget("subject")}
                />
              )}
            </div>
            <EmailCanvas
              body={parts.body}
              intro={
                filled ? (
                  // Naše vlastní HTML (text majitele je ošetřený v renderEmailParts)
                  <div className="mail-edit is-static">
                    <div className="email-editor" dangerouslySetInnerHTML={{ __html: parts.intro }} />
                  </div>
                ) : (
                  <EmailTextEditor
                    key={editorKey}
                    value={cfg.text}
                    onChange={(text) => onChange({ text })}
                    insertRef={insertText}
                    onFocus={() => setTarget("text")}
                  />
                )
              }
            />
          </div>

          {filled ? (
            <p className="px-1 text-sm text-soft">
              Takhle e-mail uvidí host — s údaji z tvé nejbližší rezervace (nebo ukázkovými). Slevový kód je jen ukázka.
            </p>
          ) : (
            <div className="px-1">
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
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {meta.timing && (
            <label className="flex flex-wrap items-center gap-2 px-1 text-sm">
              <span className="font-medium">Odeslat</span>
              <NumberField value={cfg.days} min={0} max={30} onChange={(days) => onChange({ days })} />
              <span className="text-soft">
                {plural(cfg.days, "den", "dny", "dní")} {meta.timing === "before" ? "před příjezdem" : "po odjezdu"} v{" "}
                {SCHEDULED_TIME}
              </span>
            </label>
          )}

          {meta.kind === "thanks" && <ThanksOptions cfg={cfg} onChange={onChange} />}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line px-5 py-3.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Switch on={filled} label="Ukázat s údaji rezervace" onChange={setFilled} />
            <span>Ukázat s údaji rezervace</span>
          </label>
          {!isDefault && (
            <button
              type="button"
              onClick={() => {
                onChange(defaults);
                setEditorKey((k) => k + 1);
              }}
              className="text-sm text-soft underline underline-offset-2 hover:text-ink"
            >
              Vrátit výchozí text
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-primary ml-auto !px-6 !py-2 text-sm">
            Hotovo
          </button>
        </div>
      </div>
    </div>,
    document.body,
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

const KEY_TYPES: Record<LockType, string> = { code: "Elektronický zámek", box: "Schránka na klíče", key: "Fyzický klíč" };

/** Schránka na klíče (malý trezor s klávesnicí) */
function BoxIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 8h.01M12 8h.01M15 8h.01M9 11h.01M12 11h.01M15 11h.01M10 16h4" />
    </svg>
  );
}

const TypeIcon = ({ type, className }: { type: LockType; className: string }) =>
  type === "code" ? <Icon name="lock" size={14} className={className} /> : type === "box" ? <BoxIcon className={`h-3.5 w-3.5 ${className}`} /> : <KeyIcon className={`h-3.5 w-3.5 ${className}`} />;

const emptyLock = (type: LockType): Lock => ({ type, mode: "fixed", name: "", code: "", note: "" });

/**
 * Klíče a přístup: libovolná kombinace elektronických zámků a fyzických klíčů.
 * Zámek má stálý kód (zadá se tady), nebo kód pro každého hosta (přidělí se
 * u rezervace). Fyzický klíč má pokyn, kde si ho host vyzvedne. Všechno odejde
 * v e-mailu Před příjezdem. keyHandover se odvodí samo (jen fyzické klíče = "key").
 */
function KeysCard({ value, handover, onChange }: { value: string; handover: string; onChange: (locks: string, handover: "code" | "key") => void }) {
  // Rozepsané řádky (i prázdné) drží komponenta, uloží se jen vyplněné
  const [rows, setRows] = useState<Lock[]>(() => parseLocks(value));
  const commit = (next: Lock[]) => {
    setRows(next);
    const clean = parseLocks(JSON.stringify(next));
    onChange(JSON.stringify(clean), handoverOf(clean, handover));
  };
  const update = (i: number, patch: Partial<Lock>) => commit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // Nový prázdný řádek se neuloží, dokud se nevyplní — „pro každého hosta“ se ale uloží hned
  const add = (type: LockType) => setRows([...rows, emptyLock(type)]);
  const full = rows.length >= 10;

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Klíče a přístup</h3>
          <p className="text-sm text-soft">Jak se host dostane dovnitř. Všechno mu pošleme v e-mailu Před příjezdem.</p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          {(
            [
              ["code", "Zámek"],
              ["box", "Schránka"],
              ["key", "Klíč"],
            ] as const
          ).map(([type, short]) => (
            <button
              key={type}
              type="button"
              disabled={full}
              onClick={() => add(type)}
              aria-label={`Přidat: ${KEY_TYPES[type].toLowerCase()}`}
              className="btn-ghost !gap-1.5 !px-2 !py-2 text-sm disabled:opacity-40 sm:!px-3.5"
            >
              <span className="text-base leading-none text-pine">+</span>
              <TypeIcon type={type} className="text-pine max-sm:hidden" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{KEY_TYPES[type]}</span>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-soft">
          {handover === "key"
            ? "Klíče předáváš osobně. Přidej klíč nebo zámek, ať host ví, jak se dostane dovnitř."
            : "Zatím žádný zámek ani klíč — kód k zámku přidělíš u každé rezervace."}
        </p>
      )}

      {rows.map((l, i) => (
        <div key={i} className="space-y-2.5 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pine/10 text-pine">
                <TypeIcon type={l.type} className="" />
              </span>
              {KEY_TYPES[l.type]}
            </span>
            <button
              type="button"
              aria-label={`Odebrat ${KEY_TYPES[l.type].toLowerCase()}`}
              onClick={() => commit(rows.filter((_, j) => j !== i))}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-soft transition hover:bg-bg hover:text-coral"
            >
              ×
            </button>
          </div>

          {l.type !== "key" ? (
            <>
              <div className="flex rounded-xl bg-bg p-1 text-sm" role="radiogroup" aria-label="Kód k zámku">
                {(
                  [
                    ["fixed", "Stálý kód"],
                    ["stay", "Pro každého hosta"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={l.mode === m}
                    onClick={() => update(i, { mode: m })}
                    className={`flex-1 rounded-lg px-3 py-1.5 font-medium transition ${l.mode === m ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="field min-w-0 flex-1"
                  placeholder={l.type === "box" ? "Např. Schránka u dveří" : "Např. Vchod, branka"}
                  aria-label={l.type === "box" ? "Název schránky" : "Název zámku"}
                  maxLength={40}
                  value={l.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                {l.mode === "fixed" && (
                  <input
                    className="field shrink-0 tabular-nums"
                    style={{ width: "8rem" }}
                    placeholder="Kód"
                    aria-label="Kód"
                    maxLength={40}
                    value={l.code}
                    onChange={(e) => update(i, { code: e.target.value })}
                  />
                )}
              </div>
              {l.type === "box" && (
                <input
                  className="field"
                  placeholder="Kde je — např. vlevo od vchodových dveří"
                  aria-label="Kde je schránka"
                  maxLength={200}
                  value={l.note}
                  onChange={(e) => update(i, { note: e.target.value })}
                />
              )}
              <p className="text-xs text-soft">
                {l.mode === "fixed"
                  ? "Stejný kód dostane každý host."
                  : "Každý host dostane vlastní kód — přidělíš ho u rezervace a připomeneme ti ho před příjezdem."}
              </p>
            </>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <input
                className="field"
                placeholder="Např. Klíč od chaty"
                aria-label="Název klíče"
                maxLength={40}
                value={l.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <input
                className="field"
                placeholder="Kde je — např. ve schránce u branky"
                aria-label="Kde si host klíč vyzvedne"
                maxLength={200}
                value={l.note}
                onChange={(e) => update(i, { note: e.target.value })}
              />
            </div>
          )}
        </div>
      ))}
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
      legal: form.businessName ? { provider: providerLine(form), short: providerShort(form), address: form.businessAddress } : undefined,
    },
  };
}

/** E-mail vykreslený s údaji nejbližší rezervace (nebo ukázkovými) — pro editor. */
function sampleParts(kind: EmailKind, form: Site, reservations: Reservation[]) {
  const { stay, accessCode } = previewData(form, reservations);
  const settings = parseEmailSettings(form.emailSettings);
  const pay = form.bankAccount ? buildPayment(form.bankAccount, stay.total, form.name, stay.publicId) : null;
  return renderEmailParts(
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
}
