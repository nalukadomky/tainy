import { Wordmark } from "@/components/Logo";

// Doména míří na tainy, ale žádný web ji (zatím) nemá připojenou.
export const metadata = { title: "Doména zatím není připojená", robots: { index: false } };

export default function DomainNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Wordmark className="text-xl" />
      <h1 className="mt-8 font-display text-2xl font-semibold">Tahle doména zatím není připojená</h1>
      <p className="mt-2 text-soft">
        Web na ní teprve vzniká. Pokud je tvoje, připoj ji v administraci tainy v Nastavení → Doména.
      </p>
    </main>
  );
}
