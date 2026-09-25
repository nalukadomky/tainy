// Jediný zdroj pravdy o obsazenosti (server).
//
// Termín je obsazený, když ho drží nezrušená a nevypršelá rezervace,
// nebo když ho majitel zablokoval (údržba, vlastní pobyt).
// Používá to veřejné API dostupnosti, zakládání rezervace i server-side
// render webu — aby kalendář nikde neukazoval jinou realitu.

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toISO, type Range } from "@/lib/stay";

type Db = PrismaClient | Prisma.TransactionClient;

/** Rezervace, které reálně drží termín: nezrušené a buď zaplacené, nebo dosud nevypršelé. */
export function holdsDates(): Prisma.ReservationWhereInput {
  return {
    status: { not: "cancelled" },
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

/** Obsazené rozsahy webu. `fromIso` omezí výsledek na termíny končící po tomto dni. */
export async function blockedRanges(
  siteId: string,
  fromIso?: string,
  db: Db = prisma
): Promise<Range[]> {
  const after = fromIso ? new Date(`${fromIso}T00:00:00.000Z`) : undefined;

  const [reservations, blackouts] = await Promise.all([
    db.reservation.findMany({
      where: { siteId, ...holdsDates(), ...(after && { endDate: { gte: after } }) },
      select: { startDate: true, endDate: true },
    }),
    db.blackout.findMany({
      where: { siteId, ...(after && { endDate: { gte: after } }) },
      select: { startDate: true, endDate: true },
    }),
  ]);

  return [...reservations, ...blackouts].map((r) => ({
    start: toISO(r.startDate),
    end: toISO(r.endDate),
  }));
}

/**
 * Zamkne web na dobu transakce, aby dvě souběžné rezervace nemohly
 * projít kontrolou obsazenosti současně. Zámek drží Postgres a uvolní
 * ho commit, takže funguje i přes Supabase transaction pooler.
 */
export async function lockSite(db: Db, siteId: string): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${siteId}))`;
}
