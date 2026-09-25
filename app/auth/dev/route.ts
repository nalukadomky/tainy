import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEV_LOGIN_COOKIE, devLoginEmail, devLoginEnabled } from "@/lib/dev-login";

// POST = přihlásit vývojový účet, DELETE = odhlásit. Mimo `next dev` neexistuje.

export async function POST(request: Request) {
  if (!devLoginEnabled()) return new NextResponse(null, { status: 404 });

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text FROM auth.users WHERE email = ${devLoginEmail()} LIMIT 1`;
  const { origin } = new URL(request.url);
  if (!rows.length) return NextResponse.redirect(`${origin}/login?error=dev`, 303);

  const next = new URL(request.url).searchParams.get("next") || "/admin";
  const res = NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/admin"}`, 303);
  res.cookies.set(DEV_LOGIN_COOKIE, rows[0].id, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}

export async function DELETE() {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(DEV_LOGIN_COOKIE);
  return res;
}
