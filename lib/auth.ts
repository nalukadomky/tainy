import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { DEV_LOGIN_COOKIE, devLoginEnabled } from "@/lib/dev-login";

// Vývojový účet se načte z databáze jednou za proces — jinak by každý
// požadavek administrace (a jedna stránka jich pouští několik) bral spojení navíc.
const devUsers = new Map<string, User | null>();

// Aktuálně přihlášený uživatel ze Supabase session (nebo null).
export async function getUser(): Promise<User | null> {
  if (devLoginEnabled()) {
    const devId = (await cookies()).get(DEV_LOGIN_COOKIE)?.value;
    if (devId && /^[0-9a-f-]{36}$/i.test(devId)) {
      if (!devUsers.has(devId)) {
        // Aplikaci z uživatele stačí id a e-mail.
        const rows = await prisma.$queryRaw<{ id: string; email: string }[]>`
          SELECT id::text, email FROM auth.users WHERE id = ${devId}::uuid LIMIT 1`;
        devUsers.set(devId, rows.length ? ({ id: rows[0].id, email: rows[0].email } as User) : null);
      }
      const user = devUsers.get(devId);
      if (user) return user;
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

// Ověří vlastnictví přes ID kalendáře z portálu (přes navázaný web).
export async function requireOwnerByFeedId(id: string) {
  const user = await getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const feed = await prisma.calendarFeed.findUnique({
    where: { id },
    include: { site: { select: { ownerId: true } } },
  });
  if (!feed) return { ok: false as const, status: 404 as const };
  if (feed.site.ownerId !== user.id) return { ok: false as const, status: 403 as const };
  return { ok: true as const, user, feed };
}

// Ověří vlastnictví přes ID blokace termínu (přes navázaný web).
export async function requireOwnerByBlackoutId(id: string) {
  const user = await getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const blackout = await prisma.blackout.findUnique({
    where: { id },
    include: { site: { select: { ownerId: true } } },
  });
  if (!blackout) return { ok: false as const, status: 404 as const };
  if (blackout.site.ownerId !== user.id) return { ok: false as const, status: 403 as const };
  return { ok: true as const, user, blackout };
}

// Ověří vlastnictví přes ID voucheru (přes navázaný web).
export async function requireOwnerByVoucherId(id: string) {
  const user = await getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const voucher = await prisma.voucher.findUnique({
    where: { id },
    include: { site: { select: { ownerId: true } } },
  });
  if (!voucher) return { ok: false as const, status: 404 as const };
  if (voucher.site.ownerId !== user.id) return { ok: false as const, status: 403 as const };
  return { ok: true as const, user, voucher };
}

// Ověří vlastnictví přes ID uklízečky (přes navázaný web).
export async function requireOwnerByCleanerId(id: string) {
  const user = await getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const cleaner = await prisma.cleaner.findUnique({
    where: { id },
    include: { site: { select: { ownerId: true } } },
  });
  if (!cleaner) return { ok: false as const, status: 404 as const };
  if (cleaner.site.ownerId !== user.id) return { ok: false as const, status: 403 as const };
  return { ok: true as const, user, cleaner };
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
