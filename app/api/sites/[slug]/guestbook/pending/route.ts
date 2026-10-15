import { NextResponse } from "next/server";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { pendingSummary } from "@/lib/guestbook-server";

// Kolik cizinců čeká na nahlášení policii a nejbližší lhůta (upozornění v Přehledu, bez dešifrování).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  return NextResponse.json(await pendingSummary(guard.site.id), { headers: { "Cache-Control": "no-store" } });
}
