import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, deny } from "@/lib/auth";
import { createSite } from "@/lib/create-site";


// Vrací pouze weby přihlášeného uživatele (napájí přepínač webů v administraci).
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json([]);
  const sites = await prisma.site.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return deny(401);

  const body = await req.json();
  if (!body.name || !body.pricePerNight) {
    return NextResponse.json({ error: "Chybí název nebo cena za noc." }, { status: 400 });
  }

  const site = await createSite(user.id, body);
  return NextResponse.json(site, { status: 201 });
}
