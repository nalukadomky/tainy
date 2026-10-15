// Pracovní dny v Česku (víkendy a státní svátky) — lhůta pro hlášení cizinců
// policii je „do 3 pracovních dnů ode dne ubytování“.

import { addDays } from "@/lib/stay";

/** Velikonoční neděle (gregoriánský výpočet, Meeus/Jones/Butcher). */
function easterSunday(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const FIXED = ["01-01", "05-01", "05-08", "07-05", "07-06", "09-28", "10-28", "11-17", "12-24", "12-25", "12-26"];

export function isHoliday(iso: string): boolean {
  if (FIXED.includes(iso.slice(5))) return true;
  const easter = easterSunday(Number(iso.slice(0, 4)));
  return iso === addDays(easter, -2) || iso === addDays(easter, 1); // Velký pátek, Velikonoční pondělí
}

export function isWorkday(iso: string): boolean {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !isHoliday(iso);
}

/** Den, kdy uplyne `n` pracovních dnů po dni `iso` (ten se nepočítá). */
export function addWorkdays(iso: string, n: number): string {
  let day = iso;
  let left = n;
  while (left > 0) {
    day = addDays(day, 1);
    if (isWorkday(day)) left--;
  }
  return day;
}

/** Lhůta pro nahlášení cizince (poslední den, kdy je to ještě včas). */
export const ubyportDeadline = (arrival: string) => addWorkdays(arrival, 3);
