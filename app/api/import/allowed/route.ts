import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { importAllowed } from "@/lib/import/flag";

// Smí přihlášený uživatel vidět import webu? (Seznam e-mailů zůstává na serveru.)
export async function GET() {
  const user = await getUser();
  // Ve vývoji i bez přihlášení (volba v registraci), jinak jen pro testery
  return NextResponse.json({ allowed: process.env.NODE_ENV === "development" || (!!user && importAllowed(user.email)) });
}
