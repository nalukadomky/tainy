import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { newGiftPublicId, newGiftToken, offerDesign, sendGiftOrderMail, sendGiftOwnerMail } from "@/lib/gift-server";
import { cleanGift } from "@/lib/gift";

// Objednávka dárkového poukazu z webu nebo widgetu (bez přihlášení). Kupující pak zaplatí
// QR kódem na stránce /darek/<publicId>; poukaz s kódem dostane po potvrzení platby.

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v);

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Past na roboty
  if (text(body.company, 100)) return NextResponse.json({ error: "Objednávku se nepodařilo odeslat." }, { status: 400 });

  const offer = await prisma.giftOffer.findUnique({ where: { id: String(body.offerId ?? "") }, include: { site: true } });
  // Prodává se na webu v tainy i ve widgetu na webu majitele (i u účtu jen s widgetem)
  if (!offer || !offer.onSale || !offer.site.bankAccount) return NextResponse.json({ error: "Tenhle poukaz už není v nabídce." }, { status: 404 });

  const buyerName = text(body.buyerName, 80);
  const buyerEmail = text(body.buyerEmail, 120).toLowerCase();
  const recipient = text(body.recipient, 60);
  const dedication = typeof body.dedication === "string" ? body.dedication.trim().slice(0, 240) : "";
  if (buyerName.length < 2) return NextResponse.json({ error: "Doplň své jméno.", field: "buyerName" }, { status: 400 });
  if (!isEmail(buyerEmail)) return NextResponse.json({ error: "Zkontroluj e-mail.", field: "buyerEmail" }, { status: 400 });
  if (body.terms !== true) return NextResponse.json({ error: "Potvrď prosím souhlas s podmínkami.", field: "terms" }, { status: 400 });

  // Limit: stejný e-mail nejvýš 5 objednávek za hodinu
  const recent = await prisma.giftOrder.count({ where: { buyerEmail, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent >= 5) return NextResponse.json({ error: "Objednávek je teď moc. Zkus to prosím za chvíli." }, { status: 429 });

  const base = offerDesign(offer);
  // „Bez věnování“: ani předvyplněný text z nabídky
  const message = body.noMessage === true ? "" : dedication || base.message;
  // „Komu“ zvlášť (na poukazu tučně nad věnováním), přesně jak ho kupující napsal
  const design = { ...cleanGift({ ...base, message }), recipient };
  const order = await prisma.giftOrder.create({
    data: {
      publicId: await newGiftPublicId(),
      accessToken: newGiftToken(),
      siteId: offer.siteId,
      offerId: offer.id,
      design: JSON.stringify(design),
      price: offer.price,
      buyerName,
      buyerEmail,
      recipient,
      dedication,
      termsAcceptedAt: new Date(),
    },
  });
  after(async () => {
    await sendGiftOrderMail(order, offer.site, design).catch(() => {});
    await sendGiftOwnerMail(order, offer.site, design).catch(() => {});
  });
  return NextResponse.json({ token: order.accessToken }, { status: 201 });
}
