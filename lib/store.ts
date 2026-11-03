import { config } from "./config.js";
import type { Alert, NewsItem } from "./types.js";

/** Persistence for the war room. Lanes write state slices; alerts and news are append-only. */
export interface Store {
  readonly kind: "memory" | "supabase";
  get(keys: string[]): Promise<Record<string, any>>;
  set(entries: Record<string, unknown>): Promise<void>;
  addAlerts(alerts: Alert[]): Promise<void>;
  addNews(items: (NewsItem & { titleKey: string })[]): Promise<void>;
  recentAlerts(limit: number): Promise<Alert[]>;
  recentNews(limit: number): Promise<NewsItem[]>;
  /** ids and normalized titles of the newest news items, for de-duplication */
  newsKeys(limit: number): Promise<string[]>;
  claim(lane: string, holder: string, seconds: number): Promise<boolean>;
  release(lane: string, holder: string): Promise<void>;
}

const ALERT_CAP = 2000;
const NEWS_CAP = 2000;

export class MemoryStore implements Store {
  readonly kind = "memory";
  private kv = new Map<string, unknown>();
  private alerts: Alert[] = [];
  private news: (NewsItem & { titleKey: string })[] = [];
  private leases = new Map<string, { holder: string; until: number }>();

  async get(keys: string[]) {
    const out: Record<string, any> = {};
    for (const k of keys) if (this.kv.has(k)) out[k] = structuredClone(this.kv.get(k));
    return out;
  }
  async set(entries: Record<string, unknown>) {
    for (const [k, v] of Object.entries(entries)) this.kv.set(k, structuredClone(v));
  }
  async addAlerts(alerts: Alert[]) {
    const ids = new Set(this.alerts.map((a) => a.id));
    this.alerts.unshift(...alerts.filter((a) => !ids.has(a.id)).sort((a, b) => b.at - a.at));
    this.alerts.length = Math.min(this.alerts.length, ALERT_CAP);
  }
  async addNews(items: (NewsItem & { titleKey: string })[]) {
    const ids = new Set(this.news.map((n) => n.id));
    this.news.unshift(...items.filter((n) => !ids.has(n.id)));
    this.news.length = Math.min(this.news.length, NEWS_CAP);
  }
  async recentAlerts(limit: number) {
    return this.alerts.slice(0, limit);
  }
  async recentNews(limit: number) {
    return this.news.slice(0, limit).map(({ titleKey, ...n }) => n);
  }
  async newsKeys(limit: number) {
    return this.news.slice(0, limit).flatMap((n) => [n.id, n.titleKey]);
  }
  async claim(lane: string, holder: string, seconds: number) {
    const cur = this.leases.get(lane);
    if (cur && cur.until > Date.now()) return false;
    this.leases.set(lane, { holder, until: Date.now() + seconds * 1000 });
    return true;
  }
  async release(lane: string, holder: string) {
    if (this.leases.get(lane)?.holder === holder) this.leases.delete(lane);
  }
}

/** Supabase via its REST API (PostgREST). Server-side only: uses the service-role key. */
export class SupabaseStore implements Store {
  readonly kind = "supabase";
  constructor(
    private url: string,
    private key: string,
  ) {}

  private headers(extra: Record<string, string> = {}) {
    const h: Record<string, string> = { apikey: this.key, "Content-Type": "application/json", ...extra };
    // Legacy service_role keys are JWTs; the newer sb_secret_ keys go in the apikey header only.
    if (this.key.startsWith("eyJ")) h.Authorization = `Bearer ${this.key}`;
    return h;
  }
  private async req(path: string, init: RequestInit & { prefer?: string } = {}) {
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: this.headers(init.prefer ? { Prefer: init.prefer } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`supabase ${init.method ?? "GET"} ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async get(keys: string[]) {
    if (!keys.length) return {};
    const list = keys.map((k) => `"${k.replace(/"/g, "")}"`).join(",");
    const rows: { key: string; value: unknown }[] = await this.req(`kv?select=key,value&key=in.(${encodeURIComponent(list)})`);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
  async set(entries: Record<string, unknown>) {
    const rows = Object.entries(entries).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    if (!rows.length) return;
    await this.req("kv", { method: "POST", body: JSON.stringify(rows), prefer: "resolution=merge-duplicates,return=minimal" });
  }
  async addAlerts(alerts: Alert[]) {
    if (!alerts.length) return;
    const rows = alerts.map((a) => ({ id: a.id, at: new Date(a.at).toISOString(), item: a }));
    await this.req("alerts", { method: "POST", body: JSON.stringify(rows), prefer: "resolution=ignore-duplicates,return=minimal" });
  }
  async addNews(items: (NewsItem & { titleKey: string })[]) {
    if (!items.length) return;
    const rows = items.map(({ titleKey, ...n }) => ({ id: n.id, title_key: titleKey, first_seen: new Date(n.firstSeen).toISOString(), item: n }));
    await this.req("news", { method: "POST", body: JSON.stringify(rows), prefer: "resolution=ignore-duplicates,return=minimal" });
  }
  async recentAlerts(limit: number) {
    const rows: { item: Alert }[] = await this.req(`alerts?select=item&order=at.desc&limit=${limit}`);
    return rows.map((r) => r.item);
  }
  async recentNews(limit: number) {
    const rows: { item: NewsItem }[] = await this.req(`news?select=item&order=first_seen.desc&limit=${limit}`);
    return rows.map((r) => r.item);
  }
  async newsKeys(limit: number) {
    const rows: { id: string; title_key: string }[] = await this.req(`news?select=id,title_key&order=first_seen.desc&limit=${limit}`);
    return rows.flatMap((r) => [r.id, r.title_key]);
  }
  async claim(lane: string, holder: string, seconds: number) {
    return Boolean(await this.req("rpc/claim_lease", { method: "POST", body: JSON.stringify({ p_lane: lane, p_holder: holder, p_seconds: seconds }) }));
  }
  async release(lane: string, holder: string) {
    await this.req("rpc/release_lease", { method: "POST", body: JSON.stringify({ p_lane: lane, p_holder: holder }) });
  }
}

let shared: Store | undefined;
/** Supabase when configured, otherwise an in-process store (local dev only; state is lost on restart). */
export function getStore(): Store {
  if (shared) return shared;
  shared = config.supabaseUrl && config.supabaseServiceKey ? new SupabaseStore(config.supabaseUrl.replace(/\/$/, ""), config.supabaseServiceKey) : new MemoryStore();
  return shared;
}
