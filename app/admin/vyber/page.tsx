"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/Skeleton";

// Po přihlášení: s jednou nemovitostí rovnou na Přehled, s více nejdřív výběr
// (karty nemovitostí), ať je jasné, kterou právě spravuješ.
export default function ChoosePropertyPage() {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/sites")
      .then((r) => (r.ok ? r.json() : []))
      .then((sites: { slug: string }[]) => {
        if (!Array.isArray(sites) || sites.length === 0) return router.replace("/onboarding");
        if (sites.length === 1) {
          localStorage.setItem("tainy.site", sites[0].slug);
          return router.replace("/admin");
        }
        router.replace("/admin/nastaveni/nemovitosti?vyber=1");
      })
      .catch(() => router.replace("/admin"));
  }, [router]);
  return (
    <div className="space-y-4" role="status" aria-label="Načítám nemovitosti">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
