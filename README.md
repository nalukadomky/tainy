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

Next.js (App Router) · TypeScript · Tailwind CSS 4 · Prisma + PostgreSQL (Supabase) · Anthropic Claude API

## Lokální spuštění

```bash
npm install
cp .env.example .env  # a doplň DATABASE_URL / DIRECT_URL ze Supabase
npm run db:push       # vytvoří tabulky v databázi
npm run db:seed       # naplní demo web „Chata Meduňka" + rezervace a náklady
npm run dev           # http://localhost:3000
```

Demo web: `/w/demo` · Demo administrace: `/admin`

## Konfigurace

Zkopíruj `.env.example` do `.env` (je gitignorovaný) a doplň:

- `DATABASE_URL` – Supabase Transaction pooler (port 6543, `?pgbouncer=true`) – běh aplikace
- `DIRECT_URL` – Supabase Session/Direct (port 5432) – migrace `prisma db push`
- `ANTHROPIC_API_KEY` – volitelné; bez klíče běží AI asistent v ukázkovém režimu

## Ceník (jak se počítá)

Cena se počítá **noc po noci**: základní cena za noc (za nemovitost, nebo za osobu) + víkendová
přirážka v % (noci pá–ne) + sezónní období v ± %. Procenta se sčítají.

## Nasazení na Vercel

Databáze běží na **Supabase (PostgreSQL)**, takže aplikace funguje i v serverless prostředí.
Ve Vercelu stačí nastavit proměnné prostředí `DATABASE_URL`, `DIRECT_URL` a (volitelně)
`ANTHROPIC_API_KEY`. Build spouští `prisma generate` automaticky (`postinstall`).
