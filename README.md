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
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` – **povinné** pro přihlášení (Supabase Auth)
- `ANTHROPIC_API_KEY` – volitelné; bez klíče běží AI asistent v ukázkovém režimu

### Přihlášení (Supabase Auth)

Registrace i login běží přes Supabase Auth (Google OAuth + e-mail/heslo). V Supabase dashboardu je potřeba:

1. **Authentication → Providers → Google:** zapnout a vložit Google OAuth Client ID + Secret
   (redirect URI v Google Cloud: `https://<ref>.supabase.co/auth/v1/callback`).
2. **Authentication → URL Configuration:** Site URL + do Redirect URLs přidat
   `http://localhost:3000/auth/callback` a `https://<doména>/auth/callback`.
3. **Authentication → Email → „Confirm email":** vypnout pro plynulý funnel (nebo nechat zapnuté —
   registrace pak zobrazí „zkontroluj e-mail").

## Ceník (jak se počítá)

Cena se počítá **noc po noci**: základní cena za noc (za nemovitost, nebo za osobu) + víkendová
přirážka v % (noci pá–ne) + sezónní období v ± %. Procenta se sčítají.

## Nasazení na Vercel

Databáze běží na **Supabase (PostgreSQL)**, takže aplikace funguje i v serverless prostředí.
Ve Vercelu nastav proměnné `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` a (volitelně) `ANTHROPIC_API_KEY`. Build spouští
`prisma generate` automaticky (`postinstall`).
