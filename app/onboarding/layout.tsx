import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { earlyAccess } from "@/lib/early-access";

// Dokud není tainy veřejné, průvodce založením webu je jen pro přihlášené
// (přidání další nemovitosti). Nepřihlášené pošle na žádost o přístup.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  if (earlyAccess() && !(await getUser())) redirect("/early-access?z=onboarding");
  return children;
}
