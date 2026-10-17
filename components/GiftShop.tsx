"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { GiftVoucherCard } from "@/components/GiftVoucherCard";
import { czk } from "@/lib/pricing";
import { giftHeadline, isFullName, isLikelyEmail, type GiftDesign } from "@/lib/gift";
import type { LegalKind } from "@/lib/legal";
import { LegalModal, type LegalDocData } from "@/components/LegalModal";
import { PhoneInput, isPhoneComplete } from "@/components/PhoneInput";

/** Věnování se na poukaz vejde na max. 4 řádky (zhruba do půlky karty). */
const DEDICATION_MAX = 140;
const EMAIL_BAD = "E-mail není správně vyplněný — zkontroluj ho, ať ti poukaz dorazí.";

// Dárkové poukazy na webu ubytování: nabídka a objednávka. Kupující vyplní,
// pro koho je poukaz a věnování (hned je vidí na poukazu), a kam ho poslat.
// Po objednání přejde na stránku s platbou QR kódem (/darek/…). Ve widgetu
// (embed) zůstává v okně nad webem majitele a podmínky otevírá v okně.

export type ShopOffer = GiftDesign & { id: string };

type Props = {
  siteName: string;
  offers: ShopOffer[];
  base: string; // „/adresa“ nebo „“ na vlastní doméně
  hasTerms: boolean;
  hasPrivacy: boolean;
  /** Ve widgetu na cizím webu: objednávka zůstane v okně, podmínky přes onOpenDoc. */
  embed?: boolean;
  onOpenDoc?: (kind: LegalKind) => void;
  /** Obsah podmínek a zásad — otevřou se v okně nad stránkou (bez onOpenDoc). */
  docs?: Partial<Record<LegalKind, LegalDocData>>;
  slug?: string;
  provider?: string;
};

export function GiftShop({ siteName, offers, base, hasTerms, hasPrivacy, embed, onOpenDoc, docs, slug, provider }: Props) {
  const [docOpen, setDocOpen] = useState<LegalKind | null>(null);
  const openDoc = onOpenDoc ?? (docs ? setDocOpen : undefined);
  const doc = docOpen ? docs?.[docOpen] : undefined;
  const [pick, setPick] = useState<string | null>(offers.length === 1 ? offers[0].id : null);
  const offer = offers.find((o) => o.id === pick) ?? null;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
      {docOpen && doc && <LegalModal kind={docOpen} doc={doc} slug={slug} provider={provider} onClose={() => setDocOpen(null)} />}
      {!offer ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Dárkové poukazy</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Darujte pobyt v {siteName}</h1>
          <p className="mt-2 max-w-xl text-soft">
            Zaplatíte převodem přes QR kód a poukaz vám přijde e-mailem — k vytištění nebo poslání dál. Obdarovaný si termín vybere sám.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => (
              <button key={o.id} type="button" onClick={() => setPick(o.id)} className="group block text-left">
                <div className="transition group-hover:-translate-y-1">
                  <GiftVoucherCard d={o} site={siteName} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold">{giftHeadline(o)}</span>
                    <span className="block text-sm text-soft">
                      {o.kind === "weekend" ? "víkend pá–ne" : "na libovolný pobyt"} · platí {o.validMonths} měsíců
                    </span>
                  </span>
                  <span className="btn-primary shrink-0 !px-4 !py-2 text-sm">Koupit · {czk(o.price)}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <Order offer={offer} siteName={siteName} base={base} hasTerms={hasTerms} hasPrivacy={hasPrivacy} embed={embed} onOpenDoc={openDoc} onBack={offers.length > 1 ? () => setPick(null) : undefined} />
      )}
    </main>
  );
}

function Order({
  offer,
  siteName,
  base,
  hasTerms,
  hasPrivacy,
  embed,
  onOpenDoc,
  onBack,
}: {
  offer: ShopOffer;
  siteName: string;
  base: string;
  hasTerms: boolean;
  hasPrivacy: boolean;
  embed?: boolean;
  onOpenDoc?: (kind: LegalKind) => void;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [recipient, setRecipient] = useState("");
  const [dedication, setDedication] = useState("");
  // Bez věnování: na poukazu nebude ani text, který majitel předvyplnil
  const [noMessage, setNoMessage] = useState(false);
  // Bez jména: poukaz nebude nikomu konkrétnímu určený
  const [noRecipient, setNoRecipient] = useState(false);
  const who = noRecipient ? "" : recipient.trim();
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  // E-mail se kontroluje po opuštění pole; při opravě chyba hned zmizí
  const [emailBad, setEmailBad] = useState(false);
  const [buyerStreet, setBuyerStreet] = useState("");
  const [buyerCity, setBuyerCity] = useState("");
  const [buyerZip, setBuyerZip] = useState("");
  const [terms, setTerms] = useState(false);
  // Krok 1: co bude na poukazu, krok 2: údaje kupujícího a objednání (formulář se tak neroztáhne)
  const [step, setStep] = useState<1 | 2>(1);
  const [company, setCompany] = useState(""); // past na roboty
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [sending, setSending] = useState(false);

  const preview: GiftDesign = {
    ...offer,
    recipient: who,
    message: noMessage ? "" : dedication.trim() || offer.message,
  };
  const bad = (f: string) => (error?.field === f ? "!border-coral ring-2 ring-coral/15" : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1) {
      setError(null);
      setStep(2);
      return;
    }
    if (!isFullName(buyerName)) return setError({ text: "Doplň jméno i příjmení.", field: "buyerName" });
    if (!isLikelyEmail(buyerEmail)) {
      setEmailBad(true);
      return setError({ text: EMAIL_BAD, field: "buyerEmail" });
    }
    if (!isPhoneComplete(buyerPhone)) return setError({ text: "Zkontroluj telefon.", field: "buyerPhone" });
    if (buyerStreet.trim().length < 3) return setError({ text: "Doplň ulici a číslo domu.", field: "buyerStreet" });
    if (buyerCity.trim().length < 2) return setError({ text: "Doplň město.", field: "buyerCity" });
    if (!/\d/.test(buyerZip) || buyerZip.trim().length < 3) return setError({ text: "Zkontroluj PSČ.", field: "buyerZip" });
    if (!terms) return setError({ text: "Potvrď prosím souhlas s podmínkami.", field: "terms" });
    setError(null);
    setSending(true);
    const res = await fetch("/api/gift-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerId: offer.id, recipient: who, dedication: noMessage ? "" : dedication, noMessage, buyerName, buyerEmail, buyerPhone, buyerStreet, buyerCity, buyerZip, terms, company }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.token) {
      setSending(false);
      return setError({ text: data?.error ?? "Objednávku se nepodařilo odeslat. Zkus to prosím znovu.", field: data?.field });
    }
    // Ve widgetu: okno nad webem (?embed=1), nebo sekce ve stránce (?embed=sekce)
    const inline = embed && new URLSearchParams(window.location.search).get("inline") === "1";
    router.push(`/darek/${data.token}${embed ? `?embed=${inline ? "sekce" : "1"}` : ""}`);
  }

  const doc = (path: string, label: string) =>
    onOpenDoc ? (
      <button type="button" onClick={() => onOpenDoc(path === "podminky" ? "terms" : "privacy")} className="underline underline-offset-2 hover:text-ink">
        {label}
      </button>
    ) : (
    <a href={`${base}/${path}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
      {label}
    </a>
    );

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-24">
        {onBack && (
          <button type="button" onClick={onBack} className="mb-4 text-sm font-medium text-soft hover:text-ink">
            ← Všechny poukazy
          </button>
        )}
        <GiftVoucherCard d={preview} site={siteName} />
        <ul className="mt-5 space-y-2 text-sm text-soft">
          {offer.kind === "weekend" && (
            <li className="flex gap-2.5">
              <Icon name="calendar" size={16} className="mt-0.5 shrink-0 text-pine" />
              Víkend pátek–neděle pro {offer.persons} {offer.persons < 5 ? "osoby" : "osob"}, termín si obdarovaný vybere na webu. V dražším období
              (Vánoce, sezóna) doplatí rozdíl.
            </li>
          )}
          <li className="flex gap-2.5">
            <Icon name="calendar" size={16} className="mt-0.5 shrink-0 text-pine" />
            Platí {offer.validMonths} měsíců od zaplacení.
          </li>
          <li className="flex gap-2.5">
            <Icon name="mail" size={16} className="mt-0.5 shrink-0 text-pine" />
            Poukaz s kódem přijde e-mailem, jakmile ubytovatel potvrdí platbu.
          </li>
        </ul>
      </div>

      <form onSubmit={submit} noValidate className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Dárkový poukaz</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">{giftHeadline(offer)}</h1>
        {/* Cenu zvlášť jen když není už v nadpisu (poukaz na částku = nadpis je cena) */}
        {giftHeadline(offer) === czk(offer.price) ? (
          <p className="mt-1 text-sm text-soft">Na libovolný pobyt · platí {offer.validMonths} měsíců</p>
        ) : (
          <p className="mt-1 font-display text-2xl font-semibold text-pine">{czk(offer.price)}</p>
        )}

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{step === 1 ? "Na poukaz napíšeme" : "Tvoje údaje"}</p>
            <span className="text-xs font-medium tabular-nums text-soft">Krok {step} ze 2</span>
          </div>
          <input type="text" tabIndex={-1} autoComplete="off" aria-hidden value={company} onChange={(e) => setCompany(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="company" />
          {step === 1 && (
            <>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-soft">Komu</span>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-soft">
                <input type="checkbox" checked={noRecipient} onChange={(e) => setNoRecipient(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--pine)]" />
                Bez jména
              </label>
            </div>
            {noRecipient ? (
              <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-soft">Poukaz nebude nikomu konkrétnímu určený.</p>
            ) : (
              <input
                className="field"
                aria-label="Komu"
                maxLength={60}
                placeholder="např. Pro Janu a Honzu / Milé mamince"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            )}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-soft">Věnování</span>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-soft">
                <input type="checkbox" checked={noMessage} onChange={(e) => setNoMessage(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--pine)]" />
                Bez věnování
              </label>
            </div>
            {noMessage ? (
              <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-soft">Na poukazu nebude žádný text, jen {who ? "komu je určený" : "částka a kód"}.</p>
            ) : (
              <>
                <textarea
                  className="field min-h-20"
                  maxLength={DEDICATION_MAX}
                  placeholder={offer.message}
                  value={dedication}
                  onChange={(e) => setDedication(e.target.value.split("\n").slice(0, 4).join("\n"))}
                />
                <div className="mt-1 flex justify-between gap-3 text-xs text-soft">
                  <span>{offer.message && !dedication.trim() ? "Když nic nenapíšeš, na poukazu bude text výše." : ""}</span>
                  <span className="shrink-0 tabular-nums">
                    {dedication.length}/{DEDICATION_MAX}
                  </span>
                </div>
              </>
            )}
          </div>
            </>
          )}
          {step === 2 && (
            <>
          <p className="-mt-2 text-xs text-soft">Poukaz pošleme na e-mail, adresa a telefon jsou pro doklad o platbě.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-soft">Jméno a příjmení</span>
              <input className={`field ${bad("buyerName")}`} autoComplete="name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-soft">E-mail</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                aria-invalid={emailBad}
                className={`field ${emailBad ? "!border-coral ring-2 ring-coral/15" : bad("buyerEmail")}`}
                value={buyerEmail}
                onChange={(e) => {
                  setBuyerEmail(e.target.value);
                  if (emailBad && isLikelyEmail(e.target.value)) {
                    setEmailBad(false);
                    if (error?.field === "buyerEmail") setError(null);
                  }
                }}
                onBlur={() => setEmailBad(buyerEmail.trim() !== "" && !isLikelyEmail(buyerEmail))}
              />
              {emailBad && (
                <span className="mt-1 flex items-start gap-1 text-xs text-coral" role="alert">
                  <Icon name="alert" size={13} className="mt-px shrink-0" />
                  E-mail není správně vyplněný.
                </span>
              )}
            </label>
          </div>
          <div className={error?.field === "buyerPhone" ? "[&_.field]:!border-coral" : ""}>
            <span className="mb-1 block text-xs font-medium text-soft">Telefon</span>
            <PhoneInput value={buyerPhone} onChange={setBuyerPhone} />
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-soft">Ulice a číslo domu</span>
            <input className={`field ${bad("buyerStreet")}`} autoComplete="street-address" value={buyerStreet} onChange={(e) => setBuyerStreet(e.target.value)} />
          </label>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-soft">Město</span>
              <input className={`field ${bad("buyerCity")}`} autoComplete="address-level2" value={buyerCity} onChange={(e) => setBuyerCity(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-soft">PSČ</span>
              <input className={`field ${bad("buyerZip")}`} autoComplete="postal-code" inputMode="numeric" value={buyerZip} onChange={(e) => setBuyerZip(e.target.value)} />
            </label>
          </div>
          <label className={`flex cursor-pointer items-start gap-2.5 text-sm text-soft ${error?.field === "terms" ? "text-coral" : ""}`}>
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--pine)]" />
            <span>
              Souhlasím s {hasTerms ? doc("podminky", "obchodními podmínkami") : "obchodními podmínkami"}
              {hasPrivacy && <> a beru na vědomí {doc("ochrana-udaju", "zásady ochrany osobních údajů")}</>}.
            </span>
          </label>
            </>
          )}
        </div>
        {error && (
          <p className="mt-4 text-sm text-coral" role="alert">
            {error.text}
          </p>
        )}
        <button type="submit" disabled={sending} className="btn-primary mt-6 w-full">
          {step === 1 ? "Pokračovat" : sending ? "Odesílám…" : `Objednat za ${czk(offer.price)}`}
        </button>
        {step === 2 && (
          <button type="button" onClick={() => (setStep(1), setError(null))} className="mt-3 block w-full text-center text-sm font-medium text-soft hover:text-ink">
            ← Zpět na text poukazu
          </button>
        )}
        <p className="mt-3 text-center text-xs text-soft">Platba převodem přes QR kód, bez poplatků.</p>
      </form>
    </div>
  );
}
