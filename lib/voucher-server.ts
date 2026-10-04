import type { Prisma, PrismaClient, Voucher } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fromISO, toISO } from "@/lib/stay";
import { normalizeCode, type VoucherRule } from "@/lib/voucher";

// Načtení voucheru z databáze pro ověření (server). Počet použití =
// nezrušené rezervace s tímto kódem, takže zrušení použití vrátí.

type Db = PrismaClient | Prisma.TransactionClient;

export function toRule(v: Voucher): VoucherRule {
  return {
    code: v.code,
    kind: v.kind === "czk" ? "czk" : "pct",
    value: v.value,
    validFrom: v.validFrom ? toISO(v.validFrom) : null,
    validTo: v.validTo ? toISO(v.validTo) : null,
    maxUses: v.maxUses,
    active: v.active,
  };
}

export async function voucherUses(siteId: string, code: string, db: Db = prisma): Promise<number> {
  return db.reservation.count({ where: { siteId, voucherCode: code, status: { not: "cancelled" } } });
}

/** Voucher webu podle kódu, jak ho zadal host; null = neexistuje. */
export async function findVoucher(siteId: string, rawCode: string, db: Db = prisma) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const voucher = await db.voucher.findUnique({ where: { siteId_code: { siteId, code } } });
  if (!voucher) return null;
  return { voucher, rule: toRule(voucher), uses: await voucherUses(siteId, code, db) };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Vstup z formuláře správy voucherů → data pro Prisma, nebo chybová hláška. */
export function parseVoucherInput(body: Record<string, unknown>, partial = false) {
  const data: Prisma.VoucherUncheckedUpdateInput = {};

  if (!partial || body.code !== undefined) {
    const code = normalizeCode(String(body.code ?? ""));
    if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) {
      return { error: "Kód musí mít 3–40 znaků: písmena bez diakritiky, čísla, pomlčka." } as const;
    }
    data.code = code;
  }
  if (!partial || body.kind !== undefined || body.value !== undefined) {
    const kind = body.kind === "czk" ? "czk" : "pct";
    const value = Math.round(Number(body.value));
    if (kind === "pct" && !(value >= 1 && value <= 100)) return { error: "Sleva v procentech musí být 1–100 %." } as const;
    if (kind === "czk" && !(value >= 1 && value <= 1_000_000)) return { error: "Zadej částku voucheru v Kč." } as const;
    data.kind = kind;
    data.value = value;
  }
  for (const key of ["validFrom", "validTo"] as const) {
    if (body[key] === undefined) continue;
    const v = body[key];
    if (v === null || v === "") data[key] = null;
    else if (typeof v === "string" && ISO.test(v)) data[key] = fromISO(v);
    else return { error: "Neplatné datum platnosti." } as const;
  }
  if (data.validFrom instanceof Date && data.validTo instanceof Date && data.validTo < data.validFrom) {
    return { error: "Platnost „do“ musí být po „od“." } as const;
  }
  if (body.maxUses !== undefined) {
    const n = body.maxUses === null || body.maxUses === "" ? null : Math.round(Number(body.maxUses));
    if (n !== null && !(n >= 1 && n <= 100_000)) return { error: "Počet použití musí být aspoň 1 (nebo prázdný)." } as const;
    data.maxUses = n;
  }
  if (body.note !== undefined) data.note = String(body.note).trim().slice(0, 120);
  if (body.active !== undefined) data.active = body.active === true;
  return { data } as const;
}

