"use client";

import { createBrowserClient } from "@supabase/ssr";

// Supabase klient pro prohlížeč (přihlášení, OAuth, čtení session na klientu).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
