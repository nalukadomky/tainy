import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { PHOTO_BUCKET, ensurePhotoBucket, supabaseAdmin } from "@/lib/supabase/admin";

// Nahrávání a mazání fotek galerie. Do Site.photos se URL zapisuje zvlášť
// (PATCH webu) — tady se řeší jen soubory v úložišti.

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 8 * 1024 * 1024;

const NOT_CONFIGURED =
  "Nahrávání fotek není nastavené — chybí SUPABASE_SERVICE_ROLE_KEY v .env (Supabase → Project Settings → API).";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);

  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Chybí soubor." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Nahraj fotku ve formátu JPG, PNG nebo WebP." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Fotka je větší než 8 MB." }, { status: 400 });

  const path = `${guard.site.id}/${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`;
  try {
    await ensurePhotoBucket(supabase);
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) throw error;
  } catch (e) {
    console.error("Nahrání fotky selhalo:", e);
    return NextResponse.json({ error: "Nahrání fotky selhalo, zkus to znovu." }, { status: 502 });
  }

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return NextResponse.json({ src: data.publicUrl }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);

  // Mazat smí jen soubory ve složce vlastního webu; cizí adresy (např. demo
  // fotky z /public) se jen odeberou z galerie a tady se nic neděje.
  const src = req.nextUrl.searchParams.get("src") ?? "";
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const path = src.includes(marker) ? decodeURIComponent(src.split(marker)[1]) : "";
  if (!path.startsWith(`${guard.site.id}/`) || path.includes("..")) return NextResponse.json({ ok: true });

  // Fotku může používat i duplikát této nemovitosti — pak soubor zůstane
  const usedElsewhere = await prisma.site.count({
    where: {
      id: { not: guard.site.id },
      OR: [{ photos: { contains: path } }, { heroPhoto: { contains: path } }, { aboutPhoto: { contains: path } }],
    },
  });
  if (usedElsewhere) return NextResponse.json({ ok: true });

  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true });
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (error) console.error("Smazání fotky z úložiště selhalo:", error);
  return NextResponse.json({ ok: true });
}
