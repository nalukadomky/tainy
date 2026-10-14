import "server-only";
import { randomBytes } from "node:crypto";
import { PHOTO_BUCKET, ensurePhotoBucket, supabaseAdmin } from "@/lib/supabase/admin";

// Uložení fotky webu do úložiště (Supabase Storage, bucket „photos“).
// Cesta {siteId}/{čas}-{náhoda}.{přípona} — mazat pak smí jen vlastní složku.

export const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export class PhotoStorageMissing extends Error {}

/** Uloží fotku a vrátí její veřejnou adresu. */
export async function storeSitePhoto(siteId: string, file: Blob | Uint8Array, contentType: string): Promise<string> {
  const ext = PHOTO_TYPES[contentType];
  if (!ext) throw new Error(`Nepodporovaný typ fotky: ${contentType}`);
  const supabase = supabaseAdmin();
  if (!supabase) throw new PhotoStorageMissing();
  const path = `${siteId}/${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`;
  await ensurePhotoBucket(supabase);
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType, cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
