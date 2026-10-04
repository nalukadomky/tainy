// Úprava fotek v prohlížeči před nahráním (galerie i úvodní fotka webu).

const MAX_SIDE = 2400;

/** Zmenší fotku v prohlížeči — z mobilu se pak nahrává zlomek dat. */
export async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Nahraje fotku webu do úložiště a vrátí její veřejnou adresu. */
export async function uploadSitePhoto(slug: string, file: File): Promise<string> {
  const body = new FormData();
  body.append("file", await shrink(file), file.name.replace(/\.\w+$/, ".jpg"));
  const res = await fetch(`/api/sites/${slug}/photos`, { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Nahrání selhalo.");
  return data.src as string;
}
