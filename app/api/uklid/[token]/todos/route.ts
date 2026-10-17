import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TODO_INCLUDE, cleanCategory, cleanTitle, toTodoItem } from "@/lib/todos";

// Uklízečka přidá úkol pro sebe, nebo pro majitele (např. „došel prášek“).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cleaner = await prisma.cleaner.findUnique({ where: { token }, include: { site: { select: { cleaningEnabled: true } } } });
  if (!cleaner?.active || !cleaner.site.cleaningEnabled) return NextResponse.json({ error: "Odkaz neplatí." }, { status: 404 });
  const body = await req.json();
  const title = cleanTitle(body.title);
  if (!title) return NextResponse.json({ error: "Napiš, co je potřeba udělat." }, { status: 400 });
  const todo = await prisma.todo.create({
    data: {
      siteId: cleaner.siteId,
      title,
      category: cleanCategory(body.category),
      cleanerId: body.forOwner ? null : cleaner.id,
      createdBy: "cleaner",
      createdById: cleaner.id,
      urgent: body.urgent === true,
    },
    include: TODO_INCLUDE,
  });
  return NextResponse.json(toTodoItem(todo, new Map([[cleaner.id, cleaner.name]])), { status: 201 });
}
