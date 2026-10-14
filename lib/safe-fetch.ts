import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Bezpečné stažení cizí adresy (kalendáře z portálů, import webu). Server se
// nesmí nechat poslat na vlastní síť: kontrolujeme adresu, DNS i každé
// přesměrování a velikost hlídáme už při stahování.

/** Privátní, místní a speciální adresy — server se na ně nesmí nechat poslat. */
export function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v6 = ip.toLowerCase();
    if (v6 === "::1" || v6 === "::") return true;
    if (v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")) return true;
    const mapped = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/** Ve vývoji jde testovat s adresami na localhostu. */
export const allowLocal = () => process.env.NODE_ENV === "development";

const isLocalHost = (host: string) => ["localhost", "127.0.0.1"].includes(host);

export type SafeFetchCode = "invalid" | "protocol" | "blocked" | "dns" | "status" | "too-big" | "redirects";

export class SafeFetchError extends Error {
  constructor(
    public code: SafeFetchCode,
    public status = 0,
  ) {
    super(code);
    this.name = "SafeFetchError";
  }
}

/** Co je na adrese špatně (kód), nebo null. Bez DNS — jen tvar adresy. */
export function urlProblem(raw: string, allowHttp: boolean): SafeFetchCode | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid";
  }
  const local = allowLocal() && isLocalHost(url.hostname);
  const httpOk = allowHttp || local;
  if (url.protocol !== "https:" && !(httpOk && url.protocol === "http:")) return "protocol";
  if (url.username || url.password) return "blocked";
  if (!local && (url.hostname === "localhost" || (isIP(url.hostname) && isPrivateIp(url.hostname)))) return "blocked";
  return null;
}

export type SafeFetchResult = { bytes: Uint8Array; contentType: string; url: string };

export async function safeFetch(
  raw: string,
  opts: { timeoutMs: number; maxBytes: number; accept?: string; userAgent?: string; allowHttp?: boolean },
): Promise<SafeFetchResult> {
  let url = raw;
  const deadline = AbortSignal.timeout(opts.timeoutMs);
  for (let hop = 0; hop < 5; hop++) {
    const problem = urlProblem(url, !!opts.allowHttp);
    if (problem) throw new SafeFetchError(problem);
    const { hostname } = new URL(url);
    const local = allowLocal() && isLocalHost(hostname);
    if (!local && !isIP(hostname)) {
      const addrs = await lookup(hostname, { all: true }).catch(() => []);
      if (!addrs.length) throw new SafeFetchError("dns");
      if (addrs.some((a) => isPrivateIp(a.address))) throw new SafeFetchError("blocked");
    }
    const res = await fetch(url, {
      redirect: "manual",
      signal: deadline,
      headers: { Accept: opts.accept ?? "*/*", "User-Agent": opts.userAgent ?? "tainy.cz" },
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    if (!res.ok) throw new SafeFetchError("status", res.status);
    if (Number(res.headers.get("content-length") ?? 0) > opts.maxBytes) throw new SafeFetchError("too-big");
    // Velikost hlídáme během stahování, ne až po přečtení celého těla
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > opts.maxBytes) {
          await reader.cancel().catch(() => {});
          throw new SafeFetchError("too-big");
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.byteLength;
    }
    return { bytes, contentType: (res.headers.get("content-type") ?? "").toLowerCase(), url };
  }
  throw new SafeFetchError("redirects");
}

export const decodeText = (bytes: Uint8Array, contentType = "") => {
  const charset = contentType.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase();
  try {
    return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
};
