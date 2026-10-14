import "server-only";
import type { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

// Early access: dokud ve Vercelu není PUBLIC_SIGNUP=1, aplikace není veřejná.
// Lidé se zapisují o přístup (EarlyAccessRequest). Nové weby smí zakládat jen
// ten, kdo už nějaký web má, nebo je pozvaný: správce u žádosti klikne Pozvat
// (invitedAt) a pošle osobní odkaz /register?pozvanka=<id žádosti>. Náhradou
// slouží EARLY_ACCESS_ALLOW (e-maily) a EARLY_ACCESS_CODE (společný kód).

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Platí early access (registrace zavřená)? Výchozí stav je zavřeno. */
export const earlyAccess = () => !["1", "true"].includes((process.env.PUBLIC_SIGNUP ?? "").toLowerCase());

/** Správci platformy — vidí žádosti o přístup a dostávají o nich e-mail. */
export const platformAdmins = () => list(process.env.PLATFORM_ADMINS);
export const isPlatformAdmin = (user: Pick<User, "email"> | null) => !!user?.email && platformAdmins().includes(user.email.toLowerCase());

/** Pozvánka do registrace: id pozvané žádosti, nebo společný EARLY_ACCESS_CODE. */
export async function validInvite(code: string | null | undefined): Promise<boolean> {
  const c = code?.trim();
  if (!c || c.length > 64) return false;
  const shared = process.env.EARLY_ACCESS_CODE?.trim();
  if (shared && c === shared) return true;
  return (await prisma.earlyAccessRequest.count({ where: { id: c, invitedAt: { not: null } } })) > 0;
}

/** Smí uživatel založit nový web? Existující majitel ano, nový jen pozvaný. */
export async function mayCreateSite(user: Pick<User, "id" | "email">): Promise<boolean> {
  if (!earlyAccess()) return true;
  if (user.email && list(process.env.EARLY_ACCESS_ALLOW).includes(user.email.toLowerCase())) return true;
  if (isPlatformAdmin(user)) return true;
  if ((await prisma.site.count({ where: { ownerId: user.id } })) > 0) return true;
  // Pozvaný ze seznamu žádostí (stejný e-mail jako v žádosti)
  return !!user.email && (await prisma.earlyAccessRequest.count({ where: { email: user.email.toLowerCase(), invitedAt: { not: null } } })) > 0;
}

export const EARLY_ACCESS_DENIED = {
  error: "tainy zatím spouštíme postupně. Zapiš se o přístup a ozveme se ti.",
  code: "early_access",
} as const;
