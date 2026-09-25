import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

// Deterministický seed s daty vztaženými k aktuálnímu měsíci,
// aby dashboard vždy ukazoval smysluplný graf.
function monthsAgo(m, day) {
  const now = new Date();
  // UTC půlnoc — sloupce s termíny pobytu jsou typu DATE
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, day));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function publicId() {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  return [...randomBytes(10)].map((b) => alphabet[b % alphabet.length]).join("");
}

// Komu demo web patří, aby ho bylo vidět v administraci. E-mail se bere
// z .env (SEED_OWNER_EMAIL), ať v repozitáři není ničí osobní adresa.
async function ownerIdFromEnv() {
  const email = process.env.SEED_OWNER_EMAIL;
  if (!email) return null;
  const rows = await prisma.$queryRaw`SELECT id::text FROM auth.users WHERE email = ${email} LIMIT 1`;
  if (!rows.length) {
    console.warn(`Účet ${email} v Supabase Auth neexistuje — demo web zůstane bez vlastníka.`);
    return null;
  }
  return rows[0].id;
}

// --- Demo rezervace: rok zpátky a tři měsíce dopředu ---------------------
// Pseudonáhoda se stálým semínkem, takže každý seed vypadá stejně
// (jen posunutý k dnešku). V létě a o víkendech je chata plnější.

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const FIRST = ["Jana", "Petr", "Alena", "Tomáš", "Lucie", "Martin", "Eva", "Jakub", "Karolína", "Ondřej", "Barbora", "Lukáš", "Tereza", "David", "Klára", "Filip", "Veronika", "Michal", "Anna", "Jan", "Kateřina", "Vojtěch", "Markéta", "Adam", "Zuzana", "Radek", "Monika", "Daniel", "Simona", "Matěj"];
const LAST_M = ["Novák", "Dvořák", "Černý", "Procházka", "Kučera", "Veselý", "Horák", "Němec", "Marek", "Pokorný", "Král", "Beneš", "Fiala", "Sedláček", "Zeman"];
const FEMALE = new Set(["Jana", "Alena", "Lucie", "Eva", "Karolína", "Barbora", "Tereza", "Klára", "Veronika", "Anna", "Kateřina", "Markéta", "Zuzana", "Monika", "Simona"]);

function femaleSurname(last) {
  if (last.endsWith("ý")) return last.slice(0, -1) + "á";
  if (last.endsWith("a")) return last.slice(0, -1) + "ová";
  if (last === "Němec") return "Němcová";
  if (last === "Marek") return "Marková";
  return last + "ová";
}

function ascii(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function pick(rand, items) {
  return items[Math.floor(rand() * items.length)];
}

function demoReservations() {
  const rand = rng(20260925);
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const from = addDays(today, -365);
  const to = addDays(today, 95);
  // Servis sauny (blokace níže) — do těch dní nic nerezervovat
  const blockFrom = addDays(today, 7);
  const blockTo = addDays(today, 9);

  const out = [];
  let day = from;
  while (day < to) {
    const month = day.getUTCMonth();
    const summer = month >= 5 && month <= 7;
    const winterHoliday = month === 11 || month === 0 || month === 1;
    // Mezera do dalšího pobytu: v sezóně kratší
    const gap = Math.floor(rand() * (summer ? 3 : winterHoliday ? 5 : 8));
    let start = addDays(day, gap);
    // Mimo sezónu hosté spíš přijíždějí v pátek
    if (!summer && rand() < 0.6) {
      while (start.getUTCDay() !== 5) start = addDays(start, 1);
    }
    const nights = summer ? 2 + Math.floor(rand() * 5) : 2 + Math.floor(rand() * 3);
    const end = addDays(start, nights);
    if (end > to) break;
    if (start < blockTo && end > blockFrom) {
      day = blockTo;
      continue;
    }

    const first = pick(rand, FIRST);
    const lastM = pick(rand, LAST_M);
    const last = FEMALE.has(first) ? femaleSurname(lastM) : lastM;

    const adult = rand() < 0.2 ? 1 : rand() < 0.75 ? 2 : 3;
    const child = adult < 3 && rand() < 0.3 ? 1 + Math.floor(rand() * (4 - adult - 1)) : 0;
    const counts = {
      adult,
      child,
      infant: rand() < 0.08 ? 1 : 0,
      dog: rand() < 0.15 ? 1 : 0,
    };

    const past = end <= today;
    const soon = (start - today) / 86_400_000 < 45;
    let status;
    if (rand() < 0.08) status = "cancelled";
    else if (past) status = "paid";
    else status = soon && rand() < 0.4 ? "pending" : "paid";

    const s = rand();
    const source = s < 0.55 ? "web" : s < 0.75 ? "airbnb" : s < 0.9 ? "booking" : "manual";
    // Airbnb a Booking vybírají platbu samy — u nich nic nečeká.
    if (source !== "web" && status === "pending") status = "paid";

    // Rezervace vzniká 3–60 dní před příjezdem, nikdy v budoucnu
    let createdAt = addDays(start, -(3 + Math.floor(rand() * 58)));
    if (createdAt > today) createdAt = addDays(today, -Math.floor(rand() * 3));
    createdAt.setUTCHours(8 + Math.floor(rand() * 13), Math.floor(rand() * 60));

    out.push({
      guestName: `${first} ${last}`,
      email: `${ascii(first)}.${ascii(last)}@email.cz`,
      phone: rand() < 0.7 ? `+420 ${600 + Math.floor(rand() * 180)} ${100 + Math.floor(rand() * 900)} ${100 + Math.floor(rand() * 900)}` : "",
      counts,
      start,
      nights,
      status,
      source,
      createdAt,
    });
    // Zrušená rezervace termín neblokuje, další pobyt tak může začít hned.
    day = status === "cancelled" ? start : end;
  }
  return out;
}

// Zjednodušený ceník demo webu: víkendové noci (pá, so) +15 %,
// pes +200 Kč/noc, úklid za pobyt a poplatek z pobytu za dospělého a noc.
function demoPrice(site, r) {
  let nightsTotal = 0;
  for (let i = 0; i < r.nights; i++) {
    const dow = addDays(r.start, i).getUTCDay();
    const base = dow === 5 || dow === 6 ? Math.round(site.pricePerNight * 1.15) : site.pricePerNight;
    nightsTotal += base + r.counts.dog * 200;
  }
  const feesTotal = site.cleaningFee + site.touristTax * r.counts.adult * r.nights;
  return { nightsTotal, feesTotal };
}

async function main() {
  await prisma.site.deleteMany({ where: { slug: "demo" } });
  const ownerId = await ownerIdFromEnv();

  const site = await prisma.site.create({
    data: {
      slug: "demo",
      ownerId,
      name: "Chata Meduňka",
      tagline: "Tiny house na kraji lesa, kde čas plyne pomaleji",
      description:
        "Meduňka je architektonicky navržený tiny house na okraji brdských lesů. Velkorysé prosklení s výhledem do korun stromů, kamna na dřevo, venkovní sauna a úplné ticho. Ideální únik pro dva až čtyři hosty, kteří si chtějí odpočinout od města.",
      propertyType: "tiny house",
      pricePerNight: 2900,
      pricingMode: "unit",
      weekendValue: 15,
      weekendUnit: "pct",
      // Demo web ukazuje rozdělenou skladbu včetně psa, ať je co zkoušet
      guestMode: "split",
      guestCategories: JSON.stringify([
        { key: "adult",  label: "Dospělí (13 let a více)", enabled: true,  adjust: { value: 0, unit: "pct" },    capacity: true,  tax: true },
        { key: "child",  label: "Děti 2–12 let",           enabled: true,  adjust: { value: 0, unit: "pct" },    capacity: true,  tax: false },
        { key: "infant", label: "Děti do 2 let",           enabled: true,  adjust: { value: 0, unit: "pct" },    capacity: false, tax: false },
        { key: "dog",    label: "Pes",                     enabled: true,  adjust: { value: 200, unit: "czk" },  capacity: false, tax: false },
      ]),
      maxGuests: 4,
      amenities:
        "Sauna, Kamna na dřevo, Plně vybavená kuchyň, Wi-Fi, Terasa s výhledem, Parkování, Vana pod hvězdami, Snídaňový koš",
      photos: [
        "/demo/01-chata-v-lese.jpg|Srub mezi borovicemi na kraji lesa",
        "/demo/02-a-frame.jpg|Dřevěná káď na terase — vana pod hvězdami",
        "/demo/03-kamna.jpg|Obytná část s kamny na dřevo",
        "/demo/04-okno.jpg|Prosklená stěna s výhledem do korun stromů",
        "/demo/05-sauna.jpg|Sauna s panoramatickým oknem",
        "/demo/06-loznice.jpg|Podkrovní ložnice",
        "/demo/07-jidelni-kout.jpg|Jídelní kout z masivního dřeva",
        "/demo/08-houpaci-sit.jpg|Houpací síť mezi stromy",
      ].join("\n"),
      themeColor: "pine",
      tier: "pro",
      contactEmail: "ahoj@chata-medunka.cz",
      contactPhone: "+420 777 123 456",
      // Pravidla pobytu a poplatky
      minNights: 2,
      leadTimeDays: 1,
      checkInTime: "15:00",
      checkOutTime: "10:00",
      cleaningFee: 800,
      touristTax: 50,
      bankAccount: "19-2000145399/0800",
      cancellationPolicy:
        "Zrušení do 14 dní před příjezdem je zdarma, později se účtuje 50 % ceny pobytu.",
    },
  });

  const reservations = demoReservations();

  for (const r of reservations) {
    const { nightsTotal, feesTotal } = demoPrice(site, r);
    await prisma.reservation.create({
      data: {
        publicId: publicId(),
        siteId: site.id,
        guestName: r.guestName,
        email: r.email,
        phone: r.phone,
        guests: r.counts.adult + r.counts.child,
        guestBreakdown: JSON.stringify(r.counts),
        startDate: r.start,
        endDate: addDays(r.start, r.nights),
        nightsTotal,
        feesTotal,
        totalPrice: nightsTotal + feesTotal,
        source: r.source,
        status: r.status,
        // Čekající rezervace drží termín ještě den, zaplacené a zrušené nevyprší.
        expiresAt: r.status === "pending" ? new Date(Date.now() + 86_400_000) : null,
        createdAt: r.createdAt,
      },
    });
  }

  // Blokace majitele: příští týden servis sauny
  const nextWeek = addDays(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())), 7);
  await prisma.blackout.create({
    data: {
      siteId: site.id,
      startDate: nextWeek,
      endDate: addDays(nextWeek, 2),
      reason: "Servis sauny",
    },
  });

  // Sezónní období: příští dva měsíce jako hlavní sezóna +20 %
  const now = new Date();
  await prisma.priceRule.create({
    data: {
      siteId: site.id,
      label: "Hlavní sezóna",
      startDate: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)),
      endDate: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 3, 0)),
      value: 20,
      unit: "pct",
    },
  });

  // Náklady: pravidelné se zadávají jednou (opakují se samy), k tomu sezónní
  // a jednorázové výdaje za poslední rok.
  const costs = [
    { label: "Elektřina", amount: 1900, category: "energie", repeat: "monthly", date: monthsAgo(11, 15) },
    { label: "Úklid po hostech", amount: 4200, category: "služby", repeat: "monthly", date: monthsAgo(11, 28) },
    { label: "Prádelna – povlečení", amount: 950, category: "služby", repeat: "monthly", date: monthsAgo(11, 6) },
    { label: "Internet", amount: 490, category: "provoz", repeat: "monthly", date: monthsAgo(11, 10) },
    { label: "Pojištění nemovitosti", amount: 4800, category: "pojištění", repeat: "yearly", date: monthsAgo(8, 1) },
    { label: "Rezervační kalendář (starý)", amount: 390, category: "provoz", repeat: "monthly", date: monthsAgo(11, 2), endDate: monthsAgo(4, 2) },
    { label: "Oprava saunových kamen", amount: 5400, category: "údržba", date: monthsAgo(3, 11) },
    { label: "Nátěr terasy", amount: 7800, category: "údržba", date: monthsAgo(5, 20) },
    { label: "Nové povlečení a ručníky", amount: 4300, category: "vybavení", date: monthsAgo(8, 9) },
    { label: "Vývoz septiku", amount: 2600, category: "provoz", date: monthsAgo(7, 17) },
  ];
  // Dřevo do kamen v každém zimním měsíci
  for (let m = 11; m >= 0; m--) {
    const month = monthsAgo(m, 1).getUTCMonth();
    if (month <= 2 || month >= 10) costs.push({ label: "Dřevo do kamen", amount: 3200, category: "provoz", date: monthsAgo(m, 4) });
  }
  for (const c of costs) {
    await prisma.cost.create({ data: { siteId: site.id, ...c } });
  }

  console.log(
    `Seed hotový: demo web + ${reservations.length} rezervací + ${costs.length} nákladů + 1 blokace` +
      (ownerId ? ` · vlastník ${process.env.SEED_OWNER_EMAIL}` : " · bez vlastníka") +
      "."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
