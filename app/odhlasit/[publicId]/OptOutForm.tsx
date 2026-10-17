"use client";

import { useState } from "react";

export function OptOutForm({ publicId, site, email, optedOut }: { publicId: string; site: string; email: string; optedOut: boolean }) {
  const [done, setDone] = useState(optedOut);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(back: boolean) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/offers/optout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicId, back }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("Nepodařilo se to uložit. Zkus to prosím znovu.");
    setDone(!back);
  }

  return done ? (
    <>
      <h1 className="font-display text-2xl font-semibold">Odhlášeno</h1>
      <p className="mt-2 text-soft">
        Na <strong className="text-ink">{email}</strong> už ti {site} nebude posílat nabídky dalšího pobytu. Informace k tvým
        rezervacím ti chodit budou dál.
      </p>
      <button type="button" disabled={busy} onClick={() => send(true)} className="mt-6 text-sm font-medium text-pine hover:underline">
        Rozmyslel jsem se, nabídky chci
      </button>
      {error && <p className="mt-3 text-sm text-coral">{error}</p>}
    </>
  ) : (
    <>
      <h1 className="font-display text-2xl font-semibold">Odhlásit se z nabídek?</h1>
      <p className="mt-2 text-soft">
        {site} ti občas pošle nabídku nebo slevu na další pobyt na <strong className="text-ink">{email}</strong>.
      </p>
      <button type="button" disabled={busy} onClick={() => send(false)} className="btn-primary mt-6 w-full">
        {busy ? "Ukládám…" : "Odhlásit z nabídek"}
      </button>
      {error && <p className="mt-3 text-sm text-coral">{error}</p>}
    </>
  );
}
