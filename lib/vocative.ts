// Oslovení v 5. pádě pro česká křestní jména („Díky, Radku!").
// Pravidla pokrývají běžná česká jména; neznámé a cizí tvary se raději
// nechají beze změny, než aby vzniklo nesmyslné oslovení.

// Ženská jména končící souhláskou — v 5. pádě se nemění.
const FEMALE_CONSONANT = new Set([
  "agnes", "annabel", "beatrix", "carmen", "dagmar", "doris", "elizabet", "ester", "ingrid",
  "iris", "isabel", "karin", "kim", "mercedes", "miriam", "mirjam", "nikol", "rut", "sarah",
]);

// Výjimky, které pravidla nevystihnou.
const EXCEPTIONS: Record<string, string> = {
  ota: "Oto",
  kristián: "Kristiáne",
  sebastián: "Sebastiáne",
};

function keepCase(original: string, result: string): string {
  return original === original.toUpperCase() && original.length > 1 ? result.toUpperCase() : result;
}

/** 5. pád jednoho křestního jména. */
export function vocative(name: string): string {
  const word = name.trim();
  if (word.length < 2 || !/^\p{L}+$/u.test(word)) return word;
  const lower = word.toLowerCase();
  const stem = (n: number) => word.slice(0, word.length - n);

  if (EXCEPTIONS[lower]) return keepCase(word, EXCEPTIONS[lower]);
  if (FEMALE_CONSONANT.has(lower)) return word;

  // Samohláskové konce: -a → -o (Jana → Jano, Honza → Honzo), ostatní beze změny
  // (Lucie, Jiří, Hugo, Noemi).
  if (lower.endsWith("a")) return stem(1) + "o";
  if (/[eěiíyýoóuúů]$/.test(lower)) return word;

  // -ek s pohyblivým e: Radek → Radku, Zdeněk → Zdeňku, Luděk → Luďku
  if (lower.endsWith("ěk")) {
    const before = lower.at(-3);
    const soft: Record<string, string> = { d: "ď", t: "ť", n: "ň" };
    if (before && soft[before]) return stem(3) + soft[before] + "ku";
    return stem(2) + "ku";
  }
  if (lower.endsWith("ek") && lower.length > 3) return stem(2) + "ku";

  // Pavel → Pavle, Karel → Karle; Daniel, Michael, Samuel → Danieli…
  if (/[vr]el$/.test(lower)) return stem(2) + "le";
  if (/[aiu]el$/.test(lower)) return word + "i";

  // Petr → Petře, Alexandr → Alexandře; po samohlásce Viktor → Viktore
  if (/[^aeiouyáéíóúůěý]r$/.test(lower)) return stem(1) + "ře";

  // Tvrdé k, h, g, ch → -u: Dominik → Dominiku, Vojtěch → Vojtěchu
  if (/(k|h|g)$/.test(lower)) return word + "u";

  // Měkké a obojetné souhlásky → -i: Tomáš → Tomáši, Matěj → Matěji, Marcel → Marceli
  if (/(š|ž|č|ř|c|j|ď|ť|ň|s|z|x)$/.test(lower)) return word + "i";
  if (lower.endsWith("cel")) return word + "i";

  // Ostatní → -e: Jan → Jane, Martin → Martine, Jakub → Jakube, Michal → Michale
  return word + "e";
}

/** Oslovení z celého jména hosta — bere první slovo. Prázdné jméno vrátí `fallback`. */
export function greetingName(fullName: string, fallback = "hoste"): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first ? vocative(first) : fallback;
}
