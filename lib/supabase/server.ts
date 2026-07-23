import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase klient pro server (Route Handlers, Server Components). Session je v cookies.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Voláno z renderu Server Componenty — lze ignorovat, session
            // obnoví middleware při dalším requestu.
          }
        },
      },
    }
  );
}
