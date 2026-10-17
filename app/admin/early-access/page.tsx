import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { earlyAccess, isPlatformAdmin } from "@/lib/early-access";
import { appUrl } from "@/lib/email";
import { EarlyAccessAdmin } from "@/components/EarlyAccessAdmin";
import { HelpTip } from "@/components/HelpTip";

// Žádosti o přístup (early access). Jen pro správce platformy (PLATFORM_ADMINS).
export default async function EarlyAccessAdminPage() {
  if (!isPlatformAdmin(await getUser())) notFound();
  const rows = await prisma.earlyAccessRequest.findMany({ orderBy: { createdAt: "desc" }, take: 1000 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight flex flex-wrap items-center">
          Žádosti o přístup
          <HelpTip>{earlyAccess() ? "Registrace je zavřená — dovnitř se dostane jen pozvaný." : "Registrace je veřejná (PUBLIC_SIGNUP=1)."} Pozvaný se musí
          zaregistrovat stejným e-mailem, jaký uvedl v žádosti.</HelpTip>
        </h1>
      </div>
      <EarlyAccessAdmin
        base={appUrl()}
        rows={rows.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          propertyType: r.propertyType,
          website: r.website,
          source: r.source,
          createdAt: r.createdAt.toISOString(),
          invitedAt: r.invitedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
