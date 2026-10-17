import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { newGiftPublicId, newGiftToken, offerDesign, sendGiftOrderMail, sendGiftOwnerMail } from "@/lib/gift-server";
import { cleanGift, isFullName, isLikelyEmail } from "@/lib/gift";

// Objednávka dárkového poukazu z webu nebo widgetu (bez přihlášení). Kupující pak zaplatí
// QR kódem na stránce /darek/<publicId>; poukaz s kódem dostane po potvrzení platby.

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

const EMAIL_BAD = "E-mail není správně vyplněný — zkontroluj ho, ať ti poukaz dorazí.";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Past na roboty
  if (text(body.company, 100)) return NextResponse.json({ error: "Objednávku se nepodařilo odeslat." }, { status: 400 });

  const offer = await prisma.giftOffer.findUnique({ where: { id: String(body.offerId ?? "") }, include: { site: true } });
  // Prodává se na webu v tainy i ve widgetu na webu majitele (i u účtu jen s widgetem)
  if (!offer || !offer.onSale || !offer.site.bankAccount) return NextResponse.json({ error: "Tenhle poukaz už není v nabídce." }, { status: 404 });

  const buyerName = text(body.buyerName, 80);
  const buyerEmail = text(body.buyerEmail, 120).toLowerCase();
  const buyerPhone = text(body.buyerPhone, 30);
  const phoneDigits = buyerPhone.replace(/\D/g, "").length;
  const buyerStreet = text(body.buyerStreet, 120);
  const buyerCity = text(body.buyerCity, 80);
  const buyerZip = text(body.buyerZip, 12);
  const recipient = text(body.recipient, 60);
  const dedication = typeof body.dedication === "string" ? body.dedication.trim().split("\n").slice(0, 4).join("\n").slice(0, 140) : "";
  if (!isFullName(buyerName)) return NextResponse.json({ error: "Doplň jméno i příjmení.", field: "buyerName" }, { status: 400 });
  if (!isLikelyEmail(buyerEmail)) return NextResponse.json({ error: EMAIL_BAD, field: "buyerEmail" }, { status: 400 });
  if (!buyerPhone.startsWith("+") || phoneDigits < 8 || phoneDigits > 15)
    return NextResponse.json({ error: "Zkontroluj telefon.", field: "buyerPhone" }, { status: 400 });
  if (buyerStreet.length < 3) return NextResponse.json({ error: "Doplň ulici a číslo domu.", field: "buyerStreet" }, { status: 400 });
  if (buyerCity.length < 2) return NextResponse.json({ error: "Doplň město.", field: "buyerCity" }, { status: 400 });
  if (!/\d/.test(buyerZip) || buyerZip.length < 3) return NextResponse.json({ error: "Zkontroluj PSČ.", field: "buyerZip" }, { status: 400 });
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
      buyerPhone,
      buyerStreet,
      buyerCity,
      buyerZip,
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
