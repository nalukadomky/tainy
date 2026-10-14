"use client";

import { useAdminData } from "@/lib/admin";
import { GuestBook } from "@/components/GuestBook";
import { ReservationTabs } from "@/components/ReservationTabs";

// Rezervace → Kniha ubytovaných (check-in hostů, poplatek z pobytu, exporty).
export default function GuestBookPage() {
  const { slug } = useAdminData();
  return (
    <div className="space-y-5">
      <ReservationTabs active="book" />
      {slug ? <GuestBook key={slug} slug={slug} /> : <div className="h-64 animate-pulse rounded-2xl bg-line/40" aria-busy />}
    </div>
  );
}
