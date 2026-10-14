"use client";

import { useState } from "react";

// Žádost o přístup (early access). Po odeslání se hned ukáže poděkování,
// uložení běží na pozadí — když selže, formulář se vrátí s chybou.

const TYPES = ["chata", "tiny house", "apartmán", "glamping", "jiné"];

export function EarlyAccessForm({ source = "landing" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [website, setWebsite] = useState("");
  const [company, setCompany] = useState(""); // past na roboty
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v)) return setError("Zkontroluj prosím e-mail.");
    if (!consent) return setError("Potvrď prosím souhlas se zpracováním osobních údajů.");
    setError("");
    setSent(true);
    const res = await fetch("/api/early-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: v, name, propertyType, website, company, source, consent }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setSent(false);
      setError(data?.error ?? "Nepodařilo se to odeslat. Zkus to prosím znovu.");
    }
  }

  if (sent)
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-white/70 px-6 py-8 text-center" role="status">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#2c5e3f] text-xl text-white">✓</span>
        <p className="mt-4 font-display text-2xl font-semibold">Jsi na seznamu</p>
        <p className="mt-2 text-[#14261b]/70">Jakmile tainy spustíme, pošleme ti přístup na {email.trim()}. Prvním uživatelům první měsíc zdarma.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl text-left" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">E-mail</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="tvuj@email.cz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field !rounded-full !border-[#14261b]/15 !bg-white !px-5 !py-4"
          />
        </label>
        <button type="submit" className="shrink-0 rounded-full bg-[#14261b] px-7 py-4 font-semibold text-white transition hover:bg-[#2c5e3f] active:scale-[0.98]">
          Chci early access →
        </button>
      </div>
      {error && <p className="mt-2 px-2 text-sm text-coral">{error}</p>}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <input
          placeholder="Jméno (nepovinné)"
          autoComplete="name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field !border-[#14261b]/15 !bg-white/80 !text-sm"
        />
        <input
          placeholder="Tvůj web nebo Airbnb (nepovinné)"
          inputMode="url"
          maxLength={200}
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="field !border-[#14261b]/15 !bg-white/80 !text-sm"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Co pronajímáš">
        <span className="mr-1 text-sm text-[#14261b]/60">Pronajímám:</span>
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={propertyType === t}
            onClick={() => setPropertyType(propertyType === t ? "" : t)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              propertyType === t ? "border-[#2c5e3f] bg-[#2c5e3f] text-white" : "border-[#14261b]/15 bg-white/60 hover:border-[#2c5e3f]/50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {/* skryté pole proti robotům */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
        name="company"
      />
      <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm text-[#14261b]/80">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked) setError("");
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#2c5e3f]"
        />
        <span>
          Souhlasím se zpracováním osobních údajů. E-mail použijeme pouze k tomu, abychom ti dali vědět o spuštění tainy.
        </span>
      </label>
      <details className="mt-2 pl-[26px] text-xs text-[#14261b]/60">
        <summary className="cursor-pointer select-none font-medium text-[#2c5e3f] hover:underline">Jak s údaji zacházíme</summary>
        <div className="mt-2 space-y-1.5 leading-relaxed">
          <p>
            Zpracováváme jen to, co vyplníš: e-mail a případně jméno, typ ubytování a odkaz na tvůj web. Údaje použijeme pouze k tomu, abychom ti
            oznámili spuštění tainy a poslali přístup do aplikace.
          </p>
          <p>
            Nikomu je nepředáváme ani neprodáváme. Uchováváme je do spuštění služby, nejdéle 2 roky, pak je smažeme. Souhlas můžeš kdykoli
            odvolat odpovědí na náš e-mail a údaje hned smažeme.
          </p>
          <p>Zpracování probíhá na základě tvého souhlasu (čl. 6 odst. 1 písm. a GDPR). Správcem údajů je provozovatel služby tainy.cz.</p>
        </div>
      </details>
    </form>
  );
}
