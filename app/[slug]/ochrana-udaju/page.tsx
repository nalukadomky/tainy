import { LegalDocPage, legalDocMetadata } from "@/components/LegalDocPage";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  return legalDocMetadata((await params).slug, "privacy");
}

export default async function Page({ params }: Props) {
  return <LegalDocPage slug={(await params).slug} kind="privacy" />;
}
