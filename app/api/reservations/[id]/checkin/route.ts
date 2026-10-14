import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByReservationId, deny } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { checkinToken, guestCryptoReady, newCheckinNonce } from "@/lib/guest-crypto";
import { checkinOpen, deletePerson, logAccess, readPersons, savePerson, slotsOf } from "@/lib/guestbook-server";
import { validatePerson } from "@/lib/guestbook";
import { sendCheckinNow } from "@/lib/guest-mails";
import { toISO } from "@/lib/stay";

// Check-in rezervace pro majitele: dešifrované osoby (každé zobrazení se
// zapíše do historie přístupů), ruční doplnění, odkaz pro hosta a odeslání.

const NO_STORE = { "Cache-Control": "no-store" };

async function load(id: string) {
  const guard = await requireOwnerByReservationId(id);
  if (!guard.ok) return { error: deny(guard.status) };
  const site = await prisma.site.findUniqueOrThrow({ where: { id: guard.reservation.siteId } });
  return { guard, r: guard.reservation, site };
}

const linkOf = (r: { id: string; publicId: string; checkinNonce: string }) => {
  const token = checkinToken(r);
  return token ? `${appUrl()}/checkin/${token}` : null;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id);
  if ("error" in ctx) return ctx.error;
  const { r, site, guard } = ctx;
  const ready = guestCryptoReady();
  const persons = ready ? await readPersons(r.id) : [];
  if (persons.length) await logAccess(site.id, guard.user.email, "view", `rezervace ${r.publicId}`);
  return NextResponse.json(
    {
      ready,
      enabled: site.checkinEnabled,
      slots: slotsOf(r, site),
      persons,
      link: ready && checkinOpen(r) ? linkOf(r) : null,
      checkinMailAt: r.checkinMailAt,
      checkinReminderAt: r.checkinReminderAt,
      doneAt: r.checkinDoneAt,
    },
    { headers: NO_STORE },
  );
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id);
  if ("error" in ctx) return ctx.error;
  const { r, site, guard } = ctx;
  if (!guestCryptoReady()) return NextResponse.json({ error: "Chybí šifrovací klíč." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { position?: unknown; person?: unknown };
  const position = Number(body.position);
  if (!Number.isInteger(position) || position < 0 || position >= slotsOf(r, site).length)
    return NextResponse.json({ error: "Neznámá osoba." }, { status: 400 });
  const v = validatePerson(body.person, toISO(r.startDate));
  if ("error" in v) return NextResponse.json(v, { status: 400 });
  const state = await savePerson(r, site, position, v.person, "owner");
  await logAccess(site.id, guard.user.email, "edit", `rezervace ${r.publicId}, osoba ${position + 1}`);
  return NextResponse.json(state, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id);
  if ("error" in ctx) return ctx.error;
  const { r, site, guard } = ctx;
  const position = Number(req.nextUrl.searchParams.get("position"));
  if (!Number.isInteger(position) || position < 0) return NextResponse.json({ error: "Neznámá osoba." }, { status: 400 });
  const state = await deletePerson(r, site, position);
  await logAccess(site.id, guard.user.email, "delete", `rezervace ${r.publicId}, osoba ${position + 1}`);
  return NextResponse.json(state);
}

/** { action: "send" } = poslat odkaz e-mailem hned, { action: "relink" } = nový odkaz (starý přestane platit). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id);
  if ("error" in ctx) return ctx.error;
  const { r } = ctx;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "send") {
    const error = await sendCheckinNow(r.id);
    return error ? NextResponse.json({ error }, { status: 409 }) : NextResponse.json({ ok: true, checkinMailAt: new Date() });
  }
  if (action === "relink") {
    const updated = await prisma.reservation.update({ where: { id: r.id }, data: { checkinNonce: newCheckinNonce() } });
    return NextResponse.json({ link: linkOf(updated) }, { headers: NO_STORE });
  }
  return NextResponse.json({ error: "Neznámá akce." }, { status: 400 });
}
