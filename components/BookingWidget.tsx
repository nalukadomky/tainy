"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  czk,
  nightPrice,
  perGuestNightPrice,
  plural,
  pricedCategories,
  quoteStay,
  type Adjust,
  type PricingMode,
  type PriceRuleInput,
} from "@/lib/pricing";
import { describeCounts, type GuestCategory, type GuestCounts } from "@/lib/guests";
import { earliestArrival, isRangeFree, validateStay } from "@/lib/stay";
import { demoPaymentsEnabled } from "@/lib/demo";
import { DayPicker, type BookedRange } from "@/components/DayPicker";
import { GuestPicker } from "@/components/GuestPicker";
import { useToast } from "@/components/Toast";
import { submitOnEnter } from "@/lib/enter";
import { PhoneInput, isPhoneComplete } from "@/components/PhoneInput";
import { vatNote, vatOfQuote } from "@/lib/vat";
import { LEGAL_PATH, type LegalKind } from "@/lib/legal";

export type BookingSite = {
  slug: string;
  name: string;
  pricePerNight: number;
  pricingMode: PricingMode;
  weekend: Adjust;
  priceRules: PriceRuleInput[];
  maxGuests: number;
  minNights: number;
  leadTimeDays: number;
  checkInTime: string;
  checkOutTime: string;
  cleaningFee: number;
  touristTax: number;
  paymentMode: string;
  cancellationPolicy: string;
  /** Má web obchodní podmínky / zásady ochrany osobních údajů? */
  hasTerms?: boolean;
  hasPrivacy?: boolean;
  /** Sazba DPH (0 = neplátce); ceny jsou včetně DPH. */
  vatRate?: number;
  guestMode: string;
  categories: GuestCategory[];
};

type Step = "termin" | "hoste" | "udaje" | "potvrzeni";

const STEPS: [Step, string][] = [
  ["termin", "Termín"],
  ["hoste", "Hosté"],
  ["udaje", "Údaje"],
  ["potvrzeni", "Potvrzení"],
];
type Payment = "qr" | "onsite" | "demo";

const PAYMENT_OPTIONS = [
  ["qr", "QR platba převodem", "Po potvrzení dostaneš QR kód — načteš ho v bankovní aplikaci. Termín držíme 24 hodin."],
  ["onsite", "Domluvím se s majitelem", "Majitel se ti ozve a dohodnete se. Termín držíme 3 dny."],
  ["demo", "Zaplatit kartou (ukázka)", "Ukázková platba pro vývoj — žádné peníze se nestrhnou, rezervace se rovnou označí jako zaplacená."],
] as const;

export function BookingWidget({
  site,
  preview = false,
  initialBooked = [],
  onOpenDoc,
}: {
  site: BookingSite;
  /** Otevře obchodní podmínky / zásady v okně nad webem (jinak odkaz na stránku). */
  onOpenDoc?: (kind: LegalKind) => void;
  preview?: boolean;
  /** Obsazenost ze serveru — kalendář je vyplněný hned v prvním renderu. */
  initialBooked?: BookedRange[];
}) {
  const [step, setStep] = useState<Step>("termin");
  // Při přechodu mezi kroky srolovat na začátek formuláře (na mobilu by jinak
  // host zůstal dole u tlačítka a nový krok neviděl)
  const boxRef = useRef<HTMLDivElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const el = boxRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);
  const [booked, setBooked] = useState<BookedRange[]>(initialBooked);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  // Jméno a příjmení zvlášť — podle křestního jména se hosta oslovuje
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const namesOk = firstName.trim().length >= 2 && lastName.trim().length >= 2;
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Údaje hosta jsou kompletní: jméno, příjmení, e-mail a telefon (povinný)
  const contactOk = namesOk && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && isPhoneComplete(phone);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  // Zaškrtnutí je potřeba, jen když je s čím souhlasit (obchodní/storno podmínky).
  const needsConsent = !!site.hasTerms || !!site.cancellationPolicy;
  const [payment, setPayment] = useState<Payment>(site.paymentMode === "onsite" ? "onsite" : "qr");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // Voucher: ověřený na serveru pro aktuální termín a hosty
  const [voucher, setVoucher] = useState<{ code: string; label: string; discount: number } | null>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherInput, setVoucherInput] = useState("");
  const [voucherError, setVoucherError] = useState("");
  const [voucherChecking, setVoucherChecking] = useState(false);
  const { show: showToast, node: toastNode } = useToast();

  const categories = useMemo(
    () => pricedCategories({ guestMode: site.guestMode, categories: site.categories }),
    [site.guestMode, site.categories]
  );

  const [counts, setCounts] = useState<GuestCounts>(() => ({
    adult: Math.min(2, site.maxGuests),
  }));

  const demoDostupna = demoPaymentsEnabled();

  // Obsazenost přišla ze serveru při načtení stránky. Mezitím ji ale může
  // změnit jiný host nebo majitel (blokace, rezervace v administraci), takže
  // ji průběžně obnovujeme — host nesmí vidět volný termín, který už volný není.
  // Vrací čerstvou obsazenost, nebo null když se načtení nepovedlo.
  const refreshBooked = useCallback(async (): Promise<BookedRange[] | null> => {
    if (preview) return null;
    try {
      const res = await fetch(`/api/availability?site=${site.slug}`, { cache: "no-store" });
      if (!res.ok) return null;
      const fresh: BookedRange[] = await res.json();
      setBooked(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, [site.slug, preview]);

  useEffect(() => {
    if (preview) return;
    refreshBooked();
    // Každých 15 s, dokud je stránka vidět, a hned po návratu do záložky.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshBooked();
    }, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshBooked();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [preview, refreshBooked]);

  // Vybraný termín se mezitím obsadil — upozornit, zrušit výběr a vrátit hosta do kalendáře.
  const dateTaken = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
    setStep("termin");
    setError("Vybraný termín si mezitím někdo zarezervoval. Vyber prosím jiné datum.");
    showToast("Tento termín se mezitím zabookoval. Vyber prosím jiný.");
  }, [showToast]);

  useEffect(() => {
    if (startDate && endDate && !isRangeFree(booked, startDate, endDate)) dateTaken();
  }, [booked, startDate, endDate, dateTaken]);

  // Potvrzení termínu: hned na výběr hostů, čerstvá obsazenost se ověří na pozadí
  // (obsazený termín vrátí hosta do kalendáře — efekt výše).
  function confirmDates() {
    setStep("hoste");
    refreshBooked();
  }

  const pricingCfg = useMemo(
    () => ({
      pricePerNight: site.pricePerNight,
      pricingMode: site.pricingMode,
      weekend: site.weekend,
      priceRules: site.priceRules,
      cleaningFee: site.cleaningFee,
      touristTax: site.touristTax,
      guestMode: site.guestMode,
      categories: site.categories,
    }),
    [site]
  );

  const price = useMemo(() => {
    if (!startDate || !endDate || endDate <= startDate) return null;
    const quote = quoteStay(pricingCfg, startDate, endDate, counts);
    return quote.nights > 0 ? quote : null;
  }, [startDate, endDate, counts, pricingCfg]);

  const priceOf = useCallback(
    (iso: string) => nightPrice(pricingCfg, iso, counts).price,
    [pricingCfg, counts]
  );

  // Cena za osobu se počítá k prvnímu vybranému dni, ať host vidí, co platí
  // pro svůj termín, ne obecnou sazbu.
  const priceHint = useCallback(
    (c: GuestCategory) => {
      if (categories.length === 1) return null;
      const den = startDate ?? earliestArrival(site);
      const castka = perGuestNightPrice(pricingCfg, den, c);
      if (site.pricingMode === "person") return `${czk(castka)} / noc`;
      if (castka === 0) return "v ceně";
      return `${castka > 0 ? "+" : "−"}${czk(Math.abs(castka))} / noc`;
    },
    [categories.length, startDate, site, pricingCfg]
  );

  const stayError = useMemo(() => {
    if (!startDate || !endDate) return null;
    return validateStay(
      {
        minNights: site.minNights,
        leadTimeDays: site.leadTimeDays,
        maxGuests: site.maxGuests,
        categories,
      },
      startDate,
      endDate,
      counts
    );
  }, [startDate, endDate, counts, categories, site.minNights, site.leadTimeDays, site.maxGuests]);

  // Změna termínu nebo hostů mění cenu — ověřený voucher se musí uplatnit znovu.
  useEffect(() => {
    setVoucher(null);
  }, [startDate, endDate, counts]);

  async function applyVoucher() {
    if (!voucherInput.trim()) return;
    setVoucherChecking(true);
    setVoucherError("");
    try {
      const res = await fetch("/api/vouchers/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: site.slug, code: voucherInput, startDate, endDate, guests: counts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Voucher se nepodařilo ověřit.");
      setVoucher({ code: data.code, label: data.label, discount: data.discount });
      setVoucherOpen(false);
    } catch (e) {
      setVoucherError(e instanceof Error ? e.message : "Voucher se nepodařilo ověřit.");
    } finally {
      setVoucherChecking(false);
    }
  }

  const total = price ? price.total - (voucher?.discount ?? 0) : 0;

  async function submit() {
    setSending(true);
    setError("");
    // Poslední kontrola těsně před odesláním — obsazení řeší efekt výše (notifikace + návrat do kalendáře).
    const fresh = await refreshBooked();
    if (fresh && startDate && endDate && !isRangeFree(fresh, startDate, endDate)) {
      setSending(false);
      return;
    }
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: site.slug,
          startDate,
          endDate,
          guests: counts,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email,
          phone,
          note,
          termsAccepted: consent,
          payment,
          voucherCode: voucher?.code ?? "",
        }),
      });
      const data = await res.json();
      // Voucher mezitím přestal platit — odebrat ho a nechat hosta v potvrzení.
      if (!res.ok && data.field === "voucher") {
        setVoucher(null);
        setVoucherOpen(true);
        setVoucherError(data.error);
        setSending(false);
        return;
      }
      // Server je autoritativní: termín obsadil někdo v posledním okamžiku.
      if (res.status === 409) {
        setSending(false);
        dateTaken();
        refreshBooked();
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Rezervaci se nepodařilo dokončit.");
      window.location.href = `/r/${data.publicId}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rezervaci se nepodařilo dokončit.");
      setSending(false);
      // Termín mohl mezitím obsadit někdo jiný — načti kalendář znovu.
      refreshBooked();
      setStep("termin");
    }
  }

  const skladba = describeCounts(counts, categories);

  const summary = price && startDate && endDate && (
    <div className="rounded-xl bg-bg px-4 py-3 text-sm">
      <div className="flex flex-wrap justify-between gap-x-4 font-medium">
        <span>
          {new Date(startDate).toLocaleDateString("cs-CZ")} – {new Date(endDate).toLocaleDateString("cs-CZ")}
        </span>
        <span>
          {price.nights} {plural(price.nights, "noc", "noci", "nocí")}
        </span>
      </div>
      <p className="mt-0.5 text-soft">
        Check-in {new Date(startDate).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })} od{" "}
        {site.checkInTime} · check-out {new Date(endDate).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })} do{" "}
        {site.checkOutTime}
      </p>
      {skladba && <p className="mt-0.5 text-soft">{skladba}</p>}
      <div className="mt-2 space-y-0.5 border-t border-line pt-2">
        {price.lines.map((l) => (
          <div key={`${l.price}|${l.note}`} className="flex justify-between text-soft">
            <span>
              {l.count} {plural(l.count, "noc", "noci", "nocí")} po {czk(l.price)}
              {l.note && <span className="text-soft/80"> ({l.note})</span>}
            </span>
            <span>{czk(l.count * l.price)}</span>
          </div>
        ))}
        {price.fees.map((f) => (
          <div key={f.label} className="flex justify-between text-soft">
            <span>
              {f.label} <span className="text-soft/80">({f.detail})</span>
            </span>
            <span>{czk(f.amount)}</span>
          </div>
        ))}
      </div>
      {voucher && (
        <div className="mt-0.5 flex justify-between font-medium text-pine">
          <span>
            Voucher {voucher.code} <span className="font-normal">({voucher.label})</span>
          </span>
          <span>−{czk(voucher.discount)}</span>
        </div>
      )}
      <div className="mt-2 flex justify-between border-t border-line pt-2 font-display text-base font-semibold">
        <span>Celkem</span>
        <span>{czk(total)}</span>
      </div>
      <p className="mt-0.5 text-right text-xs text-soft">
        {vatNote(site.vatRate ?? 0, vatOfQuote(price, voucher?.discount ?? 0, site.vatRate ?? 0))}
      </p>
    </div>
  );

  const earliest = earliestArrival(site);

  return (
    <>
      {toastNode}
      <div ref={boxRef} className="scroll-mt-20 overflow-hidden rounded-2xl border border-line bg-surface">
        {/* Krokovací lišta — hotové kroky jdou rozkliknout zpět */}
        <ol className="flex border-b border-line text-center text-xs font-semibold uppercase tracking-wider">
          {STEPS.map(([id, label], i) => {
            const current = STEPS.findIndex(([s]) => s === step);
            const done = i < current;
            return (
              <li key={id} className="flex-1">
                <button
                  type="button"
                  disabled={!done || sending}
                  onClick={() => setStep(id)}
                  aria-current={step === id ? "step" : undefined}
                  className={`w-full py-3 transition ${
                    step === id ? "bg-pine text-white" : done ? "text-pine hover:bg-pine/5" : "text-soft"
                  }`}
                >
                  {done ? "✓" : i + 1}
                  {/* Na mobilu jen číslo, název u aktuálního kroku */}
                  <span className={step === id ? "" : "max-sm:hidden"}> · {label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="p-4 sm:p-7">
          {step === "termin" && (
            <div className="space-y-5">
              <DayPicker
                booked={booked}
                start={startDate}
                end={endDate}
                minNights={site.minNights}
                earliest={earliest}
                priceOf={priceOf}
                onChange={({ start, end }) => {
                  setStartDate(start);
                  setEndDate(end);
                  setError("");
                }}
              />

              <p className="text-xs text-soft">
                Krajní dny se počítají jako půldny — dopoledne odjíždí předchozí host, odpoledne přijíždíš ty.
                Příjezd od {site.checkInTime}, odjezd do {site.checkOutTime}. Klikem na den příjezdu
                nebo odjezdu výběr zrušíš.
                {site.minNights > 1 &&
                  ` Nejkratší pobyt je ${site.minNights} ${plural(site.minNights, "noc", "noci", "nocí")}.`}
              </p>

              {startDate && endDate && price && (
                <div className="flex items-end justify-between gap-3 rounded-xl bg-bg px-4 py-3 text-sm">
                  <span>
                    <strong className="block font-semibold">
                      {fmtDay(startDate)} – {fmtDay(endDate)}
                    </strong>
                    <span className="text-soft">
                      {price.nights} {plural(price.nights, "noc", "noci", "nocí")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-soft">
                    <span className="block text-xs">celkem od</span>
                    <strong className="font-semibold text-ink">{czk(price.total)}</strong>
                  </span>
                </div>
              )}
              {(error || stayError) && (
                <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{error || stayError}</p>
              )}
              <button
                type="button"
                className="btn-primary w-full"
                disabled={!price || !!stayError}
                onClick={confirmDates}
              >
                {!startDate ? "Vyber den příjezdu" : !endDate ? "Vyber den odjezdu" : "Potvrdit termín →"}
              </button>
            </div>
          )}

          {step === "hoste" && (
            <div className="space-y-5">
              {startDate && endDate && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
                  <span>
                    <span className="block text-xs text-soft">Termín</span>
                    <strong className="font-semibold">
                      {fmtDay(startDate)} – {fmtDay(endDate)}
                    </strong>
                  </span>
                  <button type="button" className="font-medium text-pine hover:underline" onClick={() => setStep("termin")}>
                    Změnit
                  </button>
                </div>
              )}

              <GuestPicker
                categories={categories}
                counts={counts}
                onChange={setCounts}
                maxGuests={site.maxGuests}
                priceHint={priceHint}
              />

              {summary}
              {(error || stayError) && (
                <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{error || stayError}</p>
              )}
              {preview ? (
                <p className="rounded-xl bg-bg px-4 py-3 text-center text-sm text-soft">
                  👀 Takhle uvidí rezervaci tvoji hosté — na živém webu se dá rovnou dokončit.
                </p>
              ) : (
                <div className="flex gap-3">
                  <button type="button" className="btn-ghost" onClick={() => setStep("termin")}>
                    ← Zpět
                  </button>
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    disabled={!price || !!stayError}
                    onClick={() => setStep("udaje")}
                  >
                    Pokračovat →
                  </button>
                </div>
              )}
            </div>
          )}

          {step === "udaje" && (
            <div
              className="space-y-4"
              onKeyDown={submitOnEnter(() => {
                if (contactOk) setStep("potvrzeni");
              })}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Jméno</span>
                  <input
                    className="field"
                    autoFocus
                    autoComplete="given-name"
                    placeholder="Jana"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Příjmení</span>
                  <input
                    className="field"
                    autoComplete="family-name"
                    placeholder="Veselá"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">E-mail</span>
                <input
                  className="field"
                  type="email"
                  inputMode="email"
                  placeholder="jana@email.cz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <span className="mt-1 block text-xs text-soft">Pošleme sem potvrzení rezervace.</span>
              </label>
              <div>
                <span className="mb-1.5 block text-sm font-medium">Telefon</span>
                <PhoneInput value={phone} onChange={setPhone} />
                <span className="mt-1 block text-xs text-soft">Kdyby bylo potřeba něco domluvit před příjezdem.</span>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  Poznámka pro majitele <span className="text-soft">(nepovinné)</span>
                </span>
                <textarea
                  className="field min-h-20 resize-y"
                  placeholder="Přijedeme až po deváté večer, vezmeme psa…"
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              {summary}
              <div className="flex gap-3">
                <button type="button" className="btn-ghost" onClick={() => setStep("hoste")}>
                  ← Zpět
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={!contactOk}
                  onClick={() => setStep("potvrzeni")}
                >
                  Pokračovat →
                </button>
              </div>
            </div>
          )}

          {step === "potvrzeni" && (
            <div className="space-y-4">
              {summary}

              {voucher ? (
                <p className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-pine">✓ Voucher {voucher.code} je uplatněný.</span>
                  <button
                    type="button"
                    className="font-medium text-soft hover:text-coral"
                    onClick={() => {
                      setVoucher(null);
                      setVoucherInput("");
                    }}
                  >
                    Odebrat
                  </button>
                </p>
              ) : voucherOpen ? (
                <div>
                  <div className="flex gap-2">
                    <input
                      className="control min-w-0 flex-1 uppercase"
                      placeholder="Kód voucheru"
                      aria-label="Kód voucheru"
                      autoFocus
                      value={voucherInput}
                      onChange={(e) => {
                        setVoucherInput(e.target.value);
                        setVoucherError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        applyVoucher();
                      }}
                    />
                    <button
                      type="button"
                      className="btn-ghost h-10 !px-4 !py-0 text-sm"
                      disabled={voucherChecking || !voucherInput.trim()}
                      onClick={applyVoucher}
                    >
                      {voucherChecking ? "Ověřuji…" : "Uplatnit"}
                    </button>
                  </div>
                  {voucherError && <p className="mt-1.5 text-sm font-medium text-coral">{voucherError}</p>}
                </div>
              ) : (
                !preview && (
                  <button
                    type="button"
                    className="text-sm font-medium text-pine hover:underline"
                    onClick={() => setVoucherOpen(true)}
                  >
                    Mám voucher nebo slevový kód
                  </button>
                )
              )}

              <div>
                <span className="mb-2 block text-sm font-medium">Jak zaplatíš</span>
                <div className="space-y-2">
                  {PAYMENT_OPTIONS.filter(
                    (o) =>
                      (o[0] === "qr" && site.paymentMode === "qr") ||
                      o[0] === "onsite" ||
                      (o[0] === "demo" && demoDostupna)
                  ).map(([id, label, hint]) => (
                    <label
                      key={id}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition ${
                        payment === id ? "border-pine bg-pine/5" : "border-line hover:border-ink/25"
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        className="mt-1 accent-[var(--pine)]"
                        checked={payment === id}
                        onChange={() => setPayment(id)}
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {label}
                          {id === "demo" && (
                            <span className="ml-2 rounded-full bg-amber/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#92600a]">
                              demo
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-soft">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {site.cancellationPolicy && (
                <div className="whitespace-pre-line rounded-xl bg-bg px-4 py-3 text-xs text-soft">
                  <strong className="text-ink">Storno podmínky:</strong> {site.cancellationPolicy}
                </div>
              )}

              {needsConsent && (
                <label className="flex cursor-pointer gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[var(--pine)]"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span className="text-soft">
                    {site.hasTerms ? (
                      <>
                        Souhlasím s{" "}
                        <DocLink slug={site.slug} kind="terms" onOpen={onOpenDoc}>
                          obchodními podmínkami
                        </DocLink>
                        {site.cancellationPolicy ? " a storno podmínkami." : "."}
                      </>
                    ) : (
                      "Souhlasím se storno podmínkami."
                    )}
                  </span>
                </label>
              )}
              <p className="text-xs text-soft">
                Osobní údaje zpracujeme jen pro vyřízení rezervace a pobytu
                {site.hasPrivacy ? (
                  <>
                    {" — "}
                    <DocLink slug={site.slug} kind="privacy" onOpen={onOpenDoc}>
                      zásady ochrany osobních údajů
                    </DocLink>
                    .
                  </>
                ) : (
                  "."
                )}
              </p>

              {error && (
                <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{error}</p>
              )}

              <button
                type="button"
                className="btn-primary w-full"
                disabled={sending || (needsConsent && !consent)}
                onClick={submit}
              >
                {sending ? "Odesílám…" : `Závazně rezervovat · ${price ? czk(total) : ""}`}
              </button>
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => setStep("udaje")}
                disabled={sending}
              >
                ← Zpět na údaje
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Odkaz na obchodní podmínky / zásady — otevře je v okně nad webem (bez okna v nové
 * kartě), rozpracovaná rezervace zůstane. */
function DocLink({
  slug,
  kind,
  onOpen,
  children,
}: {
  slug: string;
  kind: LegalKind;
  onOpen?: (kind: LegalKind) => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={`/w/${slug}/${LEGAL_PATH[kind]}`}
      target="_blank"
      rel="noopener"
      onClick={(e) => {
        if (!onOpen || e.metaKey || e.ctrlKey) return;
        // Klik na odkaz uvnitř <label> by jinak přepnul i checkbox
        e.preventDefault();
        e.stopPropagation();
        onOpen(kind);
      }}
      className="font-medium text-ink underline underline-offset-2 hover:text-pine"
    >
      {children}
    </a>
  );
}

/** „12. 10.“ — krátké datum do souhrnu termínu. */
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}
