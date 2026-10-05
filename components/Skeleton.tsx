// Ghost loadery: šedé pulzující bloky ve tvaru obsahu, který se teprve načítá.
// Uživatel hned vidí rozložení stránky místo textu „Načítám…".

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={`skeleton rounded-lg ${className}`} style={style} />;
}

/** Obal pro čtečky obrazovky — oznámí načítání jednou, bloky uvnitř jsou skryté. */
function Loading({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={className}>
      {children}
    </div>
  );
}

/** Nadpis stránky + podtitulek. */
export function HeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="space-y-2.5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64 max-w-[70vw]" />
      </div>
      {action && <Skeleton className="h-10 w-36 rounded-full" />}
    </div>
  );
}

export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Karta s řádky (seznam rezervací, nákladů, voucherů…). */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="ml-auto h-4 w-20" />
            <Skeleton className="ml-auto h-5 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Samostatné karty pod sebou (úklidy). */
export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex justify-between gap-3">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Měsíční kalendář 7 × 5. */
export function CalendarSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }, (_, i) => (
          <Skeleton key={i} className="aspect-square w-full sm:aspect-[4/3]" />
        ))}
      </div>
    </div>
  );
}

/** Formulář v kartách (Můj web). */
export function FormSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/* ---- Celé stránky ---- */

export function DashboardSkeleton() {
  return (
    <Loading label="Načítám přehled" className="space-y-6">
      <HeaderSkeleton />
      <StatTilesSkeleton />
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div className="flex justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
        <div className="flex h-40 items-end gap-3">
          {[45, 70, 55, 85, 60, 35].map((h, i) => (
            <Skeleton key={i} className="flex-1 rounded-b-none rounded-t-md" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <ListSkeleton rows={3} />
    </Loading>
  );
}

export function ListPageSkeleton({ label, rows = 5, tiles = false }: { label: string; rows?: number; tiles?: boolean }) {
  return (
    <Loading label={label} className="space-y-5">
      <HeaderSkeleton action />
      {tiles && <StatTilesSkeleton count={3} />}
      <ListSkeleton rows={rows} />
    </Loading>
  );
}

export function CalendarPageSkeleton() {
  return (
    <Loading label="Načítám kalendář" className="space-y-5">
      <HeaderSkeleton action />
      <CalendarSkeleton />
    </Loading>
  );
}

export function FormPageSkeleton({ label }: { label: string }) {
  return (
    <Loading label={label} className="space-y-5">
      <HeaderSkeleton />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <FormSkeleton />
    </Loading>
  );
}

export function CardsPageSkeleton({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <Loading label={label} className="space-y-5">
      <HeaderSkeleton />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <CardsSkeleton count={count} />
    </Loading>
  );
}

export { Loading };
