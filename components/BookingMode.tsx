"use client";

import { useState } from "react";
import type { Site } from "@/lib/admin";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { HelpTip } from "@/components/HelpTip";

// Nastavení → Web a doména: kde si hosté rezervují — celý web v tainy, nebo
// jen widget na vlastním webu majitele. Přepnutí se uloží hned a menu se
// přenačte (Můj web ↔ Widget). Rezervace, e-maily, check-in i poukazy běží
// v obou režimech stejně, vypne se jen web na tainy.cz a vlastní doména.

function Option({ on, icon, title, text, hint, onPick, disabled }: {
  on: boolean;
  icon: "home" | "zap";
  title: string;
  text: string;
  hint: string;
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={on ? undefined : onPick}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition sm:p-5 ${
        on ? "cursor-default border-pine bg-pine/5 ring-1 ring-pine" : "border-line bg-surface hover:border-pine/40"
      }`}
    >
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-pine" : "border-line"}`}>
        {on && <span className="h-2.5 w-2.5 rounded-full bg-pine" />}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
          <Icon name={icon} size={17} className="text-pine" /> {title}
          {on && <span className="rounded-full bg-pine px-2 py-0.5 text-[11px] font-semibold text-white">Teď používáš</span>}
        </span>
        <span className="mt-1 block text-sm text-soft">{text}</span>
        <span className="mt-2 block text-xs font-medium text-pine">{hint}</span>
      </span>
    </button>
  );
}

export function BookingMode({ form }: { form: Site }) {
  const toast = useToast();
  const confirmDlg = useConfirm();
  const [switching, setSwitching] = useState(false);
  const domain = form.customDomain;

  async function pick(widgetOnly: boolean) {
    const ok = await confirmDlg.ask(
      widgetOnly
        ? {
            title: "Přejít jen na widget?",
            wide: true,
            confirmLabel: "Přejít na widget",
            tone: "primary",
            message: (
              <>
                <p>Hosté budou rezervovat přes tlačítko na tvém vlastním webu.</p>
                <div className="rounded-2xl border border-coral/30 bg-coral/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-coral">Vypne se</p>
                  <ul className="mt-2 space-y-1.5 text-ink">
                    <li className="flex gap-2.5">
                      <span className="text-coral">✕</span>
                      <span>
                        <strong className="font-semibold">Web tainy.cz/{form.slug}</strong>{" "}
                        <span className="text-soft">— přestane být veřejný, fotky a texty zůstanou uložené</span>
                      </span>
                    </li>
                    {domain && (
                      <li className="flex gap-2.5">
                        <span className="text-coral">✕</span>
                        <span>
                          <strong className="font-semibold">Vlastní doména</strong> <span className="text-soft">— {domain} přestane ukazovat web</span>
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
                <div className="rounded-2xl border border-line bg-bg p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-pine">Funguje dál ve widgetu</p>
                  <ul className="mt-2 grid gap-x-4 gap-y-1.5 text-ink sm:grid-cols-2">
                    {[
                      "Rezervace a platby",
                      "Prodej dárkových poukazů",
                      "E-maily hostům, check-in a kódy k zámku",
                      "Kalendář a synchronizace s portály",
                      "Kniha ubytovaných a slevové kódy",
                    ].map((t) => (
                      <li key={t} className="flex gap-2">
                        <Icon name="checkCircle" size={16} className="mt-0.5 shrink-0 text-pine" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs">Web v tainy můžeš kdykoli zase zapnout tady v nastavení.</p>
              </>
            ),
          }
        : {
            title: "Zapnout web v tainy?",
            confirmLabel: "Zapnout web",
            tone: "primary",
            message: `Web bude zase veřejný na tainy.cz/${form.slug}${domain ? ` i na ${domain}` : ""}. Widget na tvém webu funguje dál.`,
          },
    );
    if (!ok) return;
    setSwitching(true);
    const res = await fetch(`/api/sites/${form.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetOnly }),
    }).catch(() => null);
    if (!res?.ok) {
      setSwitching(false);
      toast.show("Změnu se nepodařilo uložit. Zkus to prosím znovu.");
      return;
    }
    // Menu (Můj web ↔ Widget) se načítá se stránkou
    window.location.href = widgetOnly ? "/admin/widget" : "/admin/web/builder?panel=galerie";
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      {toast.node}
      {confirmDlg.node}
      <h2 className="font-display text-xl font-semibold flex flex-wrap items-center">
        Kde si hosté rezervují
        <HelpTip>Rezervace, platby, e-maily, check-in i dárkové poukazy fungují stejně v obou případech — liší se jen to, kde je hosté uvidí.</HelpTip>
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Kde si hosté rezervují">
        <Option
          on={!form.widgetOnly}
          disabled={switching}
          onPick={() => pick(false)}
          icon="home"
          title="Web v tainy"
          text="Celý web s fotkami, popisem, kalendářem, rezervací a prodejem dárkových poukazů."
          hint={`tainy.cz/${form.slug}`}
        />
        <Option
          on={form.widgetOnly}
          disabled={switching}
          onPick={() => pick(true)}
          icon="zap"
          title="Jen widget na mém webu"
          text="Máš vlastní web (Webnode, WordPress…) a vložíš na něj tlačítka Rezervovat a Dárkový poukaz."
          hint="tvůj web + okno s rezervací z tainy"
        />
      </div>
    </section>
  );
}
