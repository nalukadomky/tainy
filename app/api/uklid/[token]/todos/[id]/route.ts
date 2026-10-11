import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TODO_INCLUDE, cleanCategory, cleanTitle, cleanerCanRemove, toTodoItem } from "@/lib/todos";

// Úkol z pohledu uklízečky: odškrtnout smí jen úkol přiřazený jí,
// smazat jen úkol, který sama přidala.

async function load(token: string, id: string) {
  const cleaner = await prisma.cleaner.findUnique({ where: { token } });
  if (!cleaner?.active) return null;
  const todo = await prisma.todo.findUnique({ where: { id } });
  if (!todo || todo.siteId !== cleaner.siteId) return null;
  // Úkoly ostatních uklízeček vůbec nevidí
  if (todo.cleanerId && todo.cleanerId !== cleaner.id) return null;
  // Majitelovy vlastní úkoly jen když je personál smí vidět (svoje hlášení vždy)
  if (!todo.cleanerId && todo.createdById !== cleaner.id) {
    const site = await prisma.site.findUnique({ where: { id: cleaner.siteId }, select: { staffSeesOwnerTodos: true } });
    if (!site?.staffSeesOwnerTodos) return null;
  }
  return { cleaner, todo };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const found = await load(token, id);
  if (!found) return NextResponse.json({ error: "Úkol nenalezen." }, { status: 404 });
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.done === "boolean") {
    if (found.todo.cleanerId !== found.cleaner.id)
      return NextResponse.json({ error: "Tenhle úkol patří majiteli — odškrtnout ho může jen on." }, { status: 403 });
    Object.assign(data, { done: body.done, doneAt: body.done ? new Date() : null, doneBy: body.done ? found.cleaner.name : "" });
  }
  // Prioritu „Urgentní“ smí měnit u každého úkolu, který vidí (svoje i majitelovy)
  if (typeof body.urgent === "boolean") data.urgent = body.urgent;
  // Vrátit z karantény: svůj zápis, nebo úkol přidělený jí
  if (body.restore === true) {
    if (!cleanerCanRemove(found.todo, found.cleaner.id))
      return NextResponse.json({ error: "Tenhle úkol vrátit nemůžeš." }, { status: 403 });
    data.deletedAt = null;
  }
  // Text a sekci upraví jen u svého zápisu
  if (body.title !== undefined || body.category !== undefined) {
    if (found.todo.createdById !== found.cleaner.id)
      return NextResponse.json({ error: "Upravit můžeš jen úkoly, které jsi přidala." }, { status: 403 });
    if (body.title !== undefined) {
      const title = cleanTitle(body.title);
      if (!title) return NextResponse.json({ error: "Úkol nemůže být prázdný." }, { status: 400 });
      data.title = title;
    }
    if (body.category !== undefined) data.category = cleanCategory(body.category);
  }
  // Přeřadit pro sebe / pro majitele smí jen svůj zápis
  if (typeof body.forOwner === "boolean") {
    if (found.todo.createdById !== found.cleaner.id)
      return NextResponse.json({ error: "Přeřadit můžeš jen úkoly, které jsi přidala." }, { status: 403 });
    data.cleanerId = body.forOwner ? null : found.cleaner.id;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Chybí změna." }, { status: 400 });
  const todo = await prisma.todo.update({ where: { id }, data, include: TODO_INCLUDE });
  return NextResponse.json(toTodoItem(todo, new Map([[found.cleaner.id, found.cleaner.name]])));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const found = await load(token, id);
  if (!found) return NextResponse.json({ error: "Úkol nenalezen." }, { status: 404 });
  // Svůj zápis kdykoli; úkol od majitele až když je hotový (nebo už v karanténě)
  if (!cleanerCanRemove(found.todo, found.cleaner.id))
    return NextResponse.json({ error: "Smazat můžeš svoje zápisy a hotové úkoly." }, { status: 403 });
  // Otevřený úkol do karantény; hotový, nebo z karantény s ?final=1, natrvalo
  if (found.todo.done || (req.nextUrl.searchParams.get("final") === "1" && found.todo.deletedAt)) {
    await prisma.todo.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }
  await prisma.todo.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
