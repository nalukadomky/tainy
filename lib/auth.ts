import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { DEV_LOGIN_COOKIE, devLoginEnabled } from "@/lib/dev-login";

// Aktuálně přihlášený uživatel ze Supabase session (nebo null).
export async function getUser(): Promise<User | null> {
  if (devLoginEnabled()) {
    const devId = (await cookies()).get(DEV_LOGIN_COOKIE)?.value;
    if (devId && /^[0-9a-f-]{36}$/i.test(devId)) {
      // Aplikaci z uživatele stačí id a e-mail.
      const rows = await prisma.$queryRaw<{ id: string; email: string }[]>`
        SELECT id::text, email FROM auth.users WHERE id = ${devId}::uuid LIMIT 1`;
      if (rows.length) return { id: rows[0].id, email: rows[0].email } as User;
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

type SiteRef = { id: string; ownerId: string | null; slug: string };
type Guard<T> =
  | ({ ok: true; user: User } & T)
  | { ok: false; status: 401 | 403 | 404 };

// Ověří, že přihlášený uživatel vlastní web daného slugu.
export async function requireSiteOwnerBySlug(slug: string): Promise<Guard<{ site: SiteRef }>> {
  const user = await getUser();
  if (!user) return { ok: false, status: 401 };
  const site = await prisma.site.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, slug: true },
  });
  if (!site) return { ok: false, status: 404 };
  if (site.ownerId !== user.id) return { ok: false, status: 403 };
  return { ok: true, user, site };
}

// Ověří vlastnictví přes ID rezervace (přes navázaný web).
export async function requireOwnerByReservationId(id: string) {
  const user = await getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { site: { select: { ownerId: true } } },
  });
  if (!reservation) return { ok: false as const, status: 404 as const };
  if (reservation.site.ownerId !== user.id) return { ok: false as const, status: 403 as const };
  return { ok: true as const, user, reservation };
}

// Ověří vlastnictví přes ID nákladu (přes navázaný web).
export async function requireOwnerByCostId(id: string) {
  const user = await getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const cost = await prisma.cost.findUnique({
    where: { id },
    include: { site: { select: { ownerId: true } } },
  });
  if (!cost) return { ok: false as const, status: 404 as const };
  if (cost.site.ownerId !== user.id) return { ok: false as const, status: 403 as const };
  return { ok: true as const, user, cost };
}

// Jednotná chybová odpověď.
export function deny(status: 401 | 403 | 404) {
  const msg = {
    401: "Přihlaš se.",
    403: "K tomuto webu nemáš přístup.",
    404: "Web nenalezen.",
  }[status];
  return NextResponse.json({ error: msg }, { status });
}
