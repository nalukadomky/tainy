import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, deny } from "@/lib/auth";
import { IMPORT_LIMITS, importEnabled } from "@/lib/import/flag";
import { CrawlError, crawl, normalizeSiteUrl } from "@/lib/import/crawl";
import { extract } from "@/lib/import/extract";
import { lookupAres } from "@/lib/ares";
import type { ImportResult } from "@/lib/import/types";

// Sken existujícího webu: projde stránky, vytáhne údaje a fotky, doplní firmu
// z ARES. Nic nezakládá — výsledek se uloží k importu a majitel ho zkontroluje.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return deny(401);
  if (!importEnabled()) return deny(403);

  const body = await req.json().catch(() => ({}));
  if (body.consent !== true) return NextResponse.json({ error: "Potvrď, že obsah webu je tvůj." }, { status: 400 });
  const url = normalizeSiteUrl(String(body.url ?? ""));
  if (!url) return NextResponse.json({ error: "Zadej adresu webu, třeba chata-podsmrkem.cz." }, { status: 400 });

  const [recent, today] = await Promise.all([
    prisma.importJob.count({ where: { ownerId: user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } }),
    prisma.importJob.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
  ]);
  if (recent >= IMPORT_LIMITS.scansPerUserHour)
    return NextResponse.json({ error: "Za poslední hodinu už bylo skenů hodně. Zkus to prosím později." }, { status: 429 });
  if (today >= IMPORT_LIMITS.scansPerDay)
    return NextResponse.json({ error: "Import je dnes vytížený. Zkus to prosím zítra, nebo založ web ručně." }, { status: 429 });

  const host = new URL(url).hostname.replace(/^www\./, "");
  let result: ImportResult;
  try {
    const { pages } = await crawl(url);
    const base = extract(pages, url);
    let business: ImportResult["business"] = null;
    if (base.ico.value) {
      const ares = await lookupAres(base.ico.value);
      if (ares.ok) business = { name: ares.subject.name, address: ares.subject.address, vatId: ares.subject.vatId, register: ares.subject.register };
    }
    result = { ...base, business };
  } catch (e) {
    const error = e instanceof CrawlError ? e.message : "Sken se nepovedl. Zkus to prosím znovu.";
    if (!(e instanceof CrawlError)) console.error("Sken webu selhal:", e);
    await prisma.importJob.create({ data: { ownerId: user.id, url, host, status: "failed", error } });
    return NextResponse.json({ error }, { status: 422 });
  }

  const job = await prisma.importJob.create({ data: { ownerId: user.id, url, host, result: JSON.stringify(result) } });
  return NextResponse.json({ id: job.id, result });
}
