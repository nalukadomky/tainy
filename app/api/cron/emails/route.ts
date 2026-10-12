import { NextRequest, NextResponse } from "next/server";
import { dueReservationIds, sendDueMails } from "@/lib/guest-mails";

// Denní běh e-mailů hostům (Vercel Cron, vercel.json — 10:00 letního času):
// „Před příjezdem“ v den X a pojistka pro e-maily o zaplacení / zrušení,
// kdyby odklad po změně stavu nedoběhl. Opakované spuštění nic nezdvojí.
// Vercel posílá CRON_SECRET v hlavičce Authorization; bez něj se nic nespustí.

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Neoprávněný přístup." }, { status: 401 });
  }
  const ids = await dueReservationIds();
  for (const id of ids) await sendDueMails(id);
  return NextResponse.json({ checked: ids.length });
}
