"use client";

import { useCallback, useEffect, useState } from "react";
import { DNS_RECORDS } from "@/lib/domains";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

// Vlastní doména webu: průvodce na tři kroky — zadat doménu, nastavit DNS
// u registrátora, počkat na ověření a certifikát (kontroluje se samo).

type State = {
  enabled: boolean;
  domain: string | null;
  status: string;
  dnsOk?: boolean;
  verified?: boolean;
  verification?: { type: string; name: string; value: string }[];
  message?: string;
};

const GUIDES = [
  { name: "Wedos", text: "Klientská zóna → Domény → vyber doménu → DNS záznamy → Přidat záznam." },
  { name: "Forpsi", text: "Administrace → Domény → vyber doménu → Editace DNS záznamů." },
  { name: "Active24", text: "Zákaznické centrum → Domény → vyber doménu → Nastavení DNS." },
  { name: "Websupport", text: "Administrace → Domény → vyber doménu → DNS → Přidat záznam." },
];

export function DomainSettings({
  slug,
  domain,
  status,
  onChange,
}: {
  slug: string;
  domain: string | null;
  status: string;
  onChange: (patch: { customDomain: string | null; domainStatus: string }) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const toast = useToast();
  const showToast = toast.show;
  const confirmDlg = useConfirm();

  const check = useCallback(async () => {
    setChecking(true);
    const res = await fetch(`/api/sites/${slug}/domain`).catch(() => null);
    setChecking(false);
    if (!res?.ok) return;
    const data: State = await res.json();
    setState(data);
    if (data.domain !== domain || data.status !== status) onChange({ customDomain: data.domain, domainStatus: data.status });
  }, [slug, domain, status, onChange]);

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Dokud doména neběží, kontrolujeme stav sami každých 30 s
  useEffect(() => {
    if (!state?.domain || state.status === "active") return;
    const t = window.setInterval(check, 30_000);
    return () => window.clearInterval(t);
  }, [state?.domain, state?.status, check]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/sites/${slug}/domain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: input }),
    }).catch(() => null);
    setBusy(false);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return showToast(data?.error || "Doménu se nepodařilo připojit.");
    setState(data);
    setInput("");
    onChange({ customDomain: data.domain, domainStatus: data.status });
  }

  async function disconnect() {
    const ok = await confirmDlg.ask({
      title: "Odpojit doménu?",
      message: `Web přestane běžet na ${state?.domain}. Dál bude dostupný na tainy.cz/${slug}.`,
      confirmLabel: "Odpojit",
    });
    if (!ok) return;
    const prev = state;
    setState((s) => (s ? { ...s, domain: null, status: "" } : s));
    onChange({ customDomain: null, domainStatus: "" });
    const res = await fetch(`/api/sites/${slug}/domain`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setState(prev);
      showToast("Doménu se nepodařilo odpojit.");
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => showToast("Zkopírováno.", "success")).catch(() => {});
  }

  const d = state?.domain ?? domain;
  const st = state?.status ?? status;
  const records = [
    ...DNS_RECORDS.map((r) => ({ type: r.type, name: r.name, value: r.value, hint: r.hint })),
    ...(state?.verification ?? []).map((v) => ({ type: v.type, name: v.name, value: v.value, hint: "ověření vlastnictví" })),
  ];

  return (
    <div className="space-y-4">
      {toast.node}
      {confirmDlg.node}
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Vlastní doména</h2>
          <p className="text-sm text-soft">
            Web může běžet na tvé doméně, např. <strong className="font-medium text-ink">chata-olinka.cz</strong>, místo tainy.cz/{slug}.
            Doménu si koupíš u libovolného registrátora a tady ji připojíš.
          </p>
        </div>

        {state && !state.enabled && (
          <p className="rounded-xl bg-amber/15 px-4 py-3 text-sm text-[#7a5208]">
            Připojení domén zatím není zapnuté. Ozvi se nám a nastavíme to.
          </p>
        )}

        {!d ? (
          // Krok 1: zadat doménu
          <form onSubmit={connect} className="flex flex-wrap gap-2">
            <input
              className="field min-w-0 flex-1"
              placeholder="chata-olinka.cz"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="url"
              autoCapitalize="none"
              aria-label="Tvoje doména"
            />
            <button type="submit" className="btn-primary !px-5" disabled={busy || !input.trim() || state?.enabled === false}>
              {busy ? "Připojuji…" : "Připojit doménu"}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{d}</p>
              <p className="mt-0.5 text-sm">
                {st === "active" ? (
                  <span className="font-medium text-pine">
                    ✓ Hotovo — web běží na{" "}
                    <a href={`https://${d}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {d} ↗
                    </a>
                  </span>
                ) : st === "error" ? (
                  <span className="font-medium text-coral">{state?.message || "Doménu je potřeba připojit znovu."}</span>
                ) : state?.dnsOk && state.verified === false ? (
                  <span className="text-[#92600a]">Čeká na ověření vlastnictví (TXT záznam níže)</span>
                ) : state?.dnsOk ? (
                  <span className="text-[#92600a]">DNS je v pořádku — vydává se certifikát HTTPS</span>
                ) : (
                  <span className="text-[#92600a]">Čeká na nastavení DNS u registrátora</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {st !== "active" && (
                <button type="button" onClick={check} disabled={checking} className="btn-ghost !px-4 !py-2 text-sm">
                  {checking ? "Kontroluji…" : "Zkontrolovat"}
                </button>
              )}
              <button type="button" onClick={disconnect} className="text-sm font-medium text-soft hover:text-coral">
                Odpojit
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Krok 2: DNS záznamy (dokud doména neběží) */}
      {d && st !== "active" && (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          <div>
            <h3 className="font-display text-lg font-semibold">Nastav DNS u registrátora</h3>
            <p className="text-sm text-soft">
              V administraci domény u registrátora přidej tyto záznamy. Změna se projeví obvykle do hodiny, výjimečně až za 48 hodin —
              stav tu kontrolujeme sami.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-soft">
                  <th className="py-2 pr-3 font-semibold">Typ</th>
                  <th className="py-2 pr-3 font-semibold">Název</th>
                  <th className="py-2 pr-3 font-semibold">Hodnota</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {records.map((r) => (
                  <tr key={`${r.type}-${r.name}-${r.value}`}>
                    <td className="py-2.5 pr-3 font-semibold">{r.type}</td>
                    <td className="py-2.5 pr-3">
                      <code className="rounded bg-bg px-1.5 py-0.5">{r.name}</code>
                      <span className="block text-xs text-soft">{r.hint}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <code className="break-all rounded bg-bg px-1.5 py-0.5">{r.value}</code>
                    </td>
                    <td className="py-2.5 text-right">
                      <button type="button" onClick={() => copy(r.value)} className="text-xs font-semibold text-pine hover:underline">
                        Kopírovat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-soft">
            Pokud už u domény máš jiný záznam A nebo CNAME pro „@“ či „www“, nahraď ho. E-mailových záznamů (MX) se nedotýkej.
          </p>
          <details className="rounded-xl bg-bg px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">Kde to najdu u svého registrátora?</summary>
            <ul className="mt-2 space-y-1.5">
              {GUIDES.map((g) => (
                <li key={g.name}>
                  <strong className="font-semibold">{g.name}:</strong> <span className="text-soft">{g.text}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
