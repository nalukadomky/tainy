import { NextRequest, NextResponse } from "next/server";
import { guestView, resolveCheckin, savePerson, slotsOf } from "@/lib/guestbook-server";
import { validatePerson } from "@/lib/guestbook";
import { toISO } from "@/lib/stay";

// Check-in hosta přes podepsaný odkaz. Host údaje jen zapisuje — zpátky
// dostane jen stav (kdo je vyplněný), ne uložené údaje. Přeposlaný odkaz tak
// nic neprozradí.

const NO_STORE = { "Cache-Control": "no-store" };
const gone = () => NextResponse.json({ error: "Odkaz na check-in neplatí. Napiš prosím ubytovateli." }, { status: 404, headers: NO_STORE });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const r = await resolveCheckin((await params).token);
  if (!r) return gone();
  return NextResponse.json({ slots: await guestView(r) }, { headers: NO_STORE });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const r = await resolveCheckin((await params).token);
  if (!r) return gone();
  const body = (await req.json().catch(() => ({}))) as { position?: unknown; person?: unknown };
  const position = Number(body.position);
  const slots = slotsOf(r, r.site);
  if (!Number.isInteger(position) || position < 0 || position >= slots.length)
    return NextResponse.json({ error: "Neznámá osoba." }, { status: 400, headers: NO_STORE });
  const v = validatePerson(body.person, toISO(r.startDate));
  if ("error" in v) return NextResponse.json(v, { status: 400, headers: NO_STORE });
  const state = await savePerson(r, r.site, position, v.person, "guest");
  return NextResponse.json(state, { headers: NO_STORE });
}
