# tainy

Moderní prezentační web s **rezervacemi ubytování** a jednoduchá správa pronájmu.
Mobile-first, česky.

- **Prezentační web + onboarding** – marketingová landing page a krokový průvodce vytvořením webu
- **Veřejný web nemovitosti** (`/w/[slug]`) – prezentace + rezervační kalendář (den příjezdu/odjezdu
  jako půlden), flexibilní ceník, konečná cena včetně poplatků, QR platba
- **Galerie s lightboxem** – mřížka náhledů, po rozkliknutí fotka přes celou obrazovku
  s přepínáním šipkami, klávesnicí i svípnutím prstem
- **Stránka rezervace pro hosta** (`/r/[kód]`) – termín, konečná cena, QR platba, kontakt na majitele
- **Administrace** (`/admin`) – dashboard výdělků, správa rezervací a hostů, evidence nákladů,
  kalendář s blokacemi, vouchery, editace webu a ceníku s živým náhledem

Podrobná specifikace produktu je v [PROMPT.md](PROMPT.md).

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS 4 · Prisma + PostgreSQL (Supabase)

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
- `RESEND_API_KEY` + `RESEND_FROM` – volitelné; bez klíče se e-maily jen vypíšou do konzole
- `NEXT_PUBLIC_APP_URL` – veřejná adresa pro odkazy v e-mailech (na Vercelu volitelné)

### Přihlášení (Supabase Auth)

Registrace i login běží přes Supabase Auth (Google OAuth + e-mail/heslo). V Supabase dashboardu je potřeba:

1. **Authentication → Providers → Google:** zapnout a vložit Google OAuth Client ID + Secret
   (redirect URI v Google Cloud: `https://<ref>.supabase.co/auth/v1/callback`).
2. **Authentication → URL Configuration:** Site URL + do Redirect URLs přidat
   `http://localhost:3000/auth/callback` a `https://<doména>/auth/callback`.
3. **Authentication → Email → „Confirm email":** vypnout pro plynulý funnel (nebo nechat zapnuté —
   registrace pak zobrazí „zkontroluj e-mail").

## Fotky

Galerie se ukládá do textového pole `Site.photos` — jedna fotka na řádek ve tvaru
`adresa|popisek`, první je hlavní. Popisek slouží jako alt text. Nahrávání souborů
přijde později; zatím se vkládají adresy (např. `/demo/sauna.jpg`).

Fotky demo webu v `public/demo/` pocházejí z [Unsplash](https://unsplash.com) a spadají pod
[Unsplash License](https://unsplash.com/license) — volné i pro komerční užití, bez povinnosti
uvádět autora. Slouží jen jako ukázka, pro ostrý web si každý majitel nahraje vlastní.

## Ceník (jak se počítá)

Cena se počítá **noc po noci**: základní cena za noc (za nemovitost, nebo za osobu) + víkendová
přirážka v % (noci pá–ne) + sezónní období v ± %. Procenta se sčítají. K ceně za noci se přičte
**úklidový poplatek** (jednou za pobyt) a **poplatek z pobytu** (Kč × hosté × noci), takže host
vidí konečnou částku.

## Rezervace (jak se drží termín)

Termín drží nezrušená rezervace, která ještě nevypršela, a **blokace majitele** (`Blackout` —
údržba, vlastní pobyt). Nezaplacená rezervace vyprší (24 h u QR platby, 72 h u domluvy s majitelem)
a termín se sám uvolní. Zakládání rezervace běží v transakci s zámkem na nemovitost, takže dvě
souběžné rezervace stejného termínu nemohou projít obě — druhá dostane 409.

Pravidla pobytu (nejkratší pobyt, nejdřívější příjezd, kapacita) se vyhodnocují v `lib/stay.ts`
a používá je jak widget, tak API — hlášky jsou proto na obou stranách stejné.

## Nasazení na Vercel

Databáze běží na **Supabase (PostgreSQL)**, takže aplikace funguje i v serverless prostředí.
Ve Vercelu nastav proměnné `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Build spouští
`prisma generate` automaticky (`postinstall`).
