import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, deny } from "@/lib/auth";
import { TODO_INCLUDE, cleanCategory, cleanTitle, toTodoItem } from "@/lib/todos";

// Jeden úkol (majitel smí všechno): upravit text, sekci, komu patří, odškrtnout, smazat.

async function ownTodo(id: string) {
  const user = await getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const todo = await prisma.todo.findUnique({ where: { id }, include: { site: { select: { ownerId: true } } } });
  if (!todo) return { ok: false as const, status: 404 as const };
  if (todo.site.ownerId !== user.id) return { ok: false as const, status: 403 as const };
  return { ok: true as const, todo };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownTodo(id);
  if (!found.ok) return deny(found.status);
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = cleanTitle(body.title);
    if (!title) return NextResponse.json({ error: "Úkol nemůže být prázdný." }, { status: 400 });
    data.title = title;
  }
  if (body.category !== undefined) data.category = cleanCategory(body.category);
  if (typeof body.urgent === "boolean") data.urgent = body.urgent;
  if (body.cleanerId !== undefined) {
    if (body.cleanerId) {
      const cleaner = await prisma.cleaner.findFirst({ where: { id: String(body.cleanerId), siteId: found.todo.siteId } });
      if (!cleaner) return NextResponse.json({ error: "Tenhle člen personálu už neexistuje." }, { status: 404 });
      data.cleanerId = cleaner.id;
    } else data.cleanerId = null;
  }
  // Vrátit z karantény
  if (body.restore === true) data.deletedAt = null;
  if (typeof body.done === "boolean") Object.assign(data, { done: body.done, doneAt: body.done ? new Date() : null, doneBy: body.done ? "Majitel" : "" });
  const todo = await prisma.todo.update({ where: { id }, data, include: TODO_INCLUDE });
  // Jméno toho, kdo úkol přidal (uklízečka), ať se po změně neztratí
  const author = todo.createdById
    ? await prisma.cleaner.findUnique({ where: { id: todo.createdById }, select: { id: true, name: true } })
    : null;
  return NextResponse.json(toTodoItem(todo, new Map(author ? [[author.id, author.name]] : [])));
}

// Smazat: otevřený úkol do karantény (jde vrátit); hotový, nebo s ?final=1, natrvalo.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownTodo(id);
  if (!found.ok) return deny(found.status);
  if (req.nextUrl.searchParams.get("final") === "1" || found.todo.done) {
    await prisma.todo.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }
  await prisma.todo.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
