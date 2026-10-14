import { NextRequest, NextResponse } from "next/server";
import { getUser, deny } from "@/lib/auth";
import { lookupAres } from "@/lib/ares";

// Údaje o podnikateli z ARES. Jen pro přihlášené — ať z nás nikdo nedělá veřejnou proxy.

const ERRORS = {
  invalid: ["IČ není platné — zkontroluj ho.", 400],
  "not-found": ["V ARES jsem toto IČ nenašel.", 404],
  unavailable: ["ARES teď neodpovídá — vyplň údaje ručně.", 502],
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ico: string }> }) {
  if (!(await getUser())) return deny(401);
  const r = await lookupAres((await params).ico);
  if (!r.ok) {
    const [error, status] = ERRORS[r.reason];
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(r.subject);
}
