import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEV_LOGIN_COOKIE, devLoginEnabled } from "@/lib/dev-login";

// Obnoví Supabase session a ochrání /admin (nepřihlášené přesměruje na /login).
// Ověření session je síťový dotaz na Supabase Auth — děláme ho jen tam, kde má smysl:
// API si přihlášení ověřuje samo (a session si v případě potřeby obnoví samo) a host
// bez přihlašovací cookie (veřejný web, rezervace) žádnou session nemá.
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.next({ request });
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  const devUser = devLoginEnabled() && request.cookies.has(DEV_LOGIN_COOKIE);
  if (!hasSession) {
    if (!devUser && pathname.startsWith("/admin")) return toLogin(request);
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Mezi vytvořením klienta a getUser() nedávat žádnou logiku (jinak náhodné odhlášení).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Vývojové přihlášení: tady stačí přítomnost cookie, účet ověří getUser() v layoutu.
  if (!user && !devUser && pathname.startsWith("/admin")) return toLogin(request);

  return response;
}

// Po přihlášení zpět na stejnou stránku i s parametry (např. ?panel=galerie)
function toLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}
