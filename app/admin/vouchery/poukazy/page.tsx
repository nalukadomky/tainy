"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminData, fmtDate } from "@/lib/admin";
import { VoucherTabs } from "@/components/VoucherTabs";
import { Icon } from "@/components/Icon";
import { ListPageSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { GiftVoucherCard } from "@/components/GiftVoucherCard";
import { GiftVoucherWizard } from "@/components/GiftVoucherWizard";
import { czk } from "@/lib/pricing";
import { parsePhotos } from "@/lib/photos";
import { siteUrl } from "@/lib/domains";
import { GIFT_STATUS, cleanGift, giftHeadline, weekendNight, type GiftDesign } from "@/lib/gift";

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
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [failed, setFailed] = useState(false);
  const [wizard, setWizard] = useState<Offer | "new" | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(() => {
    if (!slug) return;
    fetch(`/api/gifts?site=${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { offers: Offer[]; orders: Order[] }) => {
        setOffers(d.offers.map((o) => ({ ...cleanGift(o), id: o.id, onSale: o.onSale, sold: o.sold })));
        setOrders(d.orders);
      })
      .catch(() => setFailed(true));
  }, [slug]);
  useEffect(load, [load]);

  if (siteLoading || (!offers && !failed)) return <ListPageSkeleton label="Načítám dárkové poukazy" rows={4} />;
  if (siteError || failed || !site || !offers) return <p className="py-16 text-center text-soft">{siteError || "Dárkové poukazy se nepodařilo načíst."}</p>;

  const photos = [site.heroPhoto, ...parsePhotos(site.photos ?? "", site.name).map((p) => p.src)].filter((p, i, a): p is string => !!p && a.indexOf(p) === i);
  // Bez webu v tainy (jen widget) má nabídka samostatnou stránku okna widgetu
  const giftsUrl = site.widgetOnly ? `/embed/${site.slug}?tab=poukaz` : `${siteUrl(site)}/poukazy`;
  const paidOrders = orders.filter((o) => o.status === "paid" || o.status === "used");
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
      setOffers(before);
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
      <VoucherTabs active="gifts" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Dárkové poukazy</h1>
          <p className="mt-1 text-sm text-soft">Poukazy, které si lidé koupí na tvém webu a darují. Obdarovaný kód zadá při rezervaci.</p>
        </div>
        <button type="button" className="btn-primary h-10 !px-4 !py-0 text-sm" onClick={() => setWizard("new")}>
          + Nový poukaz
        </button>
      </div>

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

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Prodané poukazy</h2>
        {orders.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-soft">Zatím žádné objednávky. Jakmile si někdo poukaz objedná, uvidíš ho tady.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {orders.map((o) => {
              const st = GIFT_STATUS[o.status];
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className="w-24 shrink-0 font-mono font-semibold">{o.code || label(o.publicId)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {headOf(o.design)} · {czk(o.price)}
                    </span>
                    <span className="block text-xs text-soft">
                      {o.buyerName} ({o.buyerEmail}){o.recipient && ` · pro ${o.recipient}`} · {fmtDate(o.createdAt)}
                      {o.usedFor && ` · uplatněno ${fmtDate(o.usedFor.start)}`}
                      {o.status === "paid" && o.validTo && ` · platí do ${fmtDate(o.validTo)}`}
                    </span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                  {o.status === "pending" ? (
                    <span className="flex items-center gap-2">
                      <button type="button" className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => orderAction(o, "paid")}>
                        Zaplaceno
                      </button>
                      <button type="button" className="text-xs text-soft hover:text-coral" onClick={() => orderAction(o, "cancel")}>
                        Zrušit
                      </button>
                    </span>
                  ) : o.status === "paid" || o.status === "used" ? (
                    <span className="flex items-center gap-3 text-xs">
                      <a href={`/darek/${o.token}`} target="_blank" rel="noreferrer" className="font-medium text-pine hover:underline">
                        Poukaz
                      </a>
                      {o.status === "paid" && (
                        <button type="button" className="text-soft hover:text-ink" onClick={() => orderAction(o, "resend")}>
                          Poslat znovu
                        </button>
                      )}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <p className="flex items-center gap-2 text-xs text-soft">
          <Icon name="mail" size={14} /> Po označení „Zaplaceno“ vznikne kód poukazu a kupující dostane poukaz e-mailem.
        </p>
      </section>

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
