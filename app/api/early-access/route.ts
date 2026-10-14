import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { platformAdmins } from "@/lib/early-access";
import { appUrl, send } from "@/lib/email";

// Žádost o přístup (early access) z úvodní stránky. Žadateli se nic neposílá
// (formulář nesmí jít zneužít k rozesílání e-mailů cizím lidem), správcům
// platformy přijde upozornění. Opakovaný e-mail se jen tiše aktualizuje.

const PER_IP_HOUR = 5;
const TYPES = ["chata", "tiny house", "apartmán", "glamping", "jiné"];
const SOURCES = ["landing", "register", "onboarding", "import"];

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Past na roboty: skryté pole vyplní jen automat — tváříme se, že je vše v pořádku
  if (text(body.company, 200)) return NextResponse.json({ ok: true });

  const email = text(body.email, 160).toLowerCase();
  if (!isEmail(email)) return NextResponse.json({ error: "Zkontroluj prosím e-mail." }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ error: "Potvrď prosím souhlas se zpracováním osobních údajů." }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const ipHash = createHash("sha256").update(`tainy-ea:${ip}`).digest("hex").slice(0, 32);
  const recent = await prisma.earlyAccessRequest.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent >= PER_IP_HOUR) return NextResponse.json({ error: "Žádostí je teď moc. Zkus to prosím za chvíli." }, { status: 429 });

  const data = {
    name: text(body.name, 80),
    propertyType: TYPES.includes(String(body.propertyType)) ? String(body.propertyType) : "",
    website: text(body.website, 200),
    source: SOURCES.includes(String(body.source)) ? String(body.source) : "landing",
  };
  const existing = await prisma.earlyAccessRequest.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // Doplní jen to, co teď vyplnil (prázdná pole nepřepisují dřívější údaje)
    const filled = Object.fromEntries(Object.entries(data).filter(([k, v]) => v && k !== "source"));
    await prisma.earlyAccessRequest.update({ where: { email }, data: { ...filled, consentAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  await prisma.earlyAccessRequest.create({ data: { email, ipHash, consentAt: new Date(), ...data } });

  const admins = platformAdmins();
  if (admins.length) {
    const total = await prisma.earlyAccessRequest.count();
    const rows = [
      ["E-mail", email],
      ["Jméno", data.name],
      ["Ubytování", data.propertyType],
      ["Web", data.website],
      ["Odkud", data.source],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#5a6557">${k}</td><td>${esc(v)}</td></tr>`)
      .join("");
    // Upozornění nesmí shodit uložení žádosti
    await Promise.all(
      admins.map((to) =>
        send({
          to,
          subject: `Nová žádost o přístup: ${email}`,
          html: `<p style="font-family:sans-serif">Nová žádost o early access (celkem ${total}).</p><table style="font-family:sans-serif;font-size:14px">${rows}</table><p style="font-family:sans-serif"><a href="${appUrl()}/admin/early-access">Všechny žádosti</a></p>`,
        }).catch(() => false),
      ),
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
