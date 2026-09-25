"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { earliestArrival, validateStay } from "@/lib/stay";
import { demoPaymentsEnabled } from "@/lib/demo";
import { DayPicker, type BookedRange } from "@/components/DayPicker";
import { GuestPicker } from "@/components/GuestPicker";

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
  guestMode: string;
  categories: GuestCategory[];
};

type Step = "termin" | "udaje" | "potvrzeni";
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
}: {
  site: BookingSite;
  preview?: boolean;
  /** Obsazenost ze serveru — kalendář je vyplněný hned v prvním renderu. */
  initialBooked?: BookedRange[];
}) {
  const [step, setStep] = useState<Step>("termin");
  const [booked, setBooked] = useState<BookedRange[]>(initialBooked);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [payment, setPayment] = useState<Payment>(site.paymentMode === "onsite" ? "onsite" : "qr");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const categories = useMemo(
    () => pricedCategories({ guestMode: site.guestMode, categories: site.categories }),
    [site.guestMode, site.categories]
  );

  const [counts, setCounts] = useState<GuestCounts>(() => ({
    adult: Math.min(2, site.maxGuests),
  }));

  const demoDostupna = demoPaymentsEnabled();

  // Obsazenost přišla ze serveru; obnovíme ji jen když jsme ji nedostali
  // (náhled v administraci) nebo po neúspěšném pokusu o rezervaci.
  const refreshBooked = useCallback(() => {
    if (preview) return;
    fetch(`/api/availability?site=${site.slug}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setBooked)
      .catch(() => {});
  }, [site.slug, preview]);

  useEffect(() => {
    if (initialBooked.length === 0) refreshBooked();
  }, [initialBooked.length, refreshBooked]);

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

  async function submit() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: site.slug,
          startDate,
          endDate,
          guests: counts,
          guestName,
          email,
          phone,
          note,
          consent,
          payment,
        }),
      });
      const data = await res.json();
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
      {skladba && <p className="mt-0.5 text-soft">{skladba}</p>}
      <div className="mt-2 space-y-0.5 border-t border-line pt-2">
        {price.lines.map((l) => (
          <div key={`${l.price}|${l.note}`} className="flex justify-between text-soft">
            <span>
              {l.count}× noc à {czk(l.price)}
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
      <div className="mt-2 flex justify-between border-t border-line pt-2 font-display text-base font-semibold">
        <span>Celkem</span>
        <span>{czk(price.total)}</span>
      </div>
    </div>
  );

  const earliest = earliestArrival(site);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {/* Krokovací lišta */}
      <div className="flex border-b border-line text-center text-xs font-semibold uppercase tracking-wider">
        {(
          [
            ["termin", "1 · Termín"],
            ["udaje", "2 · Údaje"],
            ["potvrzeni", "3 · Potvrzení"],
          ] as const
        ).map(([id, label]) => (
          <div key={id} className={`flex-1 py-3 ${step === id ? "bg-pine text-white" : "text-soft"}`}>
            {label}
          </div>
        ))}
      </div>

      <div className="p-5 sm:p-7">
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

            <GuestPicker
              categories={categories}
              counts={counts}
              onChange={setCounts}
              maxGuests={site.maxGuests}
              priceHint={priceHint}
            />

            {summary}
            {(error || stayError) && (
              <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">
                {error || stayError}
              </p>
            )}
            {preview ? (
              <p className="rounded-xl bg-bg px-4 py-3 text-center text-sm text-soft">
                👀 Takhle uvidí rezervaci tvoji hosté — na živém webu se dá rovnou dokončit.
              </p>
            ) : (
              <button
                type="button"
                className="btn-primary w-full"
                disabled={!price || !!stayError}
                onClick={() => setStep("udaje")}
              >
                {price ? "Pokračovat →" : "Vyber termín v kalendáři"}
              </button>
            )}
          </div>
        )}

        {step === "udaje" && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Jméno a příjmení</span>
              <input
                className="field"
                autoFocus
                placeholder="Jana Veselá"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </label>
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
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">
                Telefon <span className="text-soft">(nepovinné)</span>
              </span>
              <input
                className="field"
                type="tel"
                inputMode="tel"
                placeholder="+420 …"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
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
              <button type="button" className="btn-ghost" onClick={() => setStep("termin")}>
                ← Zpět
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={guestName.trim().length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)}
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
              <div className="rounded-xl bg-bg px-4 py-3 text-xs text-soft">
                <strong className="text-ink">Storno podmínky:</strong> {site.cancellationPolicy}
              </div>
            )}

            <label className="flex cursor-pointer gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--pine)]"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span className="text-soft">
                Souhlasím se zpracováním osobních údajů pro vyřízení rezervace a s uvedenými podmínkami pobytu.
              </span>
            </label>

            {error && (
              <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{error}</p>
            )}

            <button
              type="button"
              className="btn-primary w-full"
              disabled={sending || !consent}
              onClick={submit}
            >
              {sending ? "Odesílám…" : `Závazně rezervovat · ${price ? czk(price.total) : ""}`}
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
  );
}
