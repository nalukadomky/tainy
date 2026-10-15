import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dueReservationIds, sendDueMails } from "@/lib/guest-mails";
import { parseTaxSource, refreshTaxSource } from "@/lib/tourist-tax";
import { pendingSummary } from "@/lib/guestbook-server";
import { sendUbyportReminder } from "@/lib/email";
import { parseEmailSettings } from "@/lib/email-templates";
import { addDays, todayISO } from "@/lib/stay";

// Denní běh (Vercel Cron, vercel.json — 10:00 letního času):
// • e-maily hostům: „Před příjezdem“ a check-in v den X, připomínka check-inu
//   v den příjezdu a pojistka pro e-maily o zaplacení / zrušení, kdyby odklad
//   po změně stavu nedoběhl. Opakované spuštění nic nezdvojí;
// • kniha ubytovaných: smaže záznamy po uplynutí zákonné lhůty (6 let);
// • hlášení cizinců: majitel dostane připomínku, když lhůta končí dnes / zítra
//   nebo už uplynula a v knize jsou nenahlášení cizinci (jednou denně);
// • poplatek z pobytu: po 30 dnech znovu ověří vyhlášku obce (pár webů za běh).
// Vercel posílá CRON_SECRET v hlavičce Authorization; bez něj se nic nespustí.

export const maxDuration = 60;

const TAX_RECHECK_DAYS = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Neoprávněný přístup." }, { status: 401 });
  }
  const ids = await dueReservationIds();
  for (const id of ids) await sendDueMails(id);

  const now = new Date();
  const purged = await prisma.guestRecord.deleteMany({ where: { purgeAt: { lt: now } } });
  const sixYears = new Date(now);
  sixYears.setUTCFullYear(sixYears.getUTCFullYear() - 6);
  await prisma.guestAccessLog.deleteMany({ where: { createdAt: { lt: sixYears } } });

  // Cizinci k nahlášení: weby, které mají v knize nenahlášené cizince
  const today = todayISO();
  const withForeign = await prisma.site.findMany({
    where: { guestRecords: { some: { foreign: true, reportedAt: null } } },
    select: { id: true, name: true, contactEmail: true, emailSettings: true },
  });
  let reminded = 0;
  for (const s of withForeign) {
    if (!s.contactEmail || !parseEmailSettings(s.emailSettings).ownerNotify) continue;
    const p = await pendingSummary(s.id);
    if (p.count && p.deadline && p.deadline <= addDays(today, 1) && (await sendUbyportReminder(s.contactEmail, s.name, p.count, p.deadline, today))) reminded++;
  }

  // Vyhlášky: weby s adresou, jejichž ověření je starší než 30 dní (nejvýš 3 za běh)
  const sites = await prisma.site.findMany({ where: { arrivalAddress: { not: "" } }, select: { id: true, taxSource: true } });
  const stale = sites.filter((s) => {
    const t = parseTaxSource(s.taxSource);
    return !t || now.getTime() - new Date(t.checkedAt).getTime() > TAX_RECHECK_DAYS * 86_400_000;
  });
  for (const s of stale.slice(0, 3)) {
    const before = parseTaxSource(s.taxSource);
    const after = await refreshTaxSource(s.id).catch(() => null);
    // Nová vyhláška od posledního ověření → upozornění v knize ubytovaných
    if (before?.url && after?.url && before.url !== after.url)
      await prisma.site.update({ where: { id: s.id }, data: { taxSource: JSON.stringify({ ...after, changed: true }) } });
  }
  return NextResponse.json({ checked: ids.length, purged: purged.count, ubyportReminded: reminded, taxChecked: Math.min(3, stale.length) });
}
