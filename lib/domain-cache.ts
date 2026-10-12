import { prisma } from "@/lib/prisma";

// Doména → adresa webu (slug) pro middleware. Krátká cache v paměti, ať se
// databáze neptá při každém požadavku; změnu domény odtud hned vyhodí forgetDomain.

const TTL = 60_000;
const cache = new Map<string, { slug: string | null; at: number }>();

export async function slugForDomain(host: string): Promise<string | null> {
  const domain = host.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL) return hit.slug;
  const site = await prisma.site.findUnique({ where: { customDomain: domain }, select: { slug: true } });
  cache.set(domain, { slug: site?.slug ?? null, at: Date.now() });
  return site?.slug ?? null;
}

export const forgetDomain = (domain: string) => cache.delete(domain);
