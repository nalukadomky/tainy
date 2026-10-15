"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { GiftVoucherCard } from "@/components/GiftVoucherCard";
import { czk } from "@/lib/pricing";
import { giftHeadline, type GiftDesign } from "@/lib/gift";
import type { LegalKind } from "@/lib/legal";

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
};

export function GiftShop({ siteName, offers, base, hasTerms, hasPrivacy, embed, onOpenDoc }: Props) {
  const [pick, setPick] = useState<string | null>(offers.length === 1 ? offers[0].id : null);
  const offer = offers.find((o) => o.id === pick) ?? null;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
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
        <Order offer={offer} siteName={siteName} base={base} hasTerms={hasTerms} hasPrivacy={hasPrivacy} embed={embed} onOpenDoc={onOpenDoc} onBack={offers.length > 1 ? () => setPick(null) : undefined} />
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
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [terms, setTerms] = useState(false);
  const [company, setCompany] = useState(""); // past na roboty
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [sending, setSending] = useState(false);

  const preview: GiftDesign = { ...offer, message: [recipient.trim() && `Pro ${recipient.trim()}.`, dedication.trim() || offer.message].filter(Boolean).join(" ") };
  const bad = (f: string) => (error?.field === f ? "!border-coral ring-2 ring-coral/15" : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (buyerName.trim().length < 2) return setError({ text: "Doplň své jméno.", field: "buyerName" });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(buyerEmail.trim())) return setError({ text: "Zkontroluj e-mail.", field: "buyerEmail" });
    if (!terms) return setError({ text: "Potvrď prosím souhlas s podmínkami.", field: "terms" });
    setError(null);
    setSending(true);
    const res = await fetch("/api/gift-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerId: offer.id, recipient, dedication, buyerName, buyerEmail, terms, company }),
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
          <p className="text-sm font-semibold">Na poukaz napíšeme</p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-soft">Pro koho (nepovinné)</span>
            <input className="field" maxLength={60} placeholder="např. Petru a Honzu" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-soft">Věnování (nepovinné)</span>
            <textarea className="field min-h-20" maxLength={240} placeholder={offer.message} value={dedication} onChange={(e) => setDedication(e.target.value)} />
          </label>
          <p className="pt-2 text-sm font-semibold">Kam poslat poukaz</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-soft">Tvoje jméno</span>
              <input className={`field ${bad("buyerName")}`} autoComplete="name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-soft">E-mail</span>
              <input type="email" inputMode="email" autoComplete="email" className={`field ${bad("buyerEmail")}`} value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
            </label>
          </div>
          <input type="text" tabIndex={-1} autoComplete="off" aria-hidden value={company} onChange={(e) => setCompany(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="company" />
          <label className={`flex cursor-pointer items-start gap-2.5 text-sm text-soft ${error?.field === "terms" ? "text-coral" : ""}`}>
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--pine)]" />
            <span>
              Souhlasím s {hasTerms ? doc("podminky", "obchodními podmínkami") : "obchodními podmínkami"}
              {hasPrivacy && <> a beru na vědomí {doc("ochrana-udaju", "zásady ochrany osobních údajů")}</>}.
            </span>
          </label>
        </div>
        {error && (
          <p className="mt-4 text-sm text-coral" role="alert">
            {error.text}
          </p>
        )}
        <button type="submit" disabled={sending} className="btn-primary mt-6 w-full">
          {sending ? "Odesílám…" : `Objednat za ${czk(offer.price)}`}
        </button>
        <p className="mt-3 text-center text-xs text-soft">Platba převodem přes QR kód, bez poplatků.</p>
      </form>
    </div>
  );
}
