import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { TODO_INCLUDE, cleanCategory, cleanTitle, toTodoItem, trashSince } from "@/lib/todos";

// Úkoly webu pro majitele: všechny otevřené a hotové z posledních 30 dní.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);
  const since = new Date(Date.now() - 30 * 86_400_000);
  // Karanténa: po 30 dnech se smazané úkoly mažou natrvalo (až po odpovědi, nečeká se na to)
  const purgeBefore = trashSince();
  after(() => prisma.todo.deleteMany({ where: { siteId: guard.site.id, deletedAt: { lt: purgeBefore } } }).catch(() => {}));
  const [todos, cleaners, settings] = await Promise.all([
    prisma.todo.findMany({
      where: {
        siteId: guard.site.id,
        OR: [{ done: false }, { doneAt: { gte: since } }, { deletedAt: { gte: purgeBefore } }],
      },
      include: TODO_INCLUDE,
      orderBy: { createdAt: "asc" },
    }),
    prisma.cleaner.findMany({ where: { siteId: guard.site.id }, select: { id: true, name: true, active: true } }),
    prisma.site.findUnique({ where: { id: guard.site.id }, select: { staffSeesOwnerTodos: true } }),
  ]);
  const names = new Map(cleaners.map((c) => [c.id, c.name]));
  return NextResponse.json({
    todos: todos.map((t) => toTodoItem(t, names)),
    cleaners: cleaners.filter((c) => c.active).map(({ id, name }) => ({ id, name })),
    staffSeesOwnerTodos: settings?.staffSeesOwnerTodos ?? true,
  });
}

// Nový úkol od majitele — pro sebe, nebo pro někoho z personálu.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const guard = await requireSiteOwnerBySlug(String(body.site ?? ""));
  if (!guard.ok) return deny(guard.status);
  const title = cleanTitle(body.title);
  if (!title) return NextResponse.json({ error: "Napiš, co je potřeba udělat." }, { status: 400 });
  let cleanerId: string | null = null;
  if (body.cleanerId) {
    const cleaner = await prisma.cleaner.findFirst({ where: { id: String(body.cleanerId), siteId: guard.site.id } });
    if (!cleaner) return NextResponse.json({ error: "Tenhle člen personálu už neexistuje." }, { status: 404 });
    cleanerId = cleaner.id;
  }
  const todo = await prisma.todo.create({
    data: { siteId: guard.site.id, title, category: cleanCategory(body.category), cleanerId, createdBy: "owner", urgent: body.urgent === true },
    include: TODO_INCLUDE,
  });
  return NextResponse.json(toTodoItem(todo, new Map()), { status: 201 });
}
