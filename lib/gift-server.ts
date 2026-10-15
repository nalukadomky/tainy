import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import type { GiftOffer, GiftOrder, Site } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl, send } from "@/lib/email";
import { esc, fmt, layout } from "@/lib/email-templates";
import { czk } from "@/lib/pricing";
import { generateCode } from "@/lib/voucher";
import { cleanGift, giftCodeValue, giftHeadline, type GiftDesign } from "@/lib/gift";
import { toISO } from "@/lib/stay";

// Dárkové poukazy na serveru: nabídka ↔ návrh, objednávka z webu, potvrzení
// platby (vznikne jednorázový kód poukazu) a e-maily kupujícímu a majiteli.

export const offerDesign = (o: GiftOffer): GiftDesign =>
  cleanGift({ ...o, photo: o.photo });

export const orderDesign = (o: GiftOrder): GiftDesign => {
  try {
    return cleanGift(JSON.parse(o.design));
  } catch {
    return cleanGift({});
  }
};

/** Odkaz na objednávku / hotový poukaz (stránka /darek/<tajný klíč>). */
export const giftLink = (accessToken: string) => `${appUrl()}/darek/${accessToken}`;

/** Tajný klíč do odkazu — 128 bitů náhody, nejde uhodnout ani projít. */
export const newGiftToken = () => randomBytes(16).toString("base64url");

/** Číslo objednávky pro lidi a variabilní symbol: P-4821. */
export async function newGiftPublicId(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const id = `p${randomInt(100000, 999999)}`;
    if (!(await prisma.giftOrder.findUnique({ where: { publicId: id }, select: { id: true } }))) return id;
  }
  return `p${Date.now()}`;
}

export const orderLabel = (publicId: string) => `P-${publicId.replace(/^p/, "")}`;

/** Zaplaceno: vytvoří jednorázový kód poukazu (Voucher, gift) a pošle poukaz kupujícímu. */
export async function markGiftPaid(orderId: string): Promise<{ ok: true; code: string } | { error: string }> {
  const order = await prisma.giftOrder.findUnique({ where: { id: orderId }, include: { site: true } });
  if (!order) return { error: "Objednávka nenalezena." };
  if (order.status === "paid") return { ok: true, code: order.code };
  if (order.status === "cancelled") return { error: "Objednávka je zrušená." };
  const d = orderDesign(order);
  const validTo = new Date();
  validTo.setUTCHours(0, 0, 0, 0);
  validTo.setUTCMonth(validTo.getUTCMonth() + d.validMonths);

  let code = "";
  for (let i = 0; i < 10 && !code; i++) {
    const c = generateCode(order.site.name);
    if (!(await prisma.voucher.findUnique({ where: { siteId_code: { siteId: order.siteId, code: c } } }))) code = c;
  }
  if (!code) return { error: "Kód se nepodařilo vytvořit, zkus to znovu." };

  await prisma.$transaction([
    prisma.voucher.create({
      data: {
        siteId: order.siteId,
        code,
        kind: "czk",
        value: giftCodeValue(d),
        validTo,
        maxUses: 1,
        note: `Dárkový poukaz ${orderLabel(order.publicId)} · ${order.buyerName}`,
        gift: true,
        weekend: d.kind === "weekend",
      },
    }),
    prisma.giftOrder.update({ where: { id: order.id }, data: { status: "paid", paidAt: new Date(), code, validTo } }),
  ]);
  await sendGiftVoucher({ ...order, code, validTo }, order.site, d).catch(() => {});
  return { ok: true, code };
}

/* ---------- E-maily ---------- */

const P = "margin:0 0 16px;font-size:15px;line-height:1.6";
const MUTED = "color:#5a6557";
const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#2c5e3f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px">${label}</a>`;

/** Kupujícímu po objednání: shrnutí a odkaz na platbu QR kódem. */
export async function sendGiftOrderMail(order: GiftOrder, site: Site, d: GiftDesign) {
  const html = layout(
    `<p style="${P}">Dobrý den, děkujeme za objednávku dárkového poukazu <strong>${esc(giftHeadline(d))}</strong> do ${esc(site.name)}.</p>
     <p style="${P}">Částka <strong>${czk(order.price)}</strong>. Po připsání platby vám poukaz pošleme e-mailem — k vytištění nebo přeposlání.</p>
     <p style="margin:0 0 16px">${button(giftLink(order.accessToken), "Zobrazit platbu a QR kód")}</p>
     <p style="margin:0;font-size:13px;${MUTED}">Objednávka ${orderLabel(order.publicId)}</p>`,
    "Objednávka dárkového poukazu",
  );
  return send({ to: order.buyerEmail, subject: `Dárkový poukaz ${site.name} — ${orderLabel(order.publicId)}`, html, replyTo: site.contactEmail });
}

/** Majiteli: nová objednávka poukazu (označí zaplaceno v administraci). */
export async function sendGiftOwnerMail(order: GiftOrder, site: Site, d: GiftDesign) {
  if (!site.contactEmail) return false;
  const html = layout(
    `<p style="${P}"><strong>${esc(order.buyerName)}</strong> (${esc(order.buyerEmail)}) objednal(a) poukaz <strong>${esc(giftHeadline(d))}</strong> za ${czk(order.price)}.</p>
     <p style="${P}">Až platba dorazí, označ ji v administraci jako zaplacenou — kupujícímu se poukaz pošle sám.</p>
     ${button(`${appUrl()}/admin/vouchery/poukazy`, "Otevřít dárkové poukazy")}`,
    "Nová objednávka poukazu",
  );
  return send({ to: site.contactEmail, subject: `Objednávka poukazu ${orderLabel(order.publicId)} — ${czk(order.price)}`, html, replyTo: order.buyerEmail });
}

/** Kupujícímu po zaplacení: kód poukazu a odkaz na poukaz k vytištění. */
export async function sendGiftVoucher(order: GiftOrder & { code: string; validTo: Date }, site: Site, d: GiftDesign) {
  const html = layout(
    `<p style="${P}">Platba dorazila, děkujeme! Tady je dárkový poukaz <strong>${esc(giftHeadline(d))}</strong> do ${esc(site.name)}.</p>
     <div style="background:#f6efe0;border-radius:14px;padding:16px 18px;margin:0 0 16px;text-align:center">
       <span style="${MUTED};font-size:13px">Kód poukazu</span><br>
       <span style="font-size:22px;font-weight:700;letter-spacing:.08em">${esc(order.code)}</span><br>
       <span style="${MUTED};font-size:13px">Platí do ${fmt(toISO(order.validTo))}${d.kind === "weekend" ? " · na víkend pá–ne" : ""}</span>
     </div>
     <p style="${P}">Poukaz si otevřete, vytisknete nebo pošlete dál přes tlačítko níže. Obdarovaný zadá kód při rezervaci na webu ${esc(site.name)}${d.kind === "weekend" ? " — v dražším termínu doplatí rozdíl" : ""}.</p>
     ${button(giftLink(order.accessToken), "Zobrazit poukaz")}`,
    "Váš dárkový poukaz",
  );
  return send({ to: order.buyerEmail, subject: `Dárkový poukaz ${site.name} — kód ${order.code}`, html, replyTo: site.contactEmail });
}
