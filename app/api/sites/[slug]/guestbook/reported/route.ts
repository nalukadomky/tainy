import { NextRequest, NextResponse } from "next/server";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { logAccess, markReported } from "@/lib/guestbook-server";

// Cizinci nahlášení policii (Ubyport): { items: [{reservationId, position}], undo?: true }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const body = (await req.json().catch(() => ({}))) as { items?: unknown; undo?: boolean };
  const items = Array.isArray(body.items) ? (body.items as { reservationId: string; position: number }[]) : [];
  if (!items.length) return NextResponse.json({ error: "Nic k označení." }, { status: 400 });
  const count = await markReported(guard.site.id, items, body.undo ? null : new Date());
  await logAccess(guard.site.id, guard.user.email, "edit", `Ubyport: ${body.undo ? "zrušeno nahlášení" : "nahlášeno"} ${count} osob`);
  return NextResponse.json({ ok: true, count });
}
