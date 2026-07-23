"use client";

import { useEffect, useMemo, useState } from "react";
import { quoteStay, czk, type PricingMode, type PriceRuleInput } from "@/lib/pricing";
import { DayPicker, type BookedRange } from "@/components/DayPicker";

type SiteInfo = {
  slug: string;
  name: string;
  pricePerNight: number;
  pricingMode: PricingMode;
  weekendPct: number;
  priceRules: PriceRuleInput[];
  maxGuests: number;
};

type Step = "termin" | "udaje" | "platba" | "hotovo";

export function BookingWidget({ site, preview = false }: { site: SiteInfo; preview?: boolean }) {
  const [step, setStep] = useState<Step>("termin");
  const [booked, setBooked] = useState<BookedRange[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (preview) return; // v náhledu neexistuje slug/DB — kalendář je prázdný
    fetch(`/api/availability?site=${site.slug}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setBooked)
      .catch(() => {});
  }, [site.slug, preview]);

  const price = useMemo(() => {
    if (!startDate || !endDate || endDate <= startDate) return null;
    const quote = quoteStay(
      {
        pricePerNight: site.pricePerNight,
        pricingMode: site.pricingMode,
        weekendPct: site.weekendPct,
        priceRules: site.priceRules,
      },
      startDate,
      endDate,
      guests
    );
    return quote.nights > 0 ? quote : null;
  }, [startDate, endDate, guests, site]);

  async function pay() {
    setPaying(true);
    setError("");
    // Mock Stripe: simulace zpracování platby, pak založení zaplacené rezervace
    await new Promise((r) => setTimeout(r, 1600));
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: site.slug,
          startDate,
          endDate,
          guests,
          guestName,
          email,
          phone,
          paid: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Platbu se nepodařilo dokončit.");
      setStep("hotovo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Platbu se nepodařilo dokončit.");
      setStep("termin");
    } finally {
      setPaying(false);
    }
  }

  const summary = price && startDate && endDate && (
    <div className="rounded-xl bg-bg px-4 py-3 text-sm">
      <div className="flex justify-between text-soft">
        <span>
          {new Date(startDate).toLocaleDateString("cs-CZ")} –{" "}
          {new Date(endDate).toLocaleDateString("cs-CZ")}
        </span>
        <span>
          {price.nights} {price.nights === 1 ? "noc" : price.nights < 5 ? "noci" : "nocí"}
          {site.pricingMode === "person" && ` · ${guests} ${guests === 1 ? "host" : guests < 5 ? "hosté" : "hostů"}`}
        </span>
      </div>
      {price.lines.map((l) => (
        <div key={`${l.price}|${l.note}`} className="flex justify-between text-soft">
          <span>
            {l.count}× noc à {czk(l.price)}
            {l.note && <span className="text-soft/80"> ({l.note})</span>}
          </span>
          <span>{czk(l.count * l.price)}</span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold">
        <span>Celkem</span>
        <span>{czk(price.total)}</span>
      </div>
    </div>
  );

  if (step === "hotovo") {
    return (
      <div className="rise rounded-2xl border border-line bg-surface p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pine/10 text-3xl">
          🎉
        </div>
        <h3 className="mt-4 font-display text-2xl font-semibold">Rezervace potvrzena!</h3>
        <p className="mx-auto mt-2 max-w-md text-soft">
          Díky, {guestName.split(" ")[0] || "hoste"}! Potvrzení a podrobnosti pobytu jsme poslali na{" "}
          <strong className="text-ink">{email}</strong>. Těšíme se na tebe{" "}
          {startDate && new Date(startDate).toLocaleDateString("cs-CZ")}.
        </p>
        <div className="mx-auto mt-5 max-w-sm text-left">{summary}</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {/* Krokovací lišta */}
      <div className="flex border-b border-line text-center text-xs font-semibold uppercase tracking-wider">
        {(
          [
            ["termin", "1 · Termín"],
            ["udaje", "2 · Údaje"],
            ["platba", "3 · Platba"],
          ] as const
        ).map(([id, label]) => (
          <div
            key={id}
            className={`flex-1 py-3 ${step === id ? "bg-pine text-white" : "text-soft"}`}
          >
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
              onChange={({ start, end }) => {
                setStartDate(start);
                setEndDate(end);
              }}
            />
            <p className="text-xs text-soft">
              Vyber den příjezdu a den odjezdu. Krajní dny se počítají jako půldny — dopoledne
              odjíždí předchozí host, odpoledne přijíždíš ty.
            </p>

            <div>
              <span className="mb-1.5 block text-sm font-medium">Počet hostů</span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="btn-ghost !px-5 !py-2"
                  onClick={() => setGuests(Math.max(1, guests - 1))}
                >
                  −
                </button>
                <span className="w-8 text-center font-display text-2xl font-semibold">{guests}</span>
                <button
                  type="button"
                  className="btn-ghost !px-5 !py-2"
                  onClick={() => setGuests(Math.min(site.maxGuests, guests + 1))}
                >
                  +
                </button>
                <span className="text-sm text-soft">max. {site.maxGuests}</span>
              </div>
            </div>

            {summary}
            {error && (
              <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">
                {error}
              </p>
            )}
            {preview ? (
              <p className="rounded-xl bg-bg px-4 py-3 text-center text-sm text-soft">
                👀 Takhle uvidí rezervaci tvoji hosté — na živém webu se dá rovnou zaplatit.
              </p>
            ) : (
              <button
                type="button"
                className="btn-primary w-full"
                disabled={!price || price.nights < 1}
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
                placeholder="jana@email.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">
                Telefon <span className="text-soft">(nepovinné)</span>
              </span>
              <input
                className="field"
                type="tel"
                placeholder="+420 …"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
                disabled={guestName.trim().length < 3 || !email.includes("@")}
                onClick={() => setStep("platba")}
              >
                K platbě →
              </button>
            </div>
          </div>
        )}

        {step === "platba" && (
          <div className="space-y-4">
            {/* Mock Stripe checkout */}
            <div className="rounded-2xl border border-[#e3e8ee] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#30313d]">Platba kartou</span>
                <span className="rounded-md bg-[#635bff] px-2 py-1 text-[11px] font-bold tracking-wide text-white">
                  stripe
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <span className="mb-1 block text-xs font-medium text-[#6a7383]">Číslo karty</span>
                  <div className="flex items-center justify-between rounded-lg border border-[#e3e8ee] px-3.5 py-2.5 text-[15px] text-[#30313d]">
                    <span className="tracking-widest">4242 4242 4242 4242</span>
                    <span className="text-lg">💳</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="mb-1 block text-xs font-medium text-[#6a7383]">Platnost</span>
                    <div className="rounded-lg border border-[#e3e8ee] px-3.5 py-2.5 text-[15px] text-[#30313d]">
                      12 / 28
                    </div>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-[#6a7383]">CVC</span>
                    <div className="rounded-lg border border-[#e3e8ee] px-3.5 py-2.5 text-[15px] text-[#30313d]">
                      •••
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={pay}
                disabled={paying}
                className="mt-5 w-full rounded-lg bg-[#635bff] py-3 text-[15px] font-semibold text-white transition hover:bg-[#5851e8] disabled:opacity-60"
              >
                {paying ? "Zpracovávám platbu…" : `Zaplatit ${price ? czk(price.total) : ""}`}
              </button>
              <p className="mt-3 text-center text-xs text-[#6a7383]">
                🔒 Ukázková platba — v demu se žádné peníze nestrhávají.
              </p>
            </div>
            {summary}
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => setStep("udaje")}
              disabled={paying}
            >
              ← Zpět na údaje
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
