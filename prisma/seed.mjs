import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Deterministický seed s daty vztaženými k aktuálnímu měsíci,
// aby dashboard vždy ukazoval smysluplný graf.
function monthsAgo(m, day, hour = 14) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - m, day, hour, 0, 0);
}

async function main() {
  await prisma.site.deleteMany({ where: { slug: "demo" } });

  const site = await prisma.site.create({
    data: {
      slug: "demo",
      name: "Chata Meduňka",
      tagline: "Tiny house na kraji lesa, kde čas plyne pomaleji",
      description:
        "Meduňka je architektonicky navržený tiny house na okraji brdských lesů. Velkorysé prosklení s výhledem do korun stromů, kamna na dřevo, venkovní sauna a úplné ticho. Ideální únik pro dva až čtyři hosty, kteří si chtějí odpočinout od města.",
      propertyType: "tiny house",
      pricePerNight: 2900,
      pricingMode: "unit",
      weekendPct: 15,
      maxGuests: 4,
      amenities:
        "Sauna, Kamna na dřevo, Plně vybavená kuchyň, Wi-Fi, Terasa s výhledem, Parkování, Vana pod hvězdami, Snídaňový koš",
      themeColor: "pine",
      tier: "pro",
      contactEmail: "ahoj@chata-medunka.cz",
      contactPhone: "+420 777 123 456",
    },
  });

  const reservations = [
    { guestName: "Jana Veselá", email: "jana.vesela@email.cz", phone: "+420 601 111 222", guests: 2, start: monthsAgo(5, 12), nights: 3, status: "paid" },
    { guestName: "Petr Dvořák", email: "petr.dvorak@email.cz", phone: "+420 602 333 444", guests: 4, start: monthsAgo(4, 3), nights: 2, status: "paid" },
    { guestName: "Alena Krátká", email: "alena.k@email.cz", phone: "", guests: 2, start: monthsAgo(4, 20), nights: 4, status: "paid" },
    { guestName: "Tomáš Beneš", email: "tomas.benes@email.cz", phone: "+420 603 555 666", guests: 3, start: monthsAgo(3, 8), nights: 2, status: "paid" },
    { guestName: "Lucie Malá", email: "lucie.mala@email.cz", phone: "", guests: 2, start: monthsAgo(2, 14), nights: 5, status: "paid" },
    { guestName: "Martin Horák", email: "m.horak@email.cz", phone: "+420 604 777 888", guests: 4, start: monthsAgo(2, 27), nights: 2, status: "paid" },
    { guestName: "Eva Šimková", email: "eva.simkova@email.cz", phone: "", guests: 2, start: monthsAgo(1, 5), nights: 3, status: "paid" },
    { guestName: "Jakub Novotný", email: "jakub.n@email.cz", phone: "+420 605 999 000", guests: 2, start: monthsAgo(0, 2), nights: 2, status: "paid" },
    { guestName: "Karolína Fialová", email: "karolina.f@email.cz", phone: "", guests: 3, start: monthsAgo(-1, 10), nights: 3, status: "pending" },
    { guestName: "Ondřej Král", email: "ondrej.kral@email.cz", phone: "+420 606 121 212", guests: 2, start: monthsAgo(-1, 13), nights: 2, status: "pending" },
    { guestName: "Barbora Nová", email: "bara.nova@email.cz", phone: "", guests: 4, start: monthsAgo(1, 18), nights: 1, status: "cancelled" },
  ];

  for (const r of reservations) {
    const end = new Date(r.start);
    end.setDate(end.getDate() + r.nights);
    await prisma.reservation.create({
      data: {
        siteId: site.id,
        guestName: r.guestName,
        email: r.email,
        phone: r.phone,
        guests: r.guests,
        startDate: r.start,
        endDate: end,
        totalPrice: r.nights * site.pricePerNight,
        status: r.status,
      },
    });
  }

  // Sezónní období: příští dva měsíce jako hlavní sezóna +20 %
  // (UTC půlnoc, aby se datum nikde neposunulo o den)
  const now = new Date();
  await prisma.priceRule.create({
    data: {
      siteId: site.id,
      label: "Hlavní sezóna",
      startDate: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)),
      endDate: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 3, 0)),
      pct: 20,
    },
  });

  const costs = [
    { label: "Elektřina", amount: 1850, category: "energie", date: monthsAgo(1, 15) },
    { label: "Dřevo do kamen", amount: 3200, category: "provoz", date: monthsAgo(2, 4) },
    { label: "Úklid po hostech", amount: 4800, category: "služby", date: monthsAgo(1, 28) },
    { label: "Pojištění nemovitosti", amount: 1250, category: "pojištění", date: monthsAgo(0, 1) },
    { label: "Prádelna – povlečení", amount: 980, category: "služby", date: monthsAgo(0, 6) },
    { label: "Oprava saunových kamen", amount: 5400, category: "údržba", date: monthsAgo(3, 11) },
  ];
  for (const c of costs) {
    await prisma.cost.create({ data: { siteId: site.id, ...c } });
  }

  console.log("Seed hotový: demo web + " + reservations.length + " rezervací + " + costs.length + " nákladů.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
