// Odesílání e-mailů přes Resend.
// Bez RESEND_API_KEY se zpráva jen vypíše do konzole, aby vývoj běžel dál.

import { Resend } from "resend";
import { czk, plural } from "@/lib/pricing";
import { greetingName } from "@/lib/vocative";

const FROM = process.env.RESEND_FROM ?? "tainy <rezervace@resend.dev>";
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/** Veřejná adresa aplikace pro odkazy v e-mailech. */
export function appUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

type Mail = { to: string; subject: string; html: string };

async function send({ to, subject, html }: Mail): Promise<void> {
  if (!resend) {
    console.log(`[e-mail — ukázkový režim] pro ${to}: ${subject}`);
    return;
  }
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) console.error("Odeslání e-mailu selhalo:", error);
  } catch (e) {
    // E-mail nikdy nesmí shodit rezervaci — host ji má potvrzenou i tak.
    console.error("Odeslání e-mailu selhalo:", e);
  }
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="cs"><body style="margin:0;background:#f6f3ec;padding:24px;font-family:system-ui,-apple-system,sans-serif;color:#1e2a20">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4ddcf;border-radius:16px;padding:28px">
    <p style="margin:0 0 20px;font-size:18px;font-weight:700;letter-spacing:-.01em">tainy</p>
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3">${title}</h1>
    ${body}
  </div>
</body></html>`;
}

function stayBlock(r: StayMail): string {
  const nights = r.nights;
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
    <tr><td style="padding:6px 0;color:#5a6557">Termín</td><td style="padding:6px 0;text-align:right;font-weight:600">${fmt(r.startDate)} – ${fmt(r.endDate)}</td></tr>
    <tr><td style="padding:6px 0;color:#5a6557">Délka</td><td style="padding:6px 0;text-align:right">${nights} ${plural(nights, "noc", "noci", "nocí")}</td></tr>
    <tr><td style="padding:6px 0;color:#5a6557">Hosté</td><td style="padding:6px 0;text-align:right">${r.guestSummary || r.guests}</td></tr>
    ${r.discount ? `<tr><td style="padding:6px 0;color:#5a6557">Sleva (voucher ${r.voucherCode})</td><td style="padding:6px 0;text-align:right;color:#2c5e3f">−${czk(r.discount)}</td></tr>` : ""}
    <tr><td style="padding:10px 0 0;border-top:1px solid #e4ddcf;font-weight:600">Celkem</td><td style="padding:10px 0 0;border-top:1px solid #e4ddcf;text-align:right;font-weight:700">${czk(r.total)}</td></tr>
  </table>`;
}

export type StayMail = {
  publicId: string;
  siteName: string;
  guestName: string;
  email: string;
  phone: string;
  guests: number;
  /** Rozpis skladby, např. „2× dospělí · 1× pes". Prázdné = hosté se nedělí. */
  guestSummary: string;
  startDate: string;
  endDate: string;
  nights: number;
  total: number;
  /** Sleva z voucheru v Kč (0 = bez voucheru). */
  discount?: number;
  voucherCode?: string;
  paid: boolean;
  /** Zaplaceno ukázkovou platbou — nesmí se splést se skutečnou. */
  demo: boolean;
  checkInTime: string;
  checkOutTime: string;
};

/** Potvrzení hostovi s odkazem na jeho rezervaci. */
export async function sendGuestConfirmation(r: StayMail): Promise<void> {
  const link = `${appUrl()}/r/${r.publicId}`;
  const next = r.demo
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6"><strong>Ukázková platba</strong> — žádné peníze se nestrhly, rezervace slouží k vyzkoušení systému.</p>`
    : r.paid
      ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Platba je zaznamenaná, nic dalšího řešit nemusíš.</p>`
      : `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Rezervaci držíme <strong>24 hodin</strong>. Platební údaje i QR kód najdeš na stránce rezervace.</p>`;

  await send({
    to: r.email,
    subject: `Rezervace ${r.siteName} — ${fmt(r.startDate)}`,
    html: layout(
      `Díky za rezervaci, ${greetingName(r.guestName)}!`,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Máš u nás rezervovaný pobyt v <strong>${r.siteName}</strong>.</p>
       ${stayBlock(r)}
       ${next}
       <p style="margin:0 0 20px;font-size:14px;color:#5a6557">Příjezd od ${r.checkInTime}, odjezd do ${r.checkOutTime}.</p>
       <a href="${link}" style="display:inline-block;background:#2c5e3f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px">Zobrazit rezervaci</a>
       <p style="margin:20px 0 0;font-size:13px;color:#5a6557">Kód rezervace: <strong>${r.publicId}</strong></p>`
    ),
  });
}

/** Upozornění majiteli na novou rezervaci. */
export async function sendOwnerNotification(r: StayMail, ownerEmail: string): Promise<void> {
  if (!ownerEmail) return;
  await send({
    to: ownerEmail,
    subject: `Nová rezervace — ${r.siteName}, ${fmt(r.startDate)}`,
    html: layout(
      "Máš novou rezervaci",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6"><strong>${r.guestName}</strong> si rezervoval pobyt v ${r.siteName}.</p>
       ${stayBlock(r)}
       <p style="margin:0 0 16px;font-size:14px;color:#5a6557">${r.email}${r.phone ? ` · ${r.phone}` : ""}<br>Stav: ${r.demo ? "zaplaceno ukázkovou platbou" : r.paid ? "zaplaceno" : "čeká na platbu"}</p>
       <a href="${appUrl()}/admin/rezervace" style="display:inline-block;background:#2c5e3f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px">Otevřít administraci</a>`
    ),
  });
}

/** Oznámení hostovi, že majitel změnil termín pobytu. `doplatek` > 0 = host doplácí. */
export async function sendGuestDateChange(
  r: StayMail,
  old: { startDate: string; endDate: string },
  doplatek: number
): Promise<void> {
  const link = `${appUrl()}/r/${r.publicId}`;
  const payment =
    doplatek > 0
      ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Nový termín vychází dráž — <strong>doplatek ${czk(doplatek)}</strong>. Podrobnosti najdeš na stránce rezervace.</p>`
      : "";

  await send({
    to: r.email,
    subject: `Změna termínu — ${r.siteName}, ${fmt(r.startDate)}`,
    html: layout(
      `${greetingName(r.guestName)}, termín pobytu je změněný`,
      `<p style="margin:0 0 8px;font-size:15px;line-height:1.6">Tvůj pobyt v <strong>${r.siteName}</strong> má nový termín.</p>
       <p style="margin:0 0 4px;font-size:14px;color:#5a6557">Původně: <s>${fmt(old.startDate)} – ${fmt(old.endDate)}</s></p>
       ${stayBlock(r)}
       ${payment}
       <p style="margin:0 0 20px;font-size:14px;color:#5a6557">Příjezd od ${r.checkInTime}, odjezd do ${r.checkOutTime}.</p>
       <a href="${link}" style="display:inline-block;background:#2c5e3f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px">Zobrazit rezervaci</a>
       <p style="margin:20px 0 0;font-size:13px;color:#5a6557">Kód rezervace: <strong>${r.publicId}</strong></p>`
    ),
  });
}
