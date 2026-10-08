"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Site } from "@/lib/admin";
import { RichTextEditor } from "@/components/RichTextEditor";
import { htmlToRichText } from "@/lib/richtext";
import { toIBAN, formatIBAN } from "@/lib/payment";
import { DEFAULT_VAT_RATE, cleanVatRate } from "@/lib/vat";
import {
  LEGAL_PATH,
  LEGAL_TITLE,
  hasDoc,
  isValidIco,
  isValidVatId,
  normalizeIco,
  replaceProvider,
  defaultPrivacyText,
  defaultTermsText,
  type LegalKind,
} from "@/lib/legal";

// Záložka „Provozovatel a podmínky" v editoru webu: identifikace podnikatele
// (s doplněním z ARES) a obchodní podmínky + zásady ochrany osobních údajů.

type Toast = { show: (text: string, tone?: "error" | "success") => void };
type Doc = { url: string; name: string; updatedAt: string | null };

export function LegalSettings({
  form,
  saved,
  set,
  setDoc,
  toast,
  requestSave,
}: {
  form: Site;
  /** Uložená verze webu — odkaz „Zobrazit na webu" jen u dokumentu, který už na webu je. */
  saved: Site;
  set: <K extends keyof Site>(key: K, value: Site[K]) => void;
  /** PDF se ukládá hned (mimo „Uložit změny") — změnu propíše do formuláře i uložených dat. */
  setDoc: (kind: LegalKind, doc: Doc | null) => void;
  toast: Toast;
  /** Uložit formulář, až se propíšou právě nastavené hodnoty (Enter v poli IČ). */
  requestSave: () => void;
}) {
  return (
    <>
      <ProviderCard form={form} set={set} requestSave={requestSave} />
      <PaymentCard form={form} set={set} />
      <LegalDocCard
        kind="terms"
        form={form}
        published={hasDoc(saved, "terms")}
        hint="Host je musí odsouhlasit před dokončením rezervace. Odkaz bude i v patičce webu."
        text={form.termsText}
        pdf={form.termsPdf ? { url: form.termsPdf, name: form.termsName, updatedAt: form.termsUpdatedAt } : null}
        onText={(t) => set("termsText", t)}
        defaultText={defaultTermsText(form)}
        setDoc={setDoc}
        toast={toast}
      />
      <LegalDocCard
        kind="privacy"
        form={form}
        published={hasDoc(saved, "privacy")}
        hint="Jak zpracováváš údaje hostů (GDPR). Odkaz se ukáže u rezervace a v patičce webu."
        text={form.privacyText}
        pdf={form.privacyPdf ? { url: form.privacyPdf, name: form.privacyName, updatedAt: form.privacyUpdatedAt } : null}
        onText={(t) => set("privacyText", t)}
        setDoc={setDoc}
        toast={toast}
        defaultText={defaultPrivacyText(form)}
      />
    </>
  );
}

/* ---- Provozovatel ---- */

function ProviderCard({
  form,
  set,
  requestSave,
}: {
  form: Site;
  set: <K extends keyof Site>(key: K, value: Site[K]) => void;
  requestSave: () => void;
}) {
  const [ares, setAres] = useState<{ state: "idle" | "loading" | "done" | "error"; text?: string }>({ state: "idle" });
  const ico = form.businessId.replace(/\s/g, "");
  const icoInvalid = ico.length >= 8 && !isValidIco(ico);
  const dicInvalid = !!form.vatId.trim() && !isValidVatId(form.vatId);
  // Načítání z ARES: kolečko v tlačítku a pulzující pole, kam se údaje doplní
  const loading = ares.state === "loading";
  const filling = loading ? "animate-pulse !bg-line/40" : "";

  async function fromAres(): Promise<boolean> {
    if (!isValidIco(ico)) {
      setAres({ state: "error", text: "Nejdřív vyplň platné IČ (8 číslic)." });
      return false;
    }
    setAres({ state: "loading" });
    const res = await fetch(`/api/ares/${normalizeIco(ico)}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data) {
      setAres({ state: "error", text: data?.error ?? "ARES teď neodpovídá — vyplň údaje ručně." });
      return false;
    }
    set("businessId", data.ico);
    if (data.name) set("businessName", data.name);
    if (data.address) set("businessAddress", data.address);
    set("vatId", data.vatId ?? "");
    setAres({ state: "done", text: "Doplněno z ARES — zkontroluj a ulož." });
    return true;
  }

  // Enter v poli IČ = doplnit z ARES a rovnou uložit
  async function confirmIco(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!isValidIco(ico)) {
      setAres({ state: "error", text: "Tohle IČ není platné — zkontroluj ho." });
      return;
    }
    if (await fromAres()) setAres({ state: "done", text: "Doplněno z ARES a uloženo." });
    requestSave();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="font-display text-lg font-semibold">Provozovatel</h2>
        <p className="text-sm text-soft">
          Kdo ubytování pronajímá. Zákon vyžaduje, aby to hosté na webu viděli — ukáže se v patičce a v podmínkách.
        </p>
      </div>

      <div>
        <label htmlFor="business-id" className="mb-1.5 block text-sm font-medium">
          IČ
        </label>
        <div className="flex items-center gap-2">
          <input
            id="business-id"
            className={`field tabular-nums ${icoInvalid ? "!border-coral" : ""}`}
            // IČ má jen 8 číslic — úzké pole, na malém telefonu se ještě zmenší
            style={{ flex: "0 1 8.5rem", minWidth: "6.5rem" }}
            maxLength={10}
            inputMode="numeric"
            enterKeyHint="done"
            onKeyDown={confirmIco}
            placeholder="12345678"
            value={form.businessId}
            onChange={(e) => {
              set("businessId", e.target.value);
              setAres({ state: "idle" });
            }}
          />
          <button
            type="button"
            className="btn-ghost relative shrink-0 whitespace-nowrap !px-4 text-sm disabled:!opacity-100"
            onClick={fromAres}
            disabled={loading}
            aria-busy={loading}
          >
            {/* Neviditelný text drží šířku, ať tlačítko při načítání neposkočí */}
            <span className={loading ? "invisible" : ""}>Doplnit z ARES</span>
            {loading && (
              <span className="absolute inset-0 flex items-center justify-center gap-2 text-pine">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Hledám…
              </span>
            )}
          </button>
        </div>
        <p className={`mt-1 text-xs ${icoInvalid || ares.state === "error" ? "text-coral" : "text-soft"}`}>
          {icoInvalid
            ? "Tohle IČ není platné — zkontroluj ho."
            : ares.text ?? "Podle IČ doplníme název, sídlo a DIČ z veřejného registru ARES."}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Jméno nebo obchodní firma</span>
        <input
          className={`field ${filling}`}
          placeholder="Jan Novák / Chaty Novák s.r.o."
          value={form.businessName}
          onChange={(e) => set("businessName", e.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Sídlo / místo podnikání</span>
        <input
          className={`field ${filling}`}
          placeholder="Ulice 12, 123 45 Město"
          value={form.businessAddress}
          onChange={(e) => set("businessAddress", e.target.value)}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            DIČ <span className="font-normal text-soft">(jen plátci DPH)</span>
          </span>
          <input
            className={`field ${dicInvalid ? "!border-coral" : ""} ${filling}`}
            placeholder="CZ12345678"
            value={form.vatId}
            onChange={(e) => set("vatId", e.target.value)}
          />
          {dicInvalid && <span className="mt-1 block text-xs text-coral">DIČ má tvar CZ a 8–10 číslic.</span>}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Zápis v rejstříku <span className="font-normal text-soft">(nepovinné)</span>
          </span>
          <input
            className="field"
            placeholder="Zapsán v živnostenském rejstříku"
            value={form.businessRegister}
            onChange={(e) => set("businessRegister", e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

/* ---- Platby a DPH ---- */

// Kontrola pro majitele, že jsme jeho číslo účtu přečetli správně.
function ibanPreview(account: string): string {
  const iban = toIBAN(account);
  return iban ? `Uloží se jako ${formatIBAN(iban)}` : "Tohle číslo účtu neumím přečíst — zkontroluj ho.";
}

function PaymentCard({ form, set }: { form: Site; set: <K extends keyof Site>(key: K, value: Site[K]) => void }) {
  const [lawOpen, setLawOpen] = useState(false);
  const segment = (on: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${on ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"}`;
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      {lawOpen && <VatLawDialog onClose={() => setLawOpen(false)} />}
      <div>
        <h2 className="font-display text-lg font-semibold">Platby a DPH</h2>
        <p className="text-sm text-soft">Kam ti hosté pošlou peníze a jak se u ceny uvádí DPH.</p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Číslo účtu pro QR platbu</span>
        <input
          className="field"
          placeholder="19-2000145399/0800"
          value={form.bankAccount}
          onChange={(e) => set("bankAccount", e.target.value)}
        />
        <span className="mt-1 block text-xs text-soft">
          {form.bankAccount
            ? ibanPreview(form.bankAccount)
            : "Z čísla účtu se hostům u rezervace vytvoří QR kód pro platbu. Bez něj se nabídne jen domluva s tebou."}
        </span>
      </label>

      <div>
        <span className="mb-1.5 block text-sm font-medium">DPH</span>
        <div className="flex max-w-sm rounded-xl border border-line bg-bg p-1" role="radiogroup" aria-label="Plátce DPH">
          {(
            [
              [false, "Neplátce DPH"],
              [true, "Plátce DPH"],
            ] as const
          ).map(([payer, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={form.vatPayer === payer}
              onClick={() => set("vatPayer", payer)}
              className={segment(form.vatPayer === payer)}
            >
              {label}
            </button>
          ))}
        </div>

        {form.vatPayer ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-soft">Sazba</span>
              <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-bg p-1">
                <button
                  type="button"
                  aria-pressed={form.vatRate === DEFAULT_VAT_RATE}
                  onClick={() => set("vatRate", DEFAULT_VAT_RATE)}
                  className={`${segment(form.vatRate === DEFAULT_VAT_RATE)} !flex-none !px-4`}
                >
                  {DEFAULT_VAT_RATE} %
                </button>
                {/* Vlastní sazba — libovolné celé procento */}
                <label className="relative">
                  <span className="sr-only">Jiná sazba DPH v procentech</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={50}
                    placeholder="jiná"
                    value={form.vatRate === DEFAULT_VAT_RATE ? "" : form.vatRate || ""}
                    onChange={(e) => set("vatRate", e.target.value ? Number(e.target.value) : DEFAULT_VAT_RATE)}
                    onBlur={() => set("vatRate", cleanVatRate(form.vatRate))}
                    className={`h-8 w-20 appearance-none rounded-lg border bg-surface pl-3 pr-7 text-sm tabular-nums outline-none transition [-moz-appearance:textfield] focus:border-pine/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                      form.vatRate !== DEFAULT_VAT_RATE ? "border-pine/40 font-medium text-ink" : "border-transparent text-soft"
                    }`}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-soft">%</span>
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLawOpen(true)}
              className="text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:decoration-pine"
            >
              Proč 12 %? Znění zákona
            </button>
            <p className="text-xs text-soft">
              Ubytování má sníženou sazbu 12 %, jinou sazbu napiš do pole vedle. Ceny v ceníku zadávej{" "}
              <strong>včetně DPH</strong> — host vždy vidí konečnou cenu a pod ní „včetně DPH {form.vatRate} %“ s částkou.
            </p>
            {!form.vatId.trim() && (
              <p className="rounded-xl bg-amber/15 px-4 py-2.5 text-sm text-[#92600a]">
                Plátce DPH musí mít vyplněné DIČ — doplň ho výše u provozovatele.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-soft">Hosté u ceny uvidí „Nejsme plátci DPH.“</p>
        )}
      </div>
    </div>
  );
}

/** Výňatek ze zákona o DPH ke snížené sazbě 12 % pro ubytovací služby. */
function VatLawDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const quote = "border-l-2 border-pine/40 bg-bg py-2 pl-4 pr-3 text-sm text-ink";
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sazba DPH u ubytování"
        className="rise flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Sazba DPH u ubytování</h2>
            <p className="mt-0.5 text-xs text-soft">Zákon č. 235/2004 Sb., o dani z přidané hodnoty — znění od 1. 1. 2024</p>
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

        <div className="space-y-4 overflow-y-auto px-5 py-5 text-sm text-soft">
          <p>
            Krátkodobé ubytování hostů (chata, apartmán, pokoj) je <strong className="text-ink">ubytovací služba</strong>.
            Pro ubytovací služby platí <strong className="text-ink">snížená sazba DPH 12 %</strong>.
          </p>

          <div className="space-y-1.5">
            <p className="font-semibold text-ink">§ 47 odst. 1 — sazby daně</p>
            <p className={quote}>
              U zdanitelného plnění nebo přijaté úplaty, ze které vznikne povinnost přiznat daň, se uplatňuje
              <br />a) základní sazba daně ve výši 21 %,
              <br />b) snížená sazba daně ve výši 12 %.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-semibold text-ink">§ 47 odst. 3 — služby se sníženou sazbou</p>
            <p className={quote}>
              U poskytnutí služby se uplatňuje základní sazba daně, pokud není v tomto zákoně stanoveno jinak. U služeb
              uvedených v příloze č. 2 k tomuto zákonu se uplatňuje snížená sazba daně.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-semibold text-ink">Příloha č. 2 — seznam služeb se sníženou sazbou</p>
            <p className={quote}>Ubytovací služby (kód klasifikace CZ-CPA 55)</p>
          </div>

          <p>
            Od 1. 1. 2024 platí jediná snížená sazba 12 % (dřívější dvě snížené sazby se sloučily). Pokud
            k ubytování prodáváš i jiné služby (např. stravování s alkoholem, wellness), mohou mít jinou sazbu.
          </p>

          <p className="rounded-xl bg-amber/15 px-4 py-3 text-xs text-[#92600a]">
            Informace je orientační. V konkrétním případě se poraď s daňovým poradcem nebo účetní.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <a
            href="https://www.zakonyprolidi.cz/cs/2004-235"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-soft underline-offset-2 hover:text-ink hover:underline"
          >
            Celé znění zákona ↗
          </a>
          <button type="button" onClick={onClose} className="btn-ghost !px-5 !py-2 text-sm">
            Zavřít
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ---- Dokument (obchodní podmínky / zásady) ---- */

function LegalDocCard({
  kind,
  form,
  published,
  hint,
  text,
  pdf,
  onText,
  setDoc,
  toast,
  defaultText,
}: {
  kind: LegalKind;
  form: Site;
  published: boolean;
  hint: string;
  text: string;
  pdf: Doc | null;
  onText: (text: string) => void;
  setDoc: (kind: LegalKind, doc: Doc | null) => void;
  toast: Toast;
  /** Výchozí znění (zásady z údajů provozovatele) — platí, dokud majitel nenapíše vlastní. */
  defaultText?: string;
}) {
  const [mode, setMode] = useState<"text" | "file">(pdf ? "file" : "text");
  const [uploading, setUploading] = useState<string | null>(null);
  const [converted, setConverted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const title = LEGAL_TITLE[kind];
  // Bez vlastního textu ukazuje editor výchozí znění (pokud ho dokument má)
  const usingDefault = !!defaultText && !text.trim();
  const shown = usingDefault ? defaultText! : text;

  async function onFile(file: File) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".docx")) return convertWord(file);
    if (name.endsWith(".doc")) {
      toast.show("Starý formát .doc neumím převést — ulož dokument ve Wordu jako .docx nebo PDF.");
      return;
    }
    if (file.type !== "application/pdf" && !name.endsWith(".pdf")) {
      toast.show("Nahraj PDF nebo Word (.docx).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.show("Soubor je větší než 10 MB.");
      return;
    }
    // Název souboru se ukáže hned, nahrává se na pozadí
    const before = pdf;
    setUploading(file.name);
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    const res = await fetch(`/api/sites/${form.slug}/documents`, { method: "POST", body }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setUploading(null);
    if (!res?.ok || !data?.url) {
      setDoc(kind, before);
      toast.show(data?.error ?? "Soubor se nepodařilo nahrát, zkus to znovu.");
      return;
    }
    setDoc(kind, { url: data.url, name: data.name, updatedAt: data.updatedAt });
    toast.show(`${title} jsou nahrané a platí na webu.`, "success");
  }

  async function convertWord(file: File) {
    if (text.trim() && !confirm("Převedený Word nahradí současný text. Pokračovat?")) return;
    try {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      const converted = htmlToRichText(value);
      if (!converted.trim()) throw new Error("empty");
      onText(converted);
      setMode("text");
      setConverted(true);
    } catch {
      toast.show("Word se nepodařilo převést. Zkus ho uložit jako PDF.");
    }
  }

  async function removePdf() {
    if (!pdf || !confirm(`Odebrat PDF s dokumentem ${title.toLowerCase()} z webu?`)) return;
    setDoc(kind, null);
    const res = await fetch(`/api/sites/${form.slug}/documents?kind=${kind}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setDoc(kind, pdf);
      toast.show("PDF se nepodařilo odebrat, zkus to znovu.");
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="text-sm text-soft">{hint}</p>
        </div>
        {published && (
          <a
            href={`/w/${form.slug}/${LEGAL_PATH[kind]}`}
            target="_blank"
            className="text-sm font-medium text-pine underline decoration-line underline-offset-4"
          >
            Zobrazit na webu ↗
          </a>
        )}
      </div>

      <div className="inline-flex rounded-xl border border-line bg-bg p-1" role="radiogroup" aria-label={`${title}: způsob`}>
        {(
          [
            ["text", "Napsat text"],
            ["file", "Nahrát soubor"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              mode === m ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />

      {mode === "file" ? (
        <div className="space-y-3">
          {uploading || pdf ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-bg px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">📄 {uploading ?? (pdf?.name || "dokument.pdf")}</p>
                <p className="text-xs text-soft">
                  {uploading
                    ? "Nahrávám…"
                    : pdf?.updatedAt
                      ? `Platné od ${new Date(pdf.updatedAt).toLocaleDateString("cs-CZ")}`
                      : "Nahráno"}
                </p>
              </div>
              {!uploading && pdf && (
                <div className="flex gap-3 text-sm">
                  <a href={pdf.url} target="_blank" className="font-medium text-pine hover:underline">
                    Zobrazit
                  </a>
                  <button type="button" className="font-medium text-soft hover:text-ink" onClick={() => fileRef.current?.click()}>
                    Nahradit
                  </button>
                  <button type="button" className="font-medium text-soft hover:text-coral" onClick={removePdf}>
                    Odebrat
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-line px-4 py-8 text-center transition hover:border-pine/40 hover:bg-bg"
            >
              <span className="text-sm font-semibold">Vybrat PDF nebo Word</span>
              <span className="text-xs text-soft">PDF se ukáže hostům tak, jak je. Word převedeme na text, který můžeš upravit.</span>
            </button>
          )}
          <p className="text-xs text-soft">PDF má přednost před napsaným textem. Ukládá se hned po nahrání.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pdf && (
            <p className="rounded-xl bg-amber/15 px-4 py-3 text-sm text-[#92600a]">
              Na webu se teď ukazuje nahrané PDF. Text se použije, až PDF odebereš (v „Nahrát soubor").
            </p>
          )}
          {converted && (
            <p className="rounded-xl bg-pine/10 px-4 py-3 text-sm text-pine">
              Převedeno z Wordu — zkontroluj formátování a ulož změny.
            </p>
          )}
          {usingDefault && (
            <p className="text-xs text-soft">
              <strong className="text-pine">Výchozí znění</strong> — aktualizuje se samo podle údajů webu. Když ho
              upravíš, uloží se tvoje verze.
            </p>
          )}
          {defaultText === "" && !text.trim() && (
            <p className="rounded-xl bg-bg px-4 py-3 text-sm text-soft">
              Vyplň výše provozovatele (jméno a IČ) — zásady se podle něj připraví samy.
            </p>
          )}
          <RichTextEditor
            value={shown}
            onChange={onText}
            placeholder={`Sem napiš ${title.toLowerCase()}…`}
            collapsible
            forceExpanded={converted}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <button type="button" className="font-medium text-pine hover:underline" onClick={() => fileRef.current?.click()}>
              Převést z Wordu (.docx)
            </button>
            {!!defaultText && !usingDefault && (
              <button
                type="button"
                className="font-medium text-pine hover:underline"
                onClick={() => {
                  if (!confirm("Tvoje úpravy se zahodí a použije se výchozí znění. Pokračovat?")) return;
                  onText("");
                  setConverted(false);
                }}
              >
                Obnovit výchozí znění
              </button>
            )}
          </div>
          {defaultText !== undefined && (
            <p className="text-xs text-soft">
              Výchozí znění je obecné — zkontroluj, že odpovídá tomu, jak s údaji hostů opravdu zacházíš.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Potvrzení po změně IČ ---- */

/** Co se po změně IČ propsalo samo a co je potřeba upravit ručně. */
export type ProviderChange = {
  ico: string;
  name: string;
  /** Dokument nahraný jako PDF — do souboru se zapisovat nedá. */
  termsPdf: boolean;
  privacyPdf: boolean;
  /** Platby přes Stripe — faktury vystavuje Stripe s vlastními firemními údaji. */
  stripe: boolean;
};

export function providerChangeOf(before: Site, after: Site): ProviderChange | null {
  const ico = normalizeIco(after.businessId.trim());
  if (!ico || ico === normalizeIco(before.businessId.trim())) return null;
  return {
    ico,
    name: after.businessName.trim(),
    termsPdf: !!after.termsPdf,
    privacyPdf: !!after.privacyPdf,
    stripe: after.paymentMode === "stripe" || after.paymentMode === "both",
  };
}

/** Nové údaje provozovatele se propíšou i do vlastního znění podmínek a zásad. */
export function withProviderInDocs(before: Site, after: Site): Site {
  return {
    ...after,
    termsText: after.termsText && replaceProvider(after.termsText, before, after),
    privacyText: after.privacyText && replaceProvider(after.privacyText, before, after),
  };
}

export function ProviderSavedDialog({ change, onClose }: { change: ProviderChange; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updated = [
    "patička webu (údaje o provozovateli)",
    !change.termsPdf && "obchodní podmínky",
    !change.privacyPdf && "zásady ochrany osobních údajů",
    "stránky rezervací a potvrzovací e-maily hostům",
  ].filter(Boolean) as string[];
  const manual = [
    change.termsPdf && "Obchodní podmínky máš nahrané jako PDF — do souboru zapsat nejde, nahraj novou verzi.",
    change.privacyPdf && "Zásady ochrany osobních údajů máš nahrané jako PDF — do souboru zapsat nejde, nahraj novou verzi.",
    change.stripe &&
      "Faktury posílá Stripe s vlastními firemními údaji — nové IČ uprav i ve Stripe (Nastavení → Údaje o firmě).",
  ].filter(Boolean) as string[];

  // Do <body>: předek s CSS transformací by jinak rozbil `fixed` překryv.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nové IČ je uložené"
        className="rise w-full max-w-md rounded-t-3xl bg-surface p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-center rounded-full bg-pine/10 text-xl text-pine"
          style={{ width: 44, height: 44 }}
          aria-hidden
        >
          ✓
        </div>
        <h2 className="mt-3 font-display text-xl font-semibold">Nové IČ je uložené</h2>
        <p className="mt-1 text-sm text-soft">
          IČ <strong className="text-ink">{change.ico}</strong>
          {change.name && <> ({change.name})</>} se propsalo do:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {updated.map((u) => (
            <li key={u} className="flex gap-2">
              <span className="text-pine">✓</span>
              {u}
            </li>
          ))}
        </ul>
        {manual.length > 0 && (
          <div className="mt-4 space-y-2 rounded-xl bg-amber/15 px-4 py-3 text-sm text-[#92600a]">
            <p className="font-semibold">Uprav ještě ručně:</p>
            {manual.map((m) => (
              <p key={m}>• {m}</p>
            ))}
          </div>
        )}
        <button ref={okRef} type="button" className="btn-primary mt-5 w-full !py-2.5" onClick={onClose}>
          Rozumím
        </button>
      </div>
    </div>,
    document.body
  );
}
