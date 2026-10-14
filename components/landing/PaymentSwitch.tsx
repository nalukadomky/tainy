"use client";

import { useState } from "react";

// Ukázka platby rezervace na úvodní stránce s přepínačem: QR platba z banky,
// nebo platba kartou přes Stripe (zatím jen připravujeme — štítek Brzy).
// QR kód přichází hotový ze serveru (props.qr).

type Mode = "qr" | "card";

const ROWS: [string, string][] = [
  ["3 noci × 3 500 Kč", "10 500 Kč"],
  ["Úklid", "800 Kč"],
  ["Poplatek z pobytu", "300 Kč"],
];

export function PaymentSwitch({ qr }: { qr: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("qr");

  return (
    <div className="relative mx-auto w-full max-w-[460px] select-none text-ink">
      {/* Přepínač způsobu platby */}
      <div role="tablist" aria-label="Způsob platby" className="mx-auto mb-4 flex w-fit rounded-full border border-line bg-surface p-1 shadow-sm">
        {(
          [
            ["qr", "QR platba"],
            ["card", "Karta přes Stripe"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === m ? "bg-pine text-white" : "text-soft hover:text-ink"}`}
          >
            {label}
            {m === "card" && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${mode === m ? "bg-white/20 text-white" : "bg-amber/15 text-[#92600a]"}`}>
                Brzy
              </span>
            )}
          </button>
        ))}
      </div>

      <div aria-hidden className="rounded-3xl border border-line bg-surface p-6 shadow-[0_30px_70px_-30px_rgba(30,42,32,0.4)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-soft">Rezervace potvrzena</p>
            <p className="mt-1 font-display text-2xl font-semibold">Tiny Vyhlídka</p>
            <p className="text-sm text-soft">16.–19. října · 2 dospělí, 1 dítě</p>
          </div>
          <span className="shrink-0 rounded-full bg-amber/15 px-2.5 py-1 text-[11px] font-semibold text-[#92600a]">Čeká na platbu</span>
        </div>
        <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
          {ROWS.map(([k, v]) => (
            <div key={k} className="flex justify-between text-soft">
              <dt>{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
            <dt>Celkem</dt>
            <dd className="tabular-nums">11 600 Kč</dd>
          </div>
        </dl>

        {mode === "qr" ? (
          <div className="mt-5 flex items-center gap-4 rounded-2xl bg-bg p-4">
            <span className="shrink-0">{qr}</span>
            <div className="text-sm">
              <p className="font-semibold">Zaplať QR kódem</p>
              <p className="mt-0.5 text-soft">Naskenuj v aplikaci banky. Peníze jdou rovnou na účet majitele, bez poplatků.</p>
            </div>
          </div>
        ) : (
          <div className="relative mt-5 space-y-2.5 rounded-2xl bg-bg p-4">
            <span className="absolute -top-2.5 right-3 rounded-full bg-amber px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              Připravujeme
            </span>
            <div className="grid grid-cols-2 gap-2">
              <span className="flex h-10 items-center justify-center rounded-xl bg-ink text-sm font-semibold text-white">Apple Pay</span>
              <span className="flex h-10 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold">
                <span className="text-[#4285f4]">G</span>oogle Pay
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-line bg-surface text-sm">
              <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
                <span className="tabular-nums tracking-wider">4242 4242 4242 4242</span>
                <span className="rounded bg-[#1a1f71] px-1.5 py-0.5 text-[9px] font-bold italic text-white">VISA</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-line">
                <span className="px-3 py-2.5 tabular-nums text-soft">12 / 28</span>
                <span className="px-3 py-2.5 tabular-nums text-soft">CVC</span>
              </div>
            </div>
            <span className="block rounded-xl bg-pine py-3 text-center text-sm font-semibold text-white">Zaplatit 11 600 Kč</span>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-soft">
              <span aria-hidden>🔒</span> Zabezpečená platba přes <strong className="font-semibold text-[#635bff]">Stripe</strong>
            </p>
          </div>
        )}
      </div>

      <div aria-hidden className="float absolute -bottom-5 -right-2 rounded-2xl bg-pine px-4 py-3 text-white shadow-lg sm:-right-6">
        <p className="text-[11px] opacity-80">Provize tainy</p>
        <p className="font-display text-2xl font-semibold">0 Kč</p>
      </div>
    </div>
  );
}
