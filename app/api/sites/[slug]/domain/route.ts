import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { cleanDomain } from "@/lib/domains";
import { addDomain, domainConfig, projectDomain, removeDomain, vercelEnabled, verifyDomain } from "@/lib/vercel";
import { forgetDomain } from "@/lib/domain-cache";

// Vlastní doména webu (jen vlastník): připojit, zjistit stav, odpojit.
// Stav se ptá Vercelu: jsou DNS záznamy u registrátora správně a je doména ověřená?

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return { guard };
  const site = await prisma.site.findUniqueOrThrow({
    where: { id: guard.site.id },
    select: { id: true, slug: true, customDomain: true, domainStatus: true },
  });
  return { guard, site };
}

/** Zeptá se Vercelu na stav domény a uloží ho. */
async function check(site: { id: string; customDomain: string | null; domainStatus: string }) {
  const domain = site.customDomain;
  if (!domain) return { enabled: vercelEnabled(), domain: null, status: "" };
  if (!vercelEnabled()) return { enabled: false, domain, status: site.domainStatus };

  let pd = await projectDomain(domain);
  if (pd.status === 404) {
    await prisma.site.update({ where: { id: site.id }, data: { domainStatus: "error" } });
    return { enabled: true, domain, status: "error", message: "Doména není připojená k hostingu — připoj ji prosím znovu." };
  }
  // Doménu používá i jiný účet: Vercel chce TXT záznam; po jeho nastavení zkusíme ověřit
  if (pd.data.verified === false) {
    const v = await verifyDomain(domain);
    if (v.ok) pd = v;
  }
  const cfg = await domainConfig(domain);
  const verified = pd.data.verified !== false;
  const dnsOk = cfg.ok && cfg.data.misconfigured === false;
  const status = verified && dnsOk ? "active" : "pending";
  if (status !== site.domainStatus) {
    await prisma.site.update({
      where: { id: site.id },
      data: { domainStatus: status, ...(status === "active" ? { domainVerifiedAt: new Date() } : {}) },
    });
    forgetDomain(domain);
  }
  return {
    enabled: true,
    domain,
    status,
    dnsOk,
    verified,
    verification: (pd.data.verification ?? []).map(({ type, domain: name, value }) => ({ type, name, value })),
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const { guard, site } = await load(slug);
  if (!guard.ok) return deny(guard.status);
  return NextResponse.json(await check(site!));
}

export async function POST(req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const { guard, site } = await load(slug);
  if (!guard.ok) return deny(guard.status);
  const body = await req.json().catch(() => ({}));
  const domain = cleanDomain(body.domain);
  if (!domain) return NextResponse.json({ error: "Tohle nevypadá jako doména. Zadej ji ve tvaru chata-olinka.cz." }, { status: 400 });
  if (!vercelEnabled())
    return NextResponse.json({ error: "Připojení domén zatím není zapnuté. Ozvi se nám a nastavíme to." }, { status: 503 });
  const taken = await prisma.site.findFirst({ where: { customDomain: domain, NOT: { id: site!.id } }, select: { id: true } });
  if (taken) return NextResponse.json({ error: "Tuhle doménu už používá jiný web." }, { status: 409 });

  const added = await addDomain(domain);
  if (!added.ok) {
    return NextResponse.json(
      { error: added.data.error?.message ? `Doménu se nepodařilo připojit: ${added.data.error.message}` : "Doménu se nepodařilo připojit." },
      { status: 400 }
    );
  }
  // Předchozí doménu odpojit
  if (site!.customDomain && site!.customDomain !== domain) {
    await removeDomain(site!.customDomain).catch(() => {});
    forgetDomain(site!.customDomain);
  }
  const updated = await prisma.site.update({
    where: { id: site!.id },
    data: { customDomain: domain, domainStatus: "pending", domainVerifiedAt: null },
    select: { id: true, customDomain: true, domainStatus: true },
  });
  return NextResponse.json(await check(updated), { status: 201 });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const { guard, site } = await load(slug);
  if (!guard.ok) return deny(guard.status);
  if (site!.customDomain) {
    if (vercelEnabled()) await removeDomain(site!.customDomain).catch(() => {});
    forgetDomain(site!.customDomain);
  }
  await prisma.site.update({ where: { id: site!.id }, data: { customDomain: null, domainStatus: "", domainVerifiedAt: null } });
  return NextResponse.json({ ok: true });
}
