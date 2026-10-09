import { NextRequest, NextResponse } from "next/server";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { syncStale } from "@/lib/ical-sync";

// Administrace po načtení: stáhne kalendáře z portálů starší než 10 minut.
// Když se něco změnilo, administrace si data potichu načte znovu.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const changed = await syncStale(guard.site.id, 10 * 60_000, 15_000);
  return NextResponse.json({ changed });
}
