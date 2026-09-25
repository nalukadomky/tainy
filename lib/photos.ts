// Fotky nemovitosti se ukládají do jednoho textového pole — jedna fotka na řádek,
// ve tvaru `adresa|popisek`. Popisek je nepovinný a slouží jako alt text.
// Stejný přístup jako u vybavení: majitel to zvládne upravit i ručně.

export type Photo = { src: string; alt: string };

export function parsePhotos(raw: string, siteName: string): Photo[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [src, caption] = line.split("|").map((p) => p.trim());
      return { src, alt: caption || `${siteName} — fotka ${i + 1}` };
    })
    .filter((p) => p.src);
}

export function serializePhotos(photos: Photo[]): string {
  return photos.map((p) => (p.alt ? `${p.src}|${p.alt}` : p.src)).join("\n");
}

/** Jako parsePhotos, ale popisek nechá prázdný, pokud ho majitel nezadal —
 *  pro úpravy v administraci, aby se výchozí text neuložil jako popisek. */
export function parsePhotoLines(raw: string): Photo[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [src, caption] = line.split("|").map((p) => p.trim());
      return { src, alt: caption ?? "" };
    })
    .filter((p) => p.src);
}
