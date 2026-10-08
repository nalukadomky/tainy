import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase klient se service role klíčem — obchází RLS, proto jen na serveru
// a jen tam, kde oprávnění už ověřila aplikace (např. vlastník webu).

export const PHOTO_BUCKET = "photos";

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Veřejný bucket na fotky; při prvním nahrání se založí sám. */
export async function ensurePhotoBucket(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.storage.getBucket(PHOTO_BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(PHOTO_BUCKET, {
    public: true,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  // Souběžné první nahrání mohlo bucket mezitím založit.
  if (error && !/already exists/i.test(error.message)) throw error;
}

export const DOCUMENT_BUCKET = "documents";

/** Veřejný bucket na PDF dokumenty webu (obchodní podmínky, zásady). */
export async function ensureDocumentBucket(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.storage.getBucket(DOCUMENT_BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(DOCUMENT_BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf"],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}
