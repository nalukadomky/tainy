"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { czk } from "@/lib/pricing";
import { TAX_PERIODS, type TaxPeriod } from "@/lib/guestbook";
import type { TaxSource } from "@/lib/tourist-tax";

// Poplatek z pobytu v ceníku: vyhláška obce dohledaná ve Sbírce podle adresy
// ubytování, přečtená sazba (doplní se sama, když žádnou nemáš) a jak často
// poplatek odvádíš. Hledá se při první návštěvě po změně adresy a na tlačítko.

const parse = (raw: string): TaxSource | null => {
  try {
    return raw ? (JSON.parse(raw) as TaxSource) : null;
  } catch {
    return null;
  }
};

const date = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
};

type Props = {
  slug: string;
  address: string;
  taxSource: string;
  touristTax: number;
  taxPeriod: string;
  /** Výsledek hledání (už uložený na serveru) a sazba, kterou server případně doplnil. */
  onSource: (raw: string, touristTax: number) => void;
  onRate: (rate: number) => void;
  onPeriod: (p: TaxPeriod) => void;
};

export function TaxSourceCard({ slug, address, taxSource, touristTax, taxPeriod, onSource, onRate, onPeriod }: Props) {
  const source = parse(taxSource);
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState(false);
  const tried = useRef("");

  async function check() {
    setBusy(true);
    const res = await fetch(`/api/sites/${slug}/tax-source`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return;
    const data: { taxSource: string; source: TaxSource | null; touristTax: number } = await res.json();
    // Server přečtenou sazbu doplnil jen tam, kde žádná nebyla — vlastní sazbu nepřepisuje
    if (data.touristTax !== touristTax && touristTax === 0) setFilled(true);
    onSource(data.taxSource, data.touristTax);
  }

  // Adresa uložená, ale vyhláška pro ni ještě nehledaná → hledat hned
  useEffect(() => {
    const a = address.trim();
    if (!a || tried.current === a || (source && source.address === a)) return;
    tried.current = a;
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const mismatch = source?.status === "found" && source.rate != null && touristTax !== source.rate;

  return (
    <div id="pole-poplatek" className="scroll-mt-24 space-y-3 rounded-xl bg-bg p-4 sm:col-span-2">
      <div className="flex items-start gap-3">
        <Icon name="file" size={18} className="mt-0.5 shrink-0 text-pine" />
        <div className="min-w-0 flex-1 text-sm">
          {busy ? (
            <p className="text-soft">Hledám vyhlášku obce o poplatku z pobytu…</p>
          ) : !address.trim() ? (
            <p className="text-soft">Doplň adresu ubytování (Automatizace → Informace k příjezdu) a vyhlášku obce dohledáme sami.</p>
          ) : !source || source.status === "unknown" ? (
            <p className="text-soft">
              {source?.municipality ? `${source.municipality}: ` : ""}vyhlášku se nepodařilo dohledat. Sazbu najdeš ve vyhlášce své obce ve{" "}
              <a className="text-pine underline-offset-2 hover:underline" href="https://sbirkapp.gov.cz" target="_blank" rel="noreferrer">
                Sbírce předpisů
              </a>
              .
            </p>
          ) : source.status === "none" ? (
            <p>
              <strong>{source.municipality}</strong>
              <span className="text-soft"> — ve Sbírce předpisů nemá platnou vyhlášku o poplatku z pobytu, poplatek tedy nejspíš nevybírá. Pro jistotu ověř na obecním úřadě.</span>
            </p>
          ) : (
            <div className="space-y-1">
              <p>
                <strong>{source.municipality}</strong>
                <span className="text-soft">
                  {" "}
                  · {source.title}
                  {source.validFrom && `, účinná od ${date(source.validFrom)}`}
                </span>
              </p>
              {source.rate != null ? (
                <p>
                  Sazba podle vyhlášky: <strong>{czk(source.rate)}</strong> za osobu a noc
                  {filled && <span className="text-pine"> — doplnili jsme ji do ceníku</span>}
                  {mismatch && (
                    <>
                      <span className="text-[#92600a]"> — máš nastaveno {czk(touristTax)}. </span>
                      <button type="button" className="font-semibold text-pine hover:underline" onClick={() => onRate(source.rate!)}>
                        Použít {czk(source.rate)}
                      </button>
                    </>
                  )}
                </p>
              ) : (
                <p className="text-soft">
                  Sazbu z vyhlášky nejde přečíst automaticky ({source.amended ? "mění ji novela" : "sken nebo sazby v příloze"}) — otevři ji a opiš sazbu výše.
                </p>
              )}
              {source.url && (
                <a href={source.url} target="_blank" rel="noreferrer" className="inline-block font-semibold text-pine hover:underline">
                  Otevřít vyhlášku ↗
                </a>
              )}
            </div>
          )}
        </div>
        {address.trim() && !busy && (
          <button type="button" className="shrink-0 text-xs font-medium text-soft hover:text-ink" onClick={check}>
            Zkontrolovat znovu
          </button>
        )}
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        Poplatek odvádím obci
        <select className="control !py-1.5 text-sm" value={taxPeriod} onChange={(e) => onPeriod(e.target.value as TaxPeriod)}>
          {TAX_PERIODS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <span className="text-xs text-soft">— podle toho se dělí Kniha ubytovaných.</span>
      </label>
    </div>
  );
}
