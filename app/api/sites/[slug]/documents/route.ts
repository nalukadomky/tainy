import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { DOCUMENT_BUCKET, ensureDocumentBucket, supabaseAdmin } from "@/lib/supabase/admin";
import type { LegalKind } from "@/lib/legal";

// PDF obchodních podmínek a zásad ochrany osobních údajů.
//  POST (FormData file + kind): nahraje PDF a hned ho připojí k webu.
//  DELETE ?kind=: PDF od webu odpojí.
// Staré soubory se z úložiště nemažou — doklad verze, se kterou hosté souhlasili.

const MAX_BYTES = 10 * 1024 * 1024;
const NOT_CONFIGURED =
  "Nahrávání souborů není nastavené — chybí SUPABASE_SERVICE_ROLE_KEY v .env (Supabase → Project Settings → API).";

const kindOf = (v: unknown): LegalKind | null => (v === "terms" || v === "privacy" ? v : null);

const fields = (kind: LegalKind, url: string, name: string) =>
  kind === "terms"
    ? { termsPdf: url, termsName: name, termsUpdatedAt: new Date() }
    : { privacyPdf: url, privacyName: name, privacyUpdatedAt: new Date() };

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);

  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = kindOf(form?.get("kind"));
  if (!kind) return NextResponse.json({ error: "Neznámý typ dokumentu." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Chybí soubor." }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Nahraj dokument ve formátu PDF." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Soubor je větší než 10 MB." }, { status: 400 });

  const path = `${guard.site.id}/${kind}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.pdf`;
  try {
    await ensureDocumentBucket(supabase);
    const { error } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(path, file, { contentType: "application/pdf", cacheControl: "31536000" });
    if (error) throw error;
  } catch (e) {
    console.error("Nahrání dokumentu selhalo:", e);
    return NextResponse.json({ error: "Nahrání souboru selhalo, zkus to znovu." }, { status: 502 });
  }

  const { data } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(path);
  const name = file.name.slice(0, 200) || "dokument.pdf";
  const site = await prisma.site.update({ where: { id: guard.site.id }, data: fields(kind, data.publicUrl, name) });
  return NextResponse.json(
    { url: data.publicUrl, name, updatedAt: kind === "terms" ? site.termsUpdatedAt : site.privacyUpdatedAt },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);
  const kind = kindOf(req.nextUrl.searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "Neznámý typ dokumentu." }, { status: 400 });
  await prisma.site.update({ where: { id: guard.site.id }, data: fields(kind, "", "") });
  return NextResponse.json({ ok: true });
}
