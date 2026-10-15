import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isAppHost } from "@/lib/domains";
import { slugForDomain } from "@/lib/domain-cache";

// Proxy (dřív middleware, Next 16 — běží v Node.js):
// 1) vlastní domény webů: chata-olinka.cz/… → web /{slug}/…
// 2) Supabase session a ochrana /admin

/** Části aplikace, které na vlastní doméně webu nemají co dělat → na hlavní adresu aplikace. */
const APP_ONLY = ["/admin", "/login", "/register", "/auth", "/onboarding", "/zapomenute-heslo", "/uklid", "/early-access", "/import"];

async function customDomain(request: NextRequest, host: string): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  // Rezervace (/r/…), check-in, dárkové poukazy, API a soubory fungují na kterékoli adrese
  if (pathname.startsWith("/api") || pathname.startsWith("/r/") || pathname.startsWith("/checkin/") || pathname.startsWith("/darek/") || pathname.startsWith("/_next") || /\.[a-z0-9]+$/i.test(pathname)) {
    return NextResponse.next();
  }
  if (APP_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const app = process.env.NEXT_PUBLIC_APP_URL ?? "https://tainy.cz";
    return NextResponse.redirect(new URL(`${pathname}${request.nextUrl.search}`, app));
  }
  const slug = await slugForDomain(host);
  const url = request.nextUrl.clone();
  if (!slug) {
    url.pathname = "/domena-nenalezena";
    return NextResponse.rewrite(url);
  }
  // Odkazy uvnitř webu vedou na /{slug}/… — na vlastní doméně stačí kratší adresa
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const target = new URL(`${pathname.slice(slug.length + 1) || "/"}${request.nextUrl.search}`, `${proto}://${host}`);
    return NextResponse.redirect(target);
  }
  url.pathname = `/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (host && !isAppHost(host)) {
    const res = await customDomain(request, host);
    if (res) return res;
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Vše kromě statických souborů a obrázků
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
