import { NextResponse } from "next/server";
import { importEnabled } from "@/lib/import/flag";

// Je import webu zapnutý? (Vypíná se proměnnou IMPORT_DISABLED.)
export async function GET() {
  return NextResponse.json({ allowed: importEnabled() });
}
