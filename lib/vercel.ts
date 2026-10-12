// Malý klient Vercel REST API pro vlastní domény webů. Klíče doplní provozovatel
// do prostředí (DOMAINS_API_TOKEN, DOMAINS_PROJECT_ID, DOMAINS_TEAM_ID — bez
// předpony VERCEL_, tu si Vercel vyhrazuje pro své systémové proměnné);
// bez nich je připojování domén vypnuté a sekce Doména to řekne.

const API = "https://api.vercel.com";

export const vercelEnabled = () => !!process.env.DOMAINS_API_TOKEN && !!process.env.DOMAINS_PROJECT_ID;

// Doména se do adresy požadavku dostane jen ověřená a zakódovaná — nic jiného
// (lomítka, „..“, parametry) nesmí změnit, na který endpoint se volá.
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
function safeDomain(d: string): string {
  const v = d.trim().toLowerCase().replace(/\.$/, "");
  if (!DOMAIN_RE.test(v)) throw new Error("Neplatná doména");
  return encodeURIComponent(v);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const url = new URL(path, API);
  const team = process.env.DOMAINS_TEAM_ID;
  if (team) url.searchParams.set("teamId", team);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.DOMAINS_API_TOKEN}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

const project = () => encodeURIComponent(process.env.DOMAINS_PROJECT_ID!);

type VercelError = { error?: { code?: string; message?: string } };
export type ProjectDomain = VercelError & {
  name?: string;
  verified?: boolean;
  verification?: { type: string; domain: string; value: string; reason: string }[];
};
export type DomainConfig = VercelError & { misconfigured?: boolean; configuredBy?: string | null };

/** Přidá doménu k projektu a k ní „www“, které na ni přesměruje. */
export async function addDomain(domain: string) {
  safeDomain(domain);
  const main = await call<ProjectDomain>(`/v10/projects/${project()}/domains`, { method: "POST", body: JSON.stringify({ name: domain }) });
  // Doména už u projektu je (např. opakované připojení) — to nevadí
  if (!main.ok && main.data.error?.code !== "domain_already_in_use_by_project" && main.status !== 409) return main;
  await call(`/v10/projects/${project()}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: `www.${domain}`, redirect: domain, redirectStatusCode: 308 }),
  });
  return main;
}

export async function removeDomain(domain: string) {
  const d = safeDomain(domain);
  await call(`/v9/projects/${project()}/domains/www.${d}`, { method: "DELETE" });
  return call(`/v9/projects/${project()}/domains/${d}`, { method: "DELETE" });
}

export const projectDomain = (domain: string) => call<ProjectDomain>(`/v9/projects/${project()}/domains/${safeDomain(domain)}`);
export const domainConfig = (domain: string) => call<DomainConfig>(`/v6/domains/${safeDomain(domain)}/config`);
export const verifyDomain = (domain: string) =>
  call<ProjectDomain>(`/v9/projects/${project()}/domains/${safeDomain(domain)}/verify`, { method: "POST" });
