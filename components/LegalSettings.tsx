"use client";

import { useRef, useState } from "react";
import type { Site } from "@/lib/admin";
import { RichTextEditor } from "@/components/RichTextEditor";
import { htmlToRichText } from "@/lib/richtext";
import {
  LEGAL_PATH,
  LEGAL_TITLE,
  hasDoc,
  isValidIco,
  isValidVatId,
  normalizeIco,
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
}: {
  form: Site;
  /** Uložená verze webu — odkaz „Zobrazit na webu" jen u dokumentu, který už na webu je. */
  saved: Site;
  set: <K extends keyof Site>(key: K, value: Site[K]) => void;
  /** PDF se ukládá hned (mimo „Uložit změny") — změnu propíše do formuláře i uložených dat. */
  setDoc: (kind: LegalKind, doc: Doc | null) => void;
  toast: Toast;
}) {
  return (
    <>
      <ProviderCard form={form} set={set} />
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

function ProviderCard({ form, set }: { form: Site; set: <K extends keyof Site>(key: K, value: Site[K]) => void }) {
  const [ares, setAres] = useState<{ state: "idle" | "loading" | "done" | "error"; text?: string }>({ state: "idle" });
  const ico = form.businessId.replace(/\s/g, "");
  const icoInvalid = ico.length >= 8 && !isValidIco(ico);
  const dicInvalid = !!form.vatId.trim() && !isValidVatId(form.vatId);

  async function fromAres() {
    if (!isValidIco(ico)) {
      setAres({ state: "error", text: "Nejdřív vyplň platné IČ (8 číslic)." });
      return;
    }
    setAres({ state: "loading" });
    const res = await fetch(`/api/ares/${normalizeIco(ico)}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data) {
      setAres({ state: "error", text: data?.error ?? "ARES teď neodpovídá — vyplň údaje ručně." });
      return;
    }
    set("businessId", data.ico);
    if (data.name) set("businessName", data.name);
    if (data.address) set("businessAddress", data.address);
    set("vatId", data.vatId ?? "");
    setAres({ state: "done", text: "Doplněno z ARES — zkontroluj a ulož." });
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
        <div className="flex flex-wrap gap-2">
          <input
            id="business-id"
            className={`field max-w-48 ${icoInvalid ? "!border-coral" : ""}`}
            inputMode="numeric"
            placeholder="12345678"
            value={form.businessId}
            onChange={(e) => {
              set("businessId", e.target.value);
              setAres({ state: "idle" });
            }}
          />
          <button type="button" className="btn-ghost !px-4 text-sm" onClick={fromAres} disabled={ares.state === "loading"}>
            {ares.state === "loading" ? "Hledám v ARES…" : "Doplnit z ARES"}
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
          className="field"
          placeholder="Jan Novák / Chaty Novák s.r.o."
          value={form.businessName}
          onChange={(e) => set("businessName", e.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Sídlo / místo podnikání</span>
        <input
          className="field"
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
            className={`field ${dicInvalid ? "!border-coral" : ""}`}
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
            <p className="rounded-xl bg-pine/10 px-4 py-3 text-sm text-pine">
              <strong>Výchozí znění</strong> — připravili jsme ho z údajů provozovatele a nastavení webu a samo se podle
              nich aktualizuje.
              Na webu platí hned, jak uložíš provozovatele. Když text upravíš, uloží se tvoje vlastní verze.
            </p>
          )}
          {defaultText === "" && !text.trim() && (
            <p className="rounded-xl bg-bg px-4 py-3 text-sm text-soft">
              Vyplň výše provozovatele (jméno a IČ) — zásady se podle něj připraví samy.
            </p>
          )}
          <RichTextEditor value={shown} onChange={onText} placeholder={`Sem napiš ${title.toLowerCase()}…`} />
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
