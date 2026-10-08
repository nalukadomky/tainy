// Odesílání e-mailů přes Resend.
// Bez RESEND_API_KEY se zpráva jen vypíše do konzole, aby vývoj běžel dál.

import { Resend } from "resend";
import { czk } from "@/lib/pricing";
import { greetingName } from "@/lib/vocative";
import {
  fmt,
  layout,
  renderEmail,
  stayBlock,
  type EmailExtras,
  type EmailSite,
  type StayMail,
} from "@/lib/email-templates";

export type { StayMail } from "@/lib/email-templates";

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

/** E-mail s nadpisem (upozornění majiteli, změna termínu — texty zatím pevné). */
const titled = (title: string, body: string) => layout(body, title);

/** Potvrzení přijetí rezervace hostovi — text podle Nastavení → Automatizace. */
export async function sendGuestConfirmation(r: StayMail, site: EmailSite, extras: Omit<EmailExtras, "link">): Promise<void> {
  const { subject, html } = renderEmail("booking", site, r, { ...extras, link: `${appUrl()}/r/${r.publicId}` });
  await send({ to: r.email, subject, html });
}

/** Upozornění majiteli na novou rezervaci. */
export async function sendOwnerNotification(r: StayMail, ownerEmail: string): Promise<void> {
  if (!ownerEmail) return;
  await send({
    to: ownerEmail,
    subject: `Nová rezervace — ${r.siteName}, ${fmt(r.startDate)}`,
    html: titled(
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
    html: titled(
      `${greetingName(r.firstName || r.guestName)}, termín pobytu je změněný`,
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
