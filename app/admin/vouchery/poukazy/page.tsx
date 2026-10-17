"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, fieldSetter, SECTION_URL, useCachedJson } from "@/lib/section-cache";
import { createPortal } from "react-dom";
import { useAdminData, fmtDate } from "@/lib/admin";
import { VoucherTabs } from "@/components/VoucherTabs";
import { Icon } from "@/components/Icon";
import { ListPageSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { GiftVoucherCard } from "@/components/GiftVoucherCard";
import { BadgeMenu } from "@/components/StatusMenu";
import { GiftVoucherWizard } from "@/components/GiftVoucherWizard";
import { czk } from "@/lib/pricing";
import { parsePhotos } from "@/lib/photos";
import { siteUrl } from "@/lib/domains";
import { GIFT_STATUS, cleanGift, giftHeadline, weekendNight, type GiftDesign } from "@/lib/gift";
import { HelpTip } from "@/components/HelpTip";

// Vouchery → Dárkové poukazy: nabídka poukazů na webu (průvodce, zveřejnění),
// prodané poukazy (potvrzení platby = kód a e-mail kupujícímu).

type Offer = GiftDesign & { id: string; onSale: boolean; sold: number };
type Order = {
  id: string;
  publicId: string;
  token: string;
  design: string;
  price: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  buyerAddress?: string;
  recipient: string;
  status: "pending" | "paid" | "used" | "cancelled";
  code: string;
  createdAt: string;
  validTo: string | null;
  usedFor: { start: string; end: string } | null;
};

const label = (publicId: string) => `P-${publicId.replace(/^p/, "")}`;
const headOf = (raw: string) => {
  try {
    return giftHeadline(cleanGift(JSON.parse(raw)));
  } catch {
    return "Poukaz";
  }
};

export default function GiftVouchersPage() {
  const { slug, site, loading: siteLoading, error: siteError } = useAdminData();
  // Z mezipaměti hned (i přednačtené z menu), obnova na pozadí
  const url = slug ? SECTION_URL.gifts(slug) : null;
  const [data, setData] = useCachedJson<{ offers: Offer[]; orders: Order[] }>(url);
  const offers = useMemo(
    () => data?.offers.map((o) => ({ ...cleanGift(o), id: o.id, onSale: o.onSale, sold: o.sold })) ?? null,
    [data],
  );
  const orders = data?.orders ?? [];
  const setOffers = useMemo(() => fieldSetter(setData, "offers", []), [setData]);
  const setOrders = useMemo(() => fieldSetter(setData, "orders", []), [setData]);
  const [failed, setFailed] = useState(false);
  // Podzáložky: Prodané (objednávky, potvrzení platby) | Nabídka (tvorba poukazů); ?tab=nabidka
  const [tab, setTabState] = useState<"offers" | "sold">("sold");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "nabidka") setTabState("offers");
  }, []);
  const setTab = (t: "offers" | "sold") => {
    setTabState(t);
    window.history.replaceState(null, "", t === "offers" ? "?tab=nabidka" : window.location.pathname);
  };
  const [wizard, setWizard] = useState<Offer | "new" | null>(null);
  // Rozbalený detail prodaného poukazu
  const [detail, setDetail] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(() => {
    if (!url) return;
    fetchJson<{ offers: Offer[]; orders: Order[] }>(url).then((d) => (d ? setData(d) : setFailed(true)));
  }, [url, setData]);
  useEffect(load, [load]);

  if (siteLoading || (!offers && !failed)) return <ListPageSkeleton label="Načítám dárkové poukazy" rows={4} />;
  if (siteError || failed || !site || !offers) return <p className="py-16 text-center text-soft">{siteError || "Dárkové poukazy se nepodařilo načíst."}</p>;

  const photos = [site.heroPhoto, ...parsePhotos(site.photos ?? "", site.name).map((p) => p.src)].filter((p, i, a): p is string => !!p && a.indexOf(p) === i);
  // Bez webu v tainy (jen widget) má nabídka samostatnou stránku okna widgetu
  const giftsUrl = site.widgetOnly ? `/embed/${site.slug}?tab=poukaz` : `${siteUrl(site)}/poukazy`;
  const paidOrders = orders.filter((o) => o.status === "paid" || o.status === "used");
  const pending = orders.filter((o) => o.status === "pending");
  const pendingTotal = pending.reduce((s, o) => s + o.price, 0);
  const stats = {
    sold: paidOrders.length,
    revenue: paidOrders.reduce((s, o) => s + o.price, 0),
    open: orders.filter((o) => o.status === "paid").reduce((s, o) => s + o.price, 0),
  };

  async function save(d: GiftDesign, onSale: boolean): Promise<string | null> {
    const editing = wizard !== "new" ? wizard : null;
    const res = await fetch(editing ? `/api/gifts/${editing.id}` : "/api/gifts", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site: slug, design: d, onSale }),
    }).catch(() => null);
    if (!res?.ok) return "Uložení se nepovedlo. Zkus to znovu.";
    const saved = await res.json();
    const offer: Offer = { ...cleanGift(saved), id: saved.id, onSale: saved.onSale, sold: editing?.sold ?? 0 };
    setOffers((all) => (editing ? all!.map((x) => (x.id === offer.id ? offer : x)) : [...all!, offer]));
    setWizard(null);
    toast.show(onSale ? "Poukaz je v nabídce." : "Poukaz je uložený (zatím skrytý).", "success");
    return null;
  }

  async function toggle(o: Offer) {
    setOffers((all) => all!.map((x) => (x.id === o.id ? { ...x, onSale: !o.onSale } : x)));
    const res = await fetch(`/api/gifts/${o.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ onSale: !o.onSale }) }).catch(() => null);
    if (!res?.ok) {
      setOffers((all) => all!.map((x) => (x.id === o.id ? o : x)));
      toast.show("Změnu se nepodařilo uložit.", "error");
    }
  }

  async function remove(o: Offer) {
    const ok = await confirm.ask({
      title: `Smazat poukaz „${giftHeadline(o)}“?`,
      message: "Zmizí z nabídky. Už prodané poukazy zůstanou platné.",
      confirmLabel: "Smazat",
      tone: "danger",
    });
    if (!ok) return;
    const before = offers;
    setOffers((all) => all!.filter((x) => x.id !== o.id));
    const res = await fetch(`/api/gifts/${o.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setOffers(before ?? []);
      toast.show("Smazání se nepovedlo.", "error");
    }
  }

  async function orderAction(o: Order, action: "paid" | "cancel" | "resend") {
    if (action === "cancel" && !(await confirm.ask({ title: `Zrušit objednávku ${label(o.publicId)}?`, message: "Kupující poukaz nedostane.", confirmLabel: "Zrušit objednávku", tone: "danger" }))) return;
    const before = orders;
    if (action !== "resend") setOrders((all) => all.map((x) => (x.id === o.id ? { ...x, status: action === "paid" ? "paid" : "cancelled" } : x)));
    const res = await fetch(`/api/gift-orders/${o.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setOrders(before);
      toast.show(data?.error ?? "Nepodařilo se to uložit.", "error");
      return;
    }
    if (action === "paid") {
      setOrders((all) => all.map((x) => (x.id === o.id ? { ...x, status: "paid", code: data.code } : x)));
      toast.show(`Zaplaceno — poukaz s kódem ${data.code} odešel na ${o.buyerEmail}.`, "success");
      load();
    } else if (action === "resend") toast.show(`Poukaz odešel znovu na ${o.buyerEmail}.`, "success");
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show("Odkaz je zkopírovaný.", "success");
    } catch {
      window.prompt("Odkaz:", text);
    }
  }

  return (
    <div className="space-y-6">
      {toast.node}
      {confirm.node}
      <VoucherTabs active="gifts" giftsBadge={pending.length} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex flex-wrap items-center">
            Dárkové poukazy
            <HelpTip>{tab === "offers"
              ? "Poukazy, které si lidé koupí na tvém webu a darují. Obdarovaný kód zadá při rezervaci."
              : "Objednané poukazy. Až platba dorazí na účet, označ ji — kupujícímu odejde poukaz s kódem."}</HelpTip>
          </h1>
        </div>
        {tab === "offers" && (
          <button type="button" className="btn-primary h-10 !px-4 !py-0 text-sm" onClick={() => setWizard("new")}>
            + Nový poukaz
          </button>
        )}
      </div>

      <div role="tablist" aria-label="Dárkové poukazy" className="flex gap-6 border-b border-line text-sm font-semibold">
        {(
          [
            ["sold", "Prodané"],
            ["offers", "Nabídka"],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 ${tab === key ? "border-pine text-ink" : "border-transparent text-soft hover:text-ink"}`}
          >
            {text}
            {key === "sold" && pending.length > 0 && (
              <span className="min-w-5 rounded-full bg-amber px-1.5 text-center text-[11px] leading-5 text-ink tabular-nums" title="Čeká na zaplacení">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {pending.length > 0 && (
        <button
          type="button"
          onClick={() => setTab("sold")}
          className={`flex w-full items-center gap-3 rounded-2xl border border-amber/50 bg-surface px-4 py-3 text-left text-sm transition ${tab === "offers" ? "hover:bg-amber/5" : "cursor-default"}`}
        >
          <Icon name="clock" size={18} className="shrink-0 text-[#92600a]" />
          <span className="min-w-0 flex-1">
            {pending.length} {pending.length === 1 ? "objednávka čeká" : pending.length < 5 ? "objednávky čekají" : "objednávek čeká"} na zaplacení ·{" "}
            <strong className="font-semibold">{czk(pendingTotal)}</strong>
          </span>
          {tab === "offers" && <span className="shrink-0 font-medium text-pine">Zobrazit →</span>}
        </button>
      )}

      {tab === "sold" && (
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Prodáno", `${stats.sold} ×`],
            ["Tržby z poukazů", czk(stats.revenue)],
            ["Čeká na uplatnění", czk(stats.open)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-medium text-soft">{l}</p>
              <p className="mt-1 font-display text-lg font-semibold sm:text-2xl">{v}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "offers" && (
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">{site.widgetOnly ? "Nabídka ve widgetu" : "Nabídka na webu"}</h2>
          {offers.some((o) => o.onSale) && (
            <a href={giftsUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-pine hover:underline">
              Stránka poukazů ↗
            </a>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((o) => (
            <div key={o.id} className="rounded-2xl border border-line bg-surface p-3">
              <button type="button" onClick={() => setWizard(o)} className={`block w-full ${o.onSale ? "" : "opacity-60"}`} aria-label={`Upravit ${giftHeadline(o)}`}>
                <GiftVoucherCard d={o} site={site.name} />
              </button>
              <div className="mt-3 flex items-start justify-between gap-2 px-1">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{giftHeadline(o)}</span>
                  <span className="block text-xs text-soft">
                    {czk(o.price)} · prodáno {o.sold}×
                  </span>
                </span>
                <button type="button" role="switch" aria-checked={o.onSale} onClick={() => toggle(o)} className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-soft">
                  {o.onSale ? "Na webu" : "Skryto"}
                  <span className={`relative h-5 w-9 rounded-full transition ${o.onSale ? "bg-pine" : "bg-line"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${o.onSale ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                </button>
              </div>
              <div className="mt-2 flex gap-3 border-t border-line px-1 pt-2 text-sm">
                <button type="button" className="font-medium text-pine hover:underline" onClick={() => setWizard(o)}>
                  Upravit
                </button>
                <button type="button" className="text-soft hover:text-ink" onClick={() => copy(giftsUrl)}>
                  Kopírovat odkaz
                </button>
                <button type="button" className="ml-auto text-soft hover:text-coral" onClick={() => remove(o)}>
                  Smazat
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setWizard("new")}
            className="flex min-h-48 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line text-sm font-semibold text-soft hover:border-pine/40 hover:text-ink"
          >
            <span className="text-3xl leading-none">+</span>
            {offers.length ? "Nový poukaz" : "Vytvořit první poukaz"}
          </button>
        </div>
        {!site.bankAccount && (
          <p className="flex items-center gap-2 rounded-xl bg-amber/15 px-4 py-2.5 text-sm text-[#92600a]">
            <Icon name="alert" size={16} /> Poukazy se kupujícím zobrazí, až doplníš číslo účtu v Nastavení → Firma a platby — platí se QR kódem.
          </p>
        )}
      </section>

      )}

      {tab === "sold" && (
      <section className="space-y-3">
        {orders.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-soft">Zatím žádné objednávky. Jakmile si někdo poukaz objedná, uvidíš ho tady.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {[...pending, ...orders.filter((o) => o.status !== "pending")].map((o) => {
              const st = GIFT_STATUS[o.status];
              return (
                <li key={o.id}>
                  <div className="flex items-center gap-3 px-4 py-3 sm:gap-4">
                    {/* Hlavní řádek: kdo koupil a za kolik, zbytek v detailu */}
                    <button
                      type="button"
                      onClick={() => setDetail(o.id)}
                      aria-haspopup="dialog"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{o.buyerName}</span>
                        <span className="block truncate text-xs text-soft">
                          {fmtDate(o.createdAt)} · {o.code || label(o.publicId)}
                        </span>
                      </span>
                    </button>
                    {/* Cena a stav: na telefonu pod sebou, ať zůstane místo pro jméno */}
                    <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
                    <span className={`font-semibold tabular-nums ${o.status === "cancelled" ? "text-soft line-through" : ""}`}>{czk(o.price)}</span>
                    {/* Stejně jako u rezervací: štítek stavu jde rozkliknout a změnit */}
                    <span className="flex justify-end sm:w-32">
                      {o.status === "pending" ? (
                        <BadgeMenu
                          label={st.label}
                          className={st.cls}
                          current="pending"
                          options={[
                            { key: "paid", label: "✓ Označit jako zaplacené" },
                            { key: "cancel", label: "✕ Zrušit objednávku", danger: true },
                          ]}
                          onPick={(k) => orderAction(o, k as "paid" | "cancel")}
                        />
                      ) : (
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                      )}
                    </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="flex items-center gap-2 text-xs text-soft">
          <Icon name="mail" size={14} /> Detail otevřeš kliknutím na řádek, stav změníš na štítku. Po označení „Zaplaceno“ vznikne kód poukazu a kupující dostane poukaz e-mailem.
        </p>
      </section>
      )}

      {(() => {
        const o = detail ? orders.find((x) => x.id === detail) : null;
        return o ? (
          <GiftOrderSheet
            o={o}
            site={site.name}
            onClose={() => setDetail(null)}
            onAction={(a) => orderAction(o, a)}
            onEdited={(design, recipient) => setOrders((all) => all.map((x) => (x.id === o.id ? { ...x, design, recipient } : x)))}
            toast={toast.show}
          />
        ) : null;
      })()}

      {wizard &&
        createPortal(
          <div className="fixed inset-0 z-[80] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Dárkový poukaz">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/90 px-5 py-3 backdrop-blur">
              <span className="font-display text-lg font-semibold">{wizard === "new" ? "Nový dárkový poukaz" : "Upravit poukaz"}</span>
              <button type="button" onClick={() => setWizard(null)} aria-label="Zavřít" className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-soft hover:bg-surface">
                ×
              </button>
            </div>
            <div className="px-5 py-5 sm:py-6">
              <GiftVoucherWizard
                fill
                initial={wizard === "new" ? null : wizard}
                siteName={site.name}
                photos={photos}
                nightPrice={(persons) => weekendNight(site, persons)}
                onSave={save}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Detail prodaného poukazu — okno nad stránkou (na telefonu zespodu), stejně jako detail rezervace. */
function GiftOrderSheet({
  o,
  site,
  onClose,
  onAction,
  onEdited,
  toast,
}: {
  o: Order;
  site: string;
  onClose: () => void;
  onAction: (action: "paid" | "cancel" | "resend") => Promise<void>;
  /** Text poukazu (Komu, věnování) upravený majitelem. */
  onEdited: (design: string, recipient: string) => void;
  toast: (text: string, tone?: "success" | "error") => void;
}) {
  // Úprava textu, který napsal kupující (překlep, jiné jméno…)
  const [edit, setEdit] = useState<{ recipient: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const editable = o.status === "pending" || o.status === "paid";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  async function saveText(send: boolean) {
    if (!edit) return;
    setSaving(true);
    const res = await fetch(`/api/gift-orders/${o.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "edit", recipient: edit.recipient, message: edit.message, send }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSaving(false);
    if (data?.design) onEdited(data.design, data.recipient);
    if (!res?.ok) return toast(data?.error ?? "Úpravu se nepodařilo uložit.", "error");
    setEdit(null);
    toast(send ? `Upravený poukaz odešel na ${o.buyerEmail}.` : "Text poukazu je upravený.", "success");
  }

  const st = GIFT_STATUS[o.status];
  let design: GiftDesign | null = null;
  try {
    const raw = JSON.parse(o.design);
    design = { ...cleanGift(raw), recipient: typeof raw.recipient === "string" ? raw.recipient : "" };
  } catch {}
  const shown = design && edit ? { ...design, recipient: edit.recipient.trim(), message: edit.message.trim() } : design;
  const head = headOf(o.design);
  const rows: [string, React.ReactNode][] = [
    ["Poukaz", head === czk(o.price) ? czk(o.price) : `${head} · ${czk(o.price)}`],
    ["Objednávka", `${label(o.publicId)} · VS ${o.publicId.replace(/\D/g, "")}`],
    ...(o.code ? [["Kód", <span key="c" className="font-mono font-semibold">{o.code}</span>] as [string, React.ReactNode]] : []),
    ["E-mail", o.buyerEmail],
    ...(o.buyerPhone ? [["Telefon", o.buyerPhone] as [string, React.ReactNode]] : []),
    ...(o.buyerAddress ? [["Adresa", o.buyerAddress] as [string, React.ReactNode]] : []),
    ...(o.recipient ? [["Komu", o.recipient] as [string, React.ReactNode]] : []),
    ["Objednáno", fmtDate(o.createdAt)],
    ...(o.validTo && o.status !== "pending" ? [["Platí do", fmtDate(o.validTo)] as [string, React.ReactNode]] : []),
    ...(o.usedFor ? [["Uplatněno", `pobyt ${fmtDate(o.usedFor.start)} – ${fmtDate(o.usedFor.end)}`] as [string, React.ReactNode]] : []),
  ];

  // Do <body>: předek s CSS transformací by jinak rozbil `fixed` překryv.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Poukaz ${o.buyerName}`}
        className="rise flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold leading-tight">{o.buyerName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{czk(o.price)}</span>
              {o.status === "pending" ? (
                <BadgeMenu
                  label={st.label}
                  className={st.cls}
                  current="pending"
                  options={[
                    { key: "paid", label: "✓ Označit jako zaplacené" },
                    { key: "cancel", label: "✕ Zrušit objednávku", danger: true },
                  ]}
                  onPick={(k) => onAction(k as "paid" | "cancel")}
                />
              ) : (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
              )}
              <span className="text-soft">objednáno {fmtDate(o.createdAt)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-soft hover:bg-bg hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto overscroll-contain px-5 pb-8 pt-5 sm:px-6">
          {design && shown && (
            <div className="group relative mx-auto max-w-sm">
              <GiftVoucherCard d={shown} site={site} code={o.code || undefined} validTo={o.validTo} />
              {editable && !edit && (
                <button
                  type="button"
                  onClick={() => setEdit({ recipient: design.recipient ?? "", message: design.message })}
                  className="absolute inset-0 flex items-center justify-center rounded-2xl bg-ink/0 opacity-0 transition group-hover:bg-ink/35 group-hover:opacity-100 focus-visible:bg-ink/35 focus-visible:opacity-100 [@media(hover:none)]:inset-auto [@media(hover:none)]:bottom-3 [@media(hover:none)]:right-3 [@media(hover:none)]:opacity-100"
                >
                  <span className="flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-lg">
                    <Icon name="pen" size={15} /> Upravit text
                  </span>
                </button>
              )}
            </div>
          )}
          {edit && (
            <div className="space-y-3 rounded-2xl border border-pine/30 bg-pine/5 p-4">
              <p className="text-sm font-semibold">Upravit text poukazu</p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-soft">Komu</span>
                <input
                  className="field"
                  maxLength={60}
                  placeholder="např. Pro Janu a Honzu"
                  value={edit.recipient}
                  onChange={(e) => setEdit({ ...edit, recipient: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 flex justify-between text-xs font-medium text-soft">
                  Věnování
                  <span className="tabular-nums">{edit.message.length}/140</span>
                </span>
                <textarea
                  className="field min-h-20"
                  maxLength={140}
                  value={edit.message}
                  onChange={(e) => setEdit({ ...edit, message: e.target.value.split("\n").slice(0, 4).join("\n") })}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {o.status === "paid" ? (
                  <>
                    <button type="button" disabled={saving} className="btn-primary !px-4 !py-2 text-sm" onClick={() => saveText(true)}>
                      {saving ? "Ukládám…" : "Uložit a poslat znovu"}
                    </button>
                    <button type="button" disabled={saving} className="btn-ghost !px-4 !py-2 text-sm" onClick={() => saveText(false)}>
                      Jen uložit
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={saving} className="btn-primary !px-4 !py-2 text-sm" onClick={() => saveText(false)}>
                    {saving ? "Ukládám…" : "Uložit"}
                  </button>
                )}
                <button type="button" disabled={saving} className="px-2 text-sm font-medium text-soft hover:text-ink" onClick={() => setEdit(null)}>
                  Zrušit
                </button>
              </div>
              {o.status === "pending" && <p className="text-xs text-soft">Kupující dostane poukaz s upraveným textem po zaplacení.</p>}
            </div>
          )}
          <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-4 px-4 py-2.5">
                <dt className="w-24 shrink-0 text-soft">{k}</dt>
                <dd className="min-w-0 flex-1 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          {(o.status === "paid" || o.status === "used") && (
            <div className="flex flex-wrap gap-2">
              <a href={`/darek/${o.token}`} target="_blank" rel="noreferrer" className="btn-ghost !px-4 !py-2 text-sm">
                Zobrazit poukaz ↗
              </a>
              {o.status === "paid" && (
                <button type="button" className="btn-ghost !px-4 !py-2 text-sm" onClick={() => onAction("resend")}>
                  Poslat poukaz znovu
                </button>
              )}
            </div>
          )}
          {o.status === "pending" && (
            <p className="text-xs text-soft">Až platba s VS {o.publicId.replace(/\D/g, "")} dorazí na účet, označ ji na štítku jako Zaplaceno — kupujícímu odejde poukaz s kódem.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
