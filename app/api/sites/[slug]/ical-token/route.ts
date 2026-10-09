import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";

// Nový odkaz na kalendář webu — starý přestane platit (třeba když unikl).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const icalToken = randomBytes(24).toString("base64url");
  await prisma.site.update({ where: { id: guard.site.id }, data: { icalToken } });
  return NextResponse.json({ icalToken });
}
