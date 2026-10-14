"use client";

import { useState } from "react";

// Seznam žádostí o přístup: pozvat (osobní odkaz na registraci), zkopírovat
// e-maily. Pozvání se ukáže hned, uložení běží na pozadí.

export type EarlyAccessRow = {
  id: string;
  email: string;
  name: string;
  propertyType: string;
  website: string;
  source: string;
  createdAt: string;
  invitedAt: string | null;
};

const date = (iso: string) => new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function EarlyAccessAdmin({ rows: initial, base }: { rows: EarlyAccessRow[]; base: string }) {
  const [rows, setRows] = useState(initial);
  const [note, setNote] = useState("");
  const waiting = rows.filter((r) => !r.invitedAt);

  function flash(t: string) {
    setNote(t);
    window.setTimeout(() => setNote(""), 2200);
  }

  async function setInvited(id: string, invited: boolean) {
    const before = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, invitedAt: invited ? new Date().toISOString() : null } : r)));
    const res = await fetch(`/api/early-access/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invited }),
    }).catch(() => null);
    if (!res?.ok) {
      setRows(before);
      flash("Nepodařilo se uložit, zkus to znovu.");
      return;
    }
    if (invited && (await copy(`${base}/register?pozvanka=${id}`))) flash("Pozváno — odkaz na registraci je zkopírovaný.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          <strong>{rows.length}</strong> žádostí · <strong>{waiting.length}</strong> čeká na pozvání
        </p>
        <button
          type="button"
          className="btn-ghost !px-4 !py-2 text-sm"
          disabled={!waiting.length}
          onClick={async () => flash((await copy(waiting.map((r) => r.email).join(", "))) ? "E-maily čekajících jsou zkopírované." : "Kopírování nejde.")}
        >
          Kopírovat e-maily čekajících
        </button>
        {note && (
          <span className="text-sm text-pine" role="status">
            {note}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-soft">Zatím žádné žádosti.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.email}</p>
                <p className="truncate text-sm text-soft">
                  {[r.name, r.propertyType, r.website, `${date(r.createdAt)}`, r.source !== "landing" && `z ${r.source}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              {r.invitedAt ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-pine/10 px-2.5 py-1 text-xs font-semibold text-pine">Pozván {date(r.invitedAt)}</span>
                  <button
                    type="button"
                    className="text-sm text-pine underline-offset-2 hover:underline"
                    onClick={async () => flash((await copy(`${base}/register?pozvanka=${r.id}`)) ? "Odkaz na registraci je zkopírovaný." : "Kopírování nejde.")}
                  >
                    Odkaz
                  </button>
                  <button type="button" className="text-sm text-soft hover:text-ink" onClick={() => setInvited(r.id, false)}>
                    Zrušit
                  </button>
                </div>
              ) : (
                <button type="button" className="btn-primary !px-4 !py-2 text-sm" onClick={() => setInvited(r.id, true)}>
                  Pozvat
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
