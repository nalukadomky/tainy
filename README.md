# tainy

Nejrychlejší cesta k vlastnímu prezentačnímu webu s **rezervacemi ubytování** — s AI asistentem,
který web upraví za tebe. Mobile-first, česky.

- **Prezentační web + onboarding** – marketingová landing page a krokový průvodce vytvořením webu
- **Veřejný web nemovitosti** (`/w/[slug]`) – prezentace + rezervační kalendář (den příjezdu/odjezdu
  jako půlden), flexibilní ceník, mock Stripe checkout
- **Administrace** (`/admin`) – dashboard výdělků, správa rezervací a hostů, evidence nákladů,
  editace webu a ceníku, **hlasový AI asistent** (tarif Pro)

Podrobná specifikace produktu je v [PROMPT.md](PROMPT.md).

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS 4 · Prisma + SQLite · Anthropic Claude API

## Lokální spuštění

```bash
npm install
npm run db:push      # vytvoří SQLite databázi (prisma/dev.db)
npm run db:seed      # naplní demo web „Chata Meduňka" + rezervace a náklady
npm run dev          # http://localhost:3000
```

Demo web: `/w/demo` · Demo administrace: `/admin`

## Konfigurace

Vytvoř soubor `.env` (je gitignorovaný):

```
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=      # volitelné – bez klíče běží AI asistent v ukázkovém režimu
```

## Ceník (jak se počítá)

Cena se počítá **noc po noci**: základní cena za noc (za nemovitost, nebo za osobu) + víkendová
přirážka v % (noci pá–ne) + sezónní období v ± %. Procenta se sčítají.

## Poznámka k nasazení

Aplikace používá **SQLite**, které na serverless platformách (Vercel) nefunguje pro zápis
(read-only filesystem). Pro živé nasazení je potřeba hostovaná databáze (např. Turso/libSQL,
Vercel Postgres, Neon) — stačí změnit `datasource` v `prisma/schema.prisma` a `DATABASE_URL`.
