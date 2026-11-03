import { config } from "./config.js";
import type { Store } from "./store.js";
import type {
  Alert,
  CampaignMoneyRow,
  Choice,
  Feed,
  Health,
  Incumbent,
  Market,
  MarketHistory,
  MarketOutcome,
  MonitorInfo,
  National,
  NatRace,
  NewsItem,
  Office,
  OutsideMoneyRow,
  PollCloses,
  Race,
  Source,
  Tally,
  Telemetry,
} from "./types.js";

// ---------- Static configuration ----------
export const CLARITY_STATES: Record<string, string> = {
  WV: "West Virginia",
  KY: "Kentucky",
  GA: "Georgia",
  SC: "South Carolina",
  AR: "Arkansas",
  KS: "Kansas",
  IA: "Iowa",
  CO: "Colorado",
  NC: "North Carolina",
  AZ: "Arizona",
};

/** Latest scheduled poll close per state in Eastern time, used until the 270toWin scrape lands. */
const FALLBACK_CLOSES_ET: Record<string, string> = {
  GA: "19:00", IN: "19:00", KY: "19:00", SC: "19:00", VA: "19:00", VT: "19:00",
  NC: "19:30", OH: "19:30", WV: "19:30",
  AL: "20:00", CT: "20:00", DE: "20:00", FL: "20:00", IL: "20:00", ME: "20:00", MD: "20:00", MA: "20:00", MS: "20:00", MO: "20:00",
  NH: "20:00", NJ: "20:00", OK: "20:00", PA: "20:00", RI: "20:00", TN: "20:00", DC: "20:00",
  AR: "20:30",
  AZ: "21:00", CO: "21:00", IA: "21:00", KS: "21:00", LA: "21:00", MI: "21:00", MN: "21:00", NE: "21:00", NM: "21:00", NY: "21:00",
  ND: "21:00", SD: "21:00", TX: "21:00", WI: "21:00", WY: "21:00",
  MT: "22:00", NV: "22:00", UT: "22:00",
  CA: "23:00", ID: "23:00", OR: "23:00", WA: "23:00",
  HI: "24:00",
  AK: "25:00",
};

/** States with a 2026 Senate race, used until the NBC board has been scraped. */
export const FALLBACK_SENATE_STATES = "AL AK AR CO DE FL GA ID IL IA KS KY LA ME MA MI MN MS MT NE NH NJ NM NC OH OK OR RI SC SD TN TX VA WV WY".split(" ");

const NEWS_QUERIES = [
  "2026 midterm election results",
  "Senate race called projected winner",
  "House race called midterms",
  "control of the House midterms",
  "control of the Senate midterms",
  "polls close election night",
  "concedes race midterm",
  "recount midterm election",
  "voting problems polling place election day",
  "exit polls midterms 2026",
  "governor race projected winner 2026",
  "Iowa Senate race Hinson Turek",
  "Colorado election results 2026",
  "ballot measure results 2026",
];

const SEED_SOURCES: { url: string; name: string; kind: "live" | "results" }[] = [
  { url: "https://apnews.com/live/midterm-election-2026", name: "AP", kind: "live" },
  { url: "https://www.cbsnews.com/live-updates/election-day-2026-midterms/", name: "CBS", kind: "live" },
  { url: "https://www.bbc.com/news/live/cj1dw0ydn595t", name: "BBC", kind: "live" },
  { url: "https://www.cnbc.com/2026/11/03/midterm-elections-2026-live-updates.html", name: "CNBC", kind: "live" },
  { url: "https://www.pbs.org/newshour/politics/live-updates-midterm-voters-go-to-the-polls-on-election-day", name: "PBS", kind: "live" },
  { url: "https://abc7ny.com/live-updates/midterm-elections-2026-live-updates-election-results-key-races-us/20001292/", name: "ABC7", kind: "live" },
  { url: "https://nypost.com/2026/11/03/us-news/midterm-election-day-2026-live-results-from-senate-house-governor-races/", name: "NY Post", kind: "live" },
  { url: "https://www.nbcwashington.com/elections/election-day-2026-midterms-congress-results-live-updates/4175504/", name: "NBC4", kind: "live" },
  { url: "https://virginiamercury.com/2026/11/03/election-day-2026-live-updates/", name: "VA Mercury", kind: "live" },
];
const MAX_SOURCES = 16;

const MARKETS: { slug: string; role: Market["role"]; title?: string; state?: string; office?: Office }[] = [
  { slug: "balance-of-power-2026-midterms", role: "hero" },
  { slug: "which-party-will-win-the-house-in-2026", role: "control", title: "House control" },
  { slug: "which-party-will-win-the-senate-in-2026", role: "control", title: "Senate control" },
  { slug: "iowa-senate-election-winner", role: "race", title: "Iowa Senate", state: "IA", office: "senate" },
  { slug: "iowa-governor-winner-2026", role: "race", title: "Iowa Governor", state: "IA", office: "governor" },
  { slug: "colorado-senate-election-winner", role: "race", title: "Colorado Senate", state: "CO", office: "senate" },
  { slug: "colorado-governor-winner-2026", role: "race", title: "Colorado Governor", state: "CO", office: "governor" },
];
const MOVE_ALERT_PTS = 3;
const HISTORY_CAP = 960;

export const STATE_CODES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "Washington, D.C.": "DC",
};

// ---------- World state, split into slices owned by one lane each ----------
export type Lane = "results" | "news" | "money";
export const LANES: Lane[] = ["results", "news", "money"];

type ResultsMeta = { nextResultsPollAt: number; moveCooldown: Record<string, number>; historyAt: number };
type NewsMeta = {
  newsCursor: number;
  newsWarm: boolean;
  discoverWarm: boolean;
  nationalWarm: boolean;
  monitorsWarm: boolean;
  monitorsReady: boolean;
  monitorIds: Record<string, string>;
  processedChecks: string[];
  urlTitles: Record<string, string>;
};
type MoneyMeta = { outsideMoneyLoaded: boolean; updatedAt: number };

export type World = {
  startedAt: number;
  feeds: Record<string, Feed>;
  races: Record<string, Race>;
  markets: Record<string, Market>;
  marketHistory: MarketHistory;
  resultsMeta: ResultsMeta;
  sources: Record<string, Source>;
  monitors: MonitorInfo[];
  national: National;
  newsMeta: NewsMeta;
  campaignMoney: Record<string, CampaignMoneyRow[]>;
  outsideMoney: OutsideMoneyRow[];
  incumbents: Record<string, Incumbent[]>;
  pollCloses: PollCloses | null;
  moneyMeta: MoneyMeta;
};

export const OWNED: Record<Lane, (keyof World)[]> = {
  results: ["feeds", "races", "markets", "marketHistory", "resultsMeta"],
  news: ["sources", "monitors", "national", "newsMeta"],
  money: ["campaignMoney", "outsideMoney", "incumbents", "pollCloses", "moneyMeta"],
};
export const WORLD_KEYS = ["startedAt", ...OWNED.results, ...OWNED.news, ...OWNED.money] as (keyof World)[];

function defaults(): World {
  return {
    startedAt: Date.now(),
    feeds: {},
    races: {},
    markets: {},
    marketHistory: {},
    resultsMeta: { nextResultsPollAt: 0, moveCooldown: {}, historyAt: 0 },
    sources: {},
    monitors: [],
    national: { senate: [], control: null, senateAt: 0, houseAt: 0, source: "NBC News results page (scraped)" },
    newsMeta: {
      newsCursor: 0,
      newsWarm: false,
      discoverWarm: false,
      nationalWarm: false,
      monitorsWarm: false,
      monitorsReady: false,
      monitorIds: {},
      processedChecks: [],
      urlTitles: {},
    },
    campaignMoney: {},
    outsideMoney: [],
    incumbents: {},
    pollCloses: null,
    moneyMeta: { outsideMoneyLoaded: false, updatedAt: 0 },
  };
}

export async function loadWorld(store: Store, keys: string[] = WORLD_KEYS as string[]) {
  const raw = await store.get(keys);
  const base = defaults();
  const w = { ...base } as World;
  for (const k of keys as (keyof World)[]) {
    if (raw[k] === undefined) continue;
    const d = base[k];
    (w as any)[k] = d && typeof d === "object" && !Array.isArray(d) && raw[k] && typeof raw[k] === "object" && !Array.isArray(raw[k]) ? { ...d, ...raw[k] } : raw[k];
  }
  return { world: w, fresh: raw.startedAt === undefined };
}

function emptyTelemetry(): Telemetry {
  return { health: {}, callLog: [], credits: { alexandria: 0, search: 0, scrape: 0, monitor: 0 } };
}

/** Poll-close time (ISO UTC) for a state: the scraped table when present, else the fallback. */
export function closeFor(w: Pick<World, "pollCloses">, st: string) {
  return w.pollCloses?.states[st] ?? fallbackCloses()[st] ?? "";
}
let fallbackCache: Record<string, string> | undefined;
export function fallbackCloses() {
  if (fallbackCache) return fallbackCache;
  fallbackCache = Object.fromEntries(
    Object.entries(FALLBACK_CLOSES_ET).map(([st, hm]) => {
      const [h, m] = hm.split(":").map(Number);
      return [st, etToUtcIso(config.electionDate, h, m)];
    }),
  );
  return fallbackCache;
}
function tzOffsetMinutes(utcMs: number, timeZone: string) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}
/** Converts an Eastern wall-clock time on the election date (hours may exceed 23) to ISO UTC. */
function etToUtcIso(date: string, hours: number, minutes: number) {
  const [y, mo, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, hours, minutes);
  return new Date(guess - tzOffsetMinutes(guess, "America/New_York") * 60_000).toISOString();
}

// ---------- Per-tick context ----------
class Ctx {
  alerts: Alert[] = [];
  news: (NewsItem & { titleKey: string })[] = [];
  seenNews: Set<string>;
  constructor(
    readonly lane: Lane,
    readonly w: World,
    readonly tel: Telemetry,
    seen: string[],
  ) {
    this.seenNews = new Set(seen);
  }

  alert(a: Omit<Alert, "id" | "at">) {
    const full: Alert = { id: `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`, at: Date.now() + this.alerts.length, ...a };
    this.alerts.push(full);
    return full;
  }

  /** Adds items not seen before (by id or near-identical title). Returns the fresh ones. */
  ingestNews(items: Omit<NewsItem, "firstSeen">[]) {
    const fresh: NewsItem[] = [];
    for (const it of items) {
      if (!it.title) continue;
      const titleKey = normTitle(it.title);
      if (this.seenNews.has(it.id) || this.seenNews.has(titleKey)) continue;
      this.seenNews.add(it.id);
      this.seenNews.add(titleKey);
      const item = { ...it, firstSeen: Date.now() };
      fresh.push(item);
      this.news.push({ ...item, titleKey });
    }
    return fresh;
  }
}

// ---------- Firecrawl calls ----------
function recordCall(c: Ctx | null, provider: string, capability: string, ok: boolean, ms: number, credits: number, requestId: string, error?: string) {
  if (!c) return;
  const key = `${provider}/${capability}`;
  const prev = c.tel.health[key];
  const h: Health = prev ?? { key, provider, capability, ok, calls: 0, errors: 0, streak: 0, down: false, lastMs: 0, lastAt: 0 };
  h.calls++;
  if (!ok) h.errors++;
  h.streak = ok ? 0 : h.streak + 1;
  h.ok = ok;
  h.lastMs = Math.round(ms);
  h.lastAt = Date.now();
  h.lastError = ok ? undefined : error;
  c.tel.health[key] = h;
  c.tel.callLog.unshift({ at: Date.now(), provider, capability, ms: Math.round(ms), ok, credits, requestId, note: error });
  c.tel.callLog.length = Math.min(c.tel.callLog.length, 60);
  // Probe failures are per state and already shown on the feed list.
  if (capability === "elections/list_elections") return;
  if (!h.down && h.streak >= 3) {
    h.down = true;
    c.alert({ severity: "medium", kind: "FEED DOWN", title: `${provider} · ${capability} failing`, detail: error, source: provider });
  } else if (h.down && ok) {
    h.down = false;
    c.alert({ severity: "info", kind: "FEED RESTORED", title: `${provider} · ${capability} back online`, source: provider });
  }
}

function requireKey() {
  if (!config.firecrawlKey) throw new Error("FIRECRAWL_API_KEY is not set");
  return config.firecrawlKey;
}

class AlexandriaError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function alexandria<T = any>(c: Ctx | null, provider: string, capability: string, options: Record<string, unknown>): Promise<T> {
  const requestId = crypto.randomUUID();
  const t0 = performance.now();
  try {
    const res = await fetch(`${config.firecrawlApi}/v2/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json", "x-request-id": requestId },
      body: JSON.stringify({ alexandria: { provider, capability, options }, origin: config.origin }),
      signal: AbortSignal.timeout(60_000),
    });
    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body?.success) throw new AlexandriaError(body?.error ?? `HTTP ${res.status}`);
    const item = body.data?.alexandria?.[0];
    if (!item) throw new AlexandriaError("empty Alexandria response");
    if (item.error) throw new AlexandriaError(`${item.error.code}: ${item.error.message}`, item.error.code);
    const credits = Number(item.creditsCost ?? body.data?.creditsCost ?? 0);
    if (c) c.tel.credits.alexandria += credits;
    recordCall(c, provider, capability, true, performance.now() - t0, credits, requestId);
    return item.data as T;
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "timeout after 60s" : String(e?.message ?? e);
    recordCall(c, provider, capability, false, performance.now() - t0, 0, requestId, msg);
    throw e instanceof AlexandriaError ? e : new AlexandriaError(msg);
  }
}

type CreditBucket = "search" | "scrape" | "monitor";

async function firecrawl<T = any>(
  c: Ctx,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  capability: string,
  opts: { body?: unknown; bucket?: CreditBucket; credits?: (json: any) => number; timeoutMs?: number } = {},
): Promise<T> {
  const requestId = crypto.randomUUID();
  const t0 = performance.now();
  try {
    const res = await fetch(path.startsWith("http") ? path : `${config.firecrawlApi}${path}`, {
      method,
      headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json", "x-request-id": requestId },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || json?.success === false) throw new Error(json?.error ?? `HTTP ${res.status}`);
    const credits = opts.credits ? Number(opts.credits(json) || 0) : Number(json?.creditsUsed ?? json?.data?.metadata?.creditsUsed ?? 0);
    if (opts.bucket) c.tel.credits[opts.bucket] += credits;
    recordCall(c, "firecrawl", capability, true, performance.now() - t0, credits, requestId);
    return json as T;
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "timeout" : String(e?.message ?? e);
    recordCall(c, "firecrawl", capability, false, performance.now() - t0, 0, requestId, msg);
    throw new Error(msg);
  }
}

async function firecrawlNewsSearch(c: Ctx, query: string) {
  const body = await firecrawl<any>(c, "POST", "/v2/search", "search/news", {
    body: { query, sources: ["news"], tbs: "qdr:h", limit: 10, origin: config.origin },
    bucket: "search",
    timeoutMs: 45_000,
  });
  return (body.data?.news ?? []) as { title: string; url: string; snippet?: string; date?: string; imageUrl?: string }[];
}

async function scrapeJson<T = any>(c: Ctx, url: string, capability: string, prompt: string, schema: unknown): Promise<T> {
  const body = await firecrawl<any>(c, "POST", "/v2/scrape", capability, {
    body: { url, maxAge: 0, onlyMainContent: true, formats: [{ type: "json", prompt, schema }], origin: config.origin },
    bucket: "scrape",
  });
  return body.data?.json as T;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = await fn(items[idx]);
        } catch {
          out[idx] = undefined;
        }
      }
    }),
  );
  return out;
}

// ---------- Results (Clarity ENR) ----------
function ensureFeeds(w: World) {
  for (const [code, name] of Object.entries(CLARITY_STATES)) {
    w.feeds[code] ??= { state: code, name, status: "probing", nextProbeAt: 0, pollsCloseUtc: "", races: 0 };
    w.feeds[code].pollsCloseUtc = closeFor(w, code);
  }
}

async function probeFeeds(c: Ctx) {
  const now = Date.now();
  const due = Object.values(c.w.feeds).filter((f) => f.status !== "live" && f.nextProbeAt <= now);
  await mapLimit(due, 4, async (feed) => {
    try {
      const data = await alexandria<any>(c, "results-enr-clarityelections-com", "elections/list_elections", { state: feed.state });
      const elections: any[] = data?.elections ?? [];
      const match =
        elections.find((e) => e.date === config.electionDate && /general/i.test(e.name)) ?? elections.find((e) => e.date === config.electionDate);
      if (match) {
        feed.status = "live";
        feed.electionId = match.election_id;
        feed.electionName = match.name;
        feed.resultsUrl = match.results_url;
        feed.error = undefined;
        c.alert({
          severity: "system",
          kind: "FEED ONLINE",
          title: `${feed.name}: ${match.name} results feed connected`,
          detail: `Clarity ENR election ${match.election_id}`,
          state: feed.state,
          source: "results-enr-clarityelections-com",
          url: match.results_url,
        });
      } else {
        feed.status = "no-election";
        feed.error = elections.length ? `latest listed: ${elections[0].name}` : "no elections listed yet";
        feed.nextProbeAt = Date.now() + 10 * 60_000;
      }
    } catch (e: any) {
      feed.status = "error";
      feed.error = e.message;
      feed.nextProbeAt = Date.now() + 2 * 60_000;
    }
  });
}

function classify(category: string, name: string): Office | null {
  const cat = category.toLowerCase();
  const n = name.toLowerCase();
  if (/state (house|senate)|legislat|local|county|municipal|city|school|judicial|district/.test(cat)) return null;
  if (/united states senator|u\.?s\.? senat/.test(n)) return "senate";
  if (/federal/.test(cat) && /representative|congress/.test(n)) return "house";
  if (/united states representative|representative to the .* united states congress/.test(n)) return "house";
  if (/governor/.test(n)) return "governor";
  if (/ballot question|amendment|measure|proposition|referend/.test(cat) || /constitutional amendment|public measure|proposition/.test(n)) return "measure";
  if (/state offices|statewide/.test(cat) || /secretary of state|attorney general|treasurer|auditor/.test(n)) return "statewide";
  return null;
}

function raceLabel(office: Office, st: string, name: string) {
  if (office === "senate") return `${st} · US Senate`;
  if (office === "house") {
    const d = name.match(/district\s*(\d+)/i)?.[1];
    return d ? `${st}-${d.padStart(2, "0")} · US House` : `${st} · US House (at-large)`;
  }
  if (office === "governor") return `${st} · Governor`;
  return `${st} · ${name}`;
}

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

function diffRace(c: Ctx, prev: Race | undefined, next: Race, feed: Feed) {
  const common = { raceId: next.id, state: next.state, source: "results-enr-clarityelections-com", url: next.resultsUrl };
  if (!prev) return;
  if (prev.precinctsReporting === 0 && next.precinctsReporting > 0) {
    c.alert({ ...common, severity: "medium", kind: "FIRST RETURNS", title: `${next.label}: first precincts reporting`, detail: `${next.precinctsReporting}/${next.precinctsTotal} precincts in` });
  }
  if (prev.totalVotes === 0 && next.totalVotes > 0 && next.leader) {
    c.alert({ ...common, severity: "high", kind: "FIRST VOTES", title: `${next.label}: first votes counted`, detail: `${next.leader} leads with ${next.choices[0].percent.toFixed(1)}%` });
  }
  if (prev.leader && next.leader && prev.leader !== next.leader && prev.totalVotes > 0) {
    c.alert({ ...common, severity: "high", kind: "LEAD CHANGE", title: `${next.label}: ${next.leader} takes the lead`, detail: `${next.leader} now ahead of ${prev.leader} by ${next.marginPct?.toFixed(2)} pts · ${pct(next.precinctsReporting, next.precinctsTotal).toFixed(0)}% precincts in` });
  }
  const winner = next.choices.find((x) => x.winner);
  const prevWinner = prev.choices.find((x) => x.winner);
  if (winner && (!prevWinner || prevWinner.name !== winner.name)) {
    c.alert({ ...common, severity: "critical", kind: "WINNER FLAGGED", title: `${next.label}: ${winner.name}${winner.party ? ` (${winner.party})` : ""} marked winner`, detail: `Flag set by the ${feed.name} election office on Clarity ENR (unofficial until certified)` });
  }
  if (prev.precinctsReporting < prev.precinctsTotal && next.precinctsTotal > 0 && next.precinctsReporting >= next.precinctsTotal) {
    c.alert({ ...common, severity: "medium", kind: "FULLY REPORTED", title: `${next.label}: all ${next.precinctsTotal} precincts reporting`, detail: next.leader ? `${next.leader} +${next.marginPct?.toFixed(2)} pts` : undefined });
  }
  const reporting = pct(next.precinctsReporting, next.precinctsTotal);
  const wasTight = prev.marginPct !== null && prev.marginPct < 2 && pct(prev.precinctsReporting, prev.precinctsTotal) >= 50;
  if (next.marginPct !== null && next.marginPct < 2 && reporting >= 50 && !wasTight && next.totalVotes > 0) {
    c.alert({ ...common, severity: "high", kind: "TIGHT RACE", title: `${next.label}: margin under 2 points`, detail: `${next.choices[0]?.name} ${next.choices[0]?.percent.toFixed(1)}% vs ${next.choices[1]?.name} ${next.choices[1]?.percent.toFixed(1)}% · ${reporting.toFixed(0)}% in` });
  }
}

async function pollFeed(c: Ctx, feed: Feed) {
  const data = await alexandria<any>(c, "results-enr-clarityelections-com", "elections/get_results", { state: feed.state, election_id: feed.electionId });
  feed.lastPollAt = Date.now();
  feed.error = undefined;
  const version = String(data?.election?.version ?? "");
  const versionChanged = feed.version !== undefined && feed.version !== version;
  feed.lastModified = data?.last_modified ?? feed.lastModified;
  let moved = 0;
  let count = 0;
  for (const ct of data?.contests ?? []) {
    const office = classify(String(ct.category ?? ""), String(ct.name ?? ""));
    if (!office) continue;
    count++;
    const choices: Choice[] = (ct.choices ?? [])
      .map((ch: any) => ({ name: ch.name, party: ch.party ?? null, votes: Number(ch.votes ?? 0), percent: Number(ch.percent ?? 0), winner: !!ch.winner }))
      .sort((a: Choice, b: Choice) => b.votes - a.votes);
    const total = Number(ct.total_votes ?? choices.reduce((s, x) => s + x.votes, 0));
    const id = `${feed.state}:${feed.electionId}:${ct.contest_id}`;
    const prev = c.w.races[id];
    const reporting = Number(ct.precincts_reporting ?? 0);
    const race: Race = {
      id,
      state: feed.state,
      electionId: feed.electionId!,
      contestId: String(ct.contest_id),
      office,
      label: raceLabel(office, feed.state, ct.name),
      name: ct.name,
      category: ct.category,
      precinctsReporting: reporting,
      precinctsTotal: Number(ct.precincts_total ?? 0),
      totalVotes: total,
      choices,
      leader: total > 0 ? choices[0]?.name ?? null : null,
      marginPct: total > 0 && choices.length > 1 ? ((choices[0].votes - choices[1].votes) / total) * 100 : null,
      updatedAt: prev && prev.totalVotes === total && prev.precinctsReporting === reporting ? prev.updatedAt : Date.now(),
      version,
      resultsUrl: feed.resultsUrl ?? "",
    };
    if (prev && race.totalVotes > 0 && (prev.totalVotes !== race.totalVotes || prev.precinctsReporting !== race.precinctsReporting)) moved++;
    diffRace(c, prev, race, feed);
    c.w.races[id] = race;
  }
  feed.races = count;
  if (versionChanged) {
    feed.lastChangeAt = Date.now();
    c.alert({
      severity: "info",
      kind: "NEW UPLOAD",
      title: `${feed.name} published upload v${version}`,
      detail: moved ? `${moved} tracked race${moved === 1 ? "" : "s"} moved` : "No movement in tracked races",
      state: feed.state,
      source: "results-enr-clarityelections-com",
      url: feed.resultsUrl,
    });
  }
  feed.version = version;
}

async function pollResults(c: Ctx) {
  await probeFeeds(c);
  const live = Object.values(c.w.feeds).filter((f) => f.status === "live");
  await mapLimit(live, 4, async (feed) => {
    try {
      await pollFeed(c, feed);
    } catch (e: any) {
      feed.error = e.message;
    }
  });
  c.w.resultsMeta.nextResultsPollAt = Date.now() + config.intervals.results;
}

// ---------- Money (FEC) ----------
function lastNameTokens(name: string) {
  return name
    .replace(/\b(jr|sr|ii|iii|iv|dr|mr|mrs|ms)\.?\b/gi, "")
    .split(/[\s,]+/)
    .filter((t) => t.length > 2)
    .map((t) => t.toUpperCase().replace(/[^A-Z-]/g, ""));
}

function matchFec(choice: string, records: any[], district?: string) {
  const tokens = lastNameTokens(choice);
  const last = tokens[tokens.length - 1];
  if (!last) return undefined;
  return records.find((r) => {
    if (district && r.district !== district) return false;
    const fecName = String(r.name ?? "").toUpperCase();
    return fecName.split(/[\s,]+/).includes(last) || fecName.includes(last.replace(/-/g, ""));
  });
}

async function pollCampaignMoney(c: Ctx, races: Record<string, Race>) {
  const list = Object.values(races).filter((r) => r.office === "senate" || r.office === "house");
  const byStateOffice = new Map<string, Race[]>();
  for (const r of list) {
    const key = `${r.state}:${r.office === "senate" ? "S" : "H"}`;
    byStateOffice.set(key, [...(byStateOffice.get(key) ?? []), r]);
  }
  for (const [key, group] of byStateOffice) {
    const [st, office] = key.split(":");
    let records: any[] = [];
    try {
      for (let page = 1; page <= 3; page++) {
        const data = await alexandria<any>(c, "fec-gov", "records/candidates", { state: st, office, election_year: 2026, has_raised_funds: true, per_page: 100, page });
        records = records.concat(data?.records ?? []);
        if (!data?.next_page) break;
      }
    } catch {
      continue;
    }
    for (const race of group) {
      const district = race.office === "house" ? (race.name.match(/district\s*(\d+)/i)?.[1] ?? "00").padStart(2, "0") : undefined;
      const picks = race.choices
        .filter((ch) => !/write-?in/i.test(ch.name))
        .map((ch) => ({ choice: ch, rec: matchFec(ch.name, records, district) }))
        .filter((x) => x.rec);
      const rows = await mapLimit(picks, 3, async ({ choice, rec }) => {
        const committee =
          (rec.principal_committees ?? []).find((pc: any) => pc.committee_type === office && (pc.cycles ?? []).includes(2026)) ?? rec.principal_committees?.[0];
        if (!committee?.committee_id) return undefined;
        const totals = await alexandria<any>(c, "fec-gov", "records/committee_totals", { committee_id: committee.committee_id, cycle: 2026 });
        const t = totals?.records?.[0];
        if (!t) return undefined;
        return {
          candidate: choice.name,
          party: choice.party,
          committeeId: committee.committee_id,
          committeeName: t.committee_name,
          receipts: Number(t.receipts ?? 0),
          disbursements: Number(t.disbursements ?? 0),
          cashOnHand: Number(t.last_cash_on_hand_end_period ?? 0),
          coverageEnd: t.coverage_end_date,
          fecUrl: rec.fec_url,
        } satisfies CampaignMoneyRow;
      });
      const clean = rows.filter(Boolean) as CampaignMoneyRow[];
      if (clean.length) c.w.campaignMoney[race.id] = clean.sort((a, b) => b.receipts - a.receipts);
    }
  }
  c.w.moneyMeta.updatedAt = Date.now();
}

async function pollOutsideMoney(c: Ctx, liveStates: Set<string>) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const data = await alexandria<any>(c, "fec-gov", "records/independent_expenditures", {
      cycle: 2026,
      min_amount: 50_000,
      most_recent: true,
      per_page: 40,
      sort: "-expenditure_date",
    });
    const rows: OutsideMoneyRow[] = (data?.records ?? [])
      .filter((r: any) => r.expenditure_date && String(r.expenditure_date).slice(0, 10) <= today)
      .map((r: any) => ({
        id: String(r.sub_id ?? `${r.committee_id}-${r.expenditure_date}-${r.expenditure_amount}`),
        spender: r.committee_name ?? r.committee_id,
        candidate: r.candidate_name ?? "Unknown candidate",
        state: r.candidate_office_state ?? "",
        office: r.candidate_office ?? "",
        party: r.candidate_party ?? "",
        supportOppose: r.support_oppose_indicator === "S" ? "support" : r.support_oppose_indicator === "O" ? "oppose" : "",
        amount: Number(r.expenditure_amount ?? 0),
        date: String(r.expenditure_date).slice(0, 10),
        purpose: r.expenditure_description ?? undefined,
        pdfUrl: r.pdf_url ?? undefined,
      }));
    const known = new Set(c.w.outsideMoney.map((r) => r.id));
    if (c.w.moneyMeta.outsideMoneyLoaded) {
      for (const r of rows.filter((x) => !known.has(x.id)).slice(0, 5)) {
        c.alert({
          severity: liveStates.has(r.state) ? "high" : "medium",
          kind: "OUTSIDE MONEY",
          title: `${r.spender} ${r.supportOppose === "oppose" ? "against" : "for"} ${r.candidate} (${r.state}-${r.office})`,
          detail: `$${Math.round(r.amount).toLocaleString("en-US")} · ${r.purpose ?? "independent expenditure"}`,
          state: r.state,
          source: "fec-gov",
          url: r.pdfUrl,
        });
      }
    }
    c.w.moneyMeta.outsideMoneyLoaded = true;
    const merged = new Map<string, OutsideMoneyRow>();
    for (const r of [...rows, ...c.w.outsideMoney]) if (!merged.has(r.id)) merged.set(r.id, r);
    c.w.outsideMoney = [...merged.values()].sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount).slice(0, 60);
    c.w.moneyMeta.updatedAt = Date.now();
  } catch {
    // Health panel shows the failure.
  }
}

// ---------- Incumbents (House Clerk) ----------
async function pollIncumbents(c: Ctx, liveStates: Set<string>) {
  for (const st of liveStates) {
    try {
      const roster = await alexandria<any>(c, "clerk-house-gov", "legislative-votes/members", { state: st });
      const members: any[] = roster?.members ?? [];
      const rows = await mapLimit(members, 3, async (m) => {
        const mv = await alexandria<any>(c, "clerk-house-gov", "legislative-votes/member_votes", { bioguide_id: m.bioguide_id });
        return {
          name: m.name,
          party: m.party,
          district: m.state_district ?? `${st}${m.district_number}`,
          bioguideId: m.bioguide_id,
          url: m.member_url,
          votes: (mv?.votes ?? []).slice(0, 8).map((v: any) => ({ date: v.date, bill: v.bill_number ?? "", title: v.title ?? "", vote: v.vote, result: v.result, url: v.vote_url })),
        } satisfies Incumbent;
      });
      c.w.incumbents[st] = rows.filter(Boolean) as Incumbent[];
    } catch {
      // Health panel shows the failure.
    }
  }
  c.w.moneyMeta.updatedAt = Date.now();
}

// ---------- Poll-close times (270toWin, scraped) ----------
const POLL_CLOSES_URL = "https://www.270towin.com/poll-closing-times/";

export function parsePollCloses(md: string, electionDate: string) {
  const parts = md.split(/!\[(\d{1,2}):(\d{2}) ([AP]M)\]\([^)]*closing[^)]*\)/);
  const states: Record<string, string> = {};
  for (let i = 1; i + 3 < parts.length + 1; i += 4) {
    const [hh, mm, ampm, body] = [parts[i], parts[i + 1], parts[i + 2], parts[i + 3] ?? ""];
    let h = Number(hh) % 12;
    if (ampm === "PM") h += 12;
    // The table runs from 6 PM into the early hours of the next day.
    if (h < 12) h += 24;
    const iso = etToUtcIso(electionDate, h, Number(mm));
    for (const line of body.split("\n")) {
      const name = line.replace(/\s*\([A-Z]\)\s*$/, "").replace(/\d+$/, "").trim();
      const code = STATE_CODES[name];
      // Later blocks win: states spanning two time zones are listed twice.
      if (code) states[code] = iso;
    }
  }
  return states;
}

async function pollPollCloses(c: Ctx) {
  const body = await firecrawl<any>(c, "POST", "/v2/scrape", "scrape/poll-closes", {
    body: { url: POLL_CLOSES_URL, maxAge: 6 * 60 * 60_000, onlyMainContent: true, formats: ["markdown"], origin: config.origin },
    bucket: "scrape",
  });
  const states = parsePollCloses(String(body.data?.markdown ?? ""), config.electionDate);
  if (Object.keys(states).length < 40) throw new Error(`poll-close table parsed only ${Object.keys(states).length} states`);
  c.w.pollCloses = { at: Date.now(), source: POLL_CLOSES_URL, states };
}

// ---------- News: one store fed by search, live-blog scrapes and monitors ----------
const BREAKING =
  /\b(called|calls|projected|projects|wins|won|defeats|defeated|concedes|concession|recount|declared|flips|flipped|race call|too close to call|upset|ousted|unseats|clinch|clinches|majority)\b/i;

function rememberTitles(c: Ctx, hits: { url?: string; title?: string }[]) {
  const t = c.w.newsMeta.urlTitles;
  for (const h of hits) if (h.url && h.title) t[h.url] = cleanText(h.title, 200);
  const keys = Object.keys(t);
  for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete t[k];
}
function titleFromUrl(url: string) {
  try {
    const parts = new URL(url).pathname.split("/").filter((p) => /[a-z]/i.test(p) && p.length > 12 && !/^\d+$/.test(p));
    const slug = (parts.pop() ?? "").replace(/\.(html?|php)$/, "").replace(/[_-]+/g, " ").replace(/\b\d{4,}\b/g, "").trim();
    return slug ? (slug[0].toUpperCase() + slug.slice(1)).replace(/\bus\b/gi, "US").replace(/\s{2,}/g, " ") : domainOf(url);
  } catch {
    return url;
  }
}
function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function cleanText(s: string | undefined, max = 280) {
  return (s ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\\+/g, " ")
    .replace(/[#*_`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function normTitle(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 90);
}

function breakingAlerts(c: Ctx, fresh: NewsItem[], kind: string, max = 3) {
  for (const n of fresh.filter((f) => BREAKING.test(f.title)).slice(0, max)) {
    c.alert({ severity: "high", kind, title: n.title, detail: `${n.source ?? n.domain}${n.snippet ? ` · ${n.snippet.slice(0, 140)}` : ""}`, source: n.via, url: n.url });
  }
}

async function pollNews(c: Ctx) {
  const m = c.w.newsMeta;
  const batch = m.newsWarm ? [NEWS_QUERIES[m.newsCursor++ % NEWS_QUERIES.length]] : NEWS_QUERIES.slice(0, 4);
  m.newsCursor = Math.max(m.newsCursor, batch.length);
  await mapLimit(batch, 4, async (query) => {
    const items = await firecrawlNewsSearch(c, query);
    rememberTitles(c, items);
    const fresh = c.ingestNews(
      items
        .filter((i) => i.url)
        .map((i) => ({
          id: i.url,
          url: i.url,
          title: i.title,
          snippet: cleanText(i.snippet),
          date: i.date,
          imageUrl: i.imageUrl,
          domain: domainOf(i.url),
          via: "search" as const,
          query,
        })),
    );
    if (m.newsWarm) breakingAlerts(c, fresh, "BREAKING");
  });
  m.newsWarm = true;
}

function addSource(w: World, url: string, name: string, kind: Source["kind"], discovered: boolean) {
  if (w.sources[url] || Object.keys(w.sources).length >= MAX_SOURCES) return undefined;
  const src: Source = { url, name, domain: domainOf(url), kind, monitored: false, discovered, posts: 0, dirty: true };
  w.sources[url] = src;
  return src;
}

const LIVE_URL = /\/live(\/|-|$)|live-updates|live-blog|liveblog|live-results/i;
// nytimes.com refuses Firecrawl scrapes.
const SKIP_DOMAINS = /youtube\.com|facebook\.com|x\.com|twitter\.com|instagram\.com|tiktok\.com|reddit\.com|nytimes\.com/i;

async function discoverSources(c: Ctx) {
  const body = await firecrawl<any>(c, "POST", "/v2/search", "search/discover-live", {
    body: { query: "midterm election live updates", sources: ["news", "web"], tbs: "qdr:d", limit: 20, origin: config.origin },
    bucket: "search",
  });
  const hits = [...(body.data?.news ?? []), ...(body.data?.web ?? [])] as { url: string; title?: string }[];
  rememberTitles(c, hits);
  for (const h of hits) {
    if (!h.url || SKIP_DOMAINS.test(h.url) || !LIVE_URL.test(h.url)) continue;
    const dom = domainOf(h.url);
    if (Object.values(c.w.sources).some((s) => s.domain === dom)) continue;
    const src = addSource(c.w, h.url, dom.split(".").slice(-2, -1)[0]?.toUpperCase() ?? dom, "live", true);
    if (src && c.w.newsMeta.discoverWarm) {
      c.alert({ severity: "info", kind: "SOURCE ADDED", title: `Now watching ${dom} live updates`, detail: cleanText(h.title, 140), source: "firecrawl-search", url: h.url });
    }
  }
  c.w.newsMeta.discoverWarm = true;
}

const POSTS_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      description: "Live-update posts, newest first, at most 12",
      items: {
        type: "object",
        properties: {
          headline: { type: "string" },
          summary: { type: "string", description: "one or two sentences" },
          time: { type: "string", description: "timestamp as shown on the page" },
          url: { type: "string", description: "permalink to the post if present" },
        },
        required: ["headline"],
      },
    },
  },
};

async function scrapeSource(c: Ctx, src: Source) {
  const seeded = src.lastScrapeAt !== undefined;
  src.lastScrapeAt = Date.now();
  src.dirty = false;
  try {
    const json = await scrapeJson<any>(c, src.url, "scrape/live-blog", "Extract the most recent live-update posts on this election page, newest first.", POSTS_SCHEMA);
    const posts: any[] = (json?.posts ?? []).filter((p: any) => p?.headline).slice(0, 12);
    src.error = undefined;
    src.latest = posts[0]?.headline ?? src.latest;
    const fresh = c.ingestNews(
      posts.map((p) => ({
        id: `${src.domain}|${normTitle(p.headline)}`,
        url: typeof p.url === "string" && /^https?:\/\//.test(p.url) ? p.url : src.url,
        title: cleanText(p.headline, 200),
        snippet: cleanText(p.summary),
        date: p.time,
        domain: src.domain,
        via: "live" as const,
        source: src.name,
      })),
    );
    src.posts += fresh.length;
    if (fresh.length) src.lastPostAt = Date.now();
    if (seeded) {
      for (const n of fresh.slice(0, 3)) {
        const brk = BREAKING.test(n.title);
        c.alert({ severity: brk ? "high" : "medium", kind: brk ? `BREAKING · ${src.name}` : `LIVE · ${src.name}`, title: n.title, detail: n.snippet || undefined, source: "firecrawl-scrape", url: n.url });
      }
    }
  } catch (e: any) {
    src.error = e.message;
  }
}

async function pollSources(c: Ctx) {
  const list = Object.values(c.w.sources);
  const unseeded = list.filter((s) => s.lastScrapeAt === undefined);
  // Seed every source once, then take the dirtiest or stalest one per tick.
  const batch = unseeded.length
    ? unseeded.slice(0, 4)
    : list.sort((a, b) => Number(b.dirty) - Number(a.dirty) || (a.lastScrapeAt ?? 0) - (b.lastScrapeAt ?? 0)).slice(0, 1);
  await mapLimit(batch, 4, (s) => scrapeSource(c, s));
}

// ---------- National board (NBC News Senate results page, parsed from markdown) ----------
const NBC_SENATE = "https://www.nbcnews.com/politics/2026-elections/senate-results";
const WINNER_MARK = /✓|✔|☑|winner|check|projected|\bwon\b/i;
const PROJECTED = /projected/i;
const NAT_PARTIES = ["DEM", "REP", "IND"];

export function parseNbc(md: string) {
  const rows = [...md.matchAll(/^\| \[([^\]]+)\]\((https:\/\/www\.nbcnews\.com\/politics\/[^)]*senate-results)\) \|(.*)$/gm)];
  const races: NatRace[] = [];
  for (const [, label, url, rest] of rows) {
    const code = STATE_CODES[label.replace(/\s+special$/i, "").trim()];
    if (!code) continue;
    const cells = rest.split("|").map((x) => x.trim());
    const pctIn = Number(cells[3]?.match(/([\d.]+)\s*%/)?.[1] ?? 0);
    let winner = "";
    const candidates = cells.slice(0, 3).flatMap((cell, i) => {
      if (!cell) return [];
      const m = cell.replace(/!\[[^\]]*\]\([^)]*\)/g, "").match(/^(.*?)\s*([\d.]+)\s*%/);
      if (!m) return [];
      const cand = { name: m[1].replace(/[✓✔☑*]/g, "").trim(), party: NAT_PARTIES[i], votes: 0, pct: Number(m[2]) };
      if (WINNER_MARK.test(cell)) winner = cand.name;
      return [cand];
    });
    candidates.sort((a, b) => b.pct - a.pct);
    const special = /special/i.test(label) || /special-elections/.test(url);
    const status = winner ? "projected winner" : pctIn > 0 ? "counting" : "not started";
    races.push({ state: code, status: special ? `${status} · special` : status, pctIn, winner, candidates });
  }
  const tally = (chamber: "senate" | "house"): Tally => {
    const m = md.match(new RegExp(`\\[${chamber} results[\\s\\S]*?\\| Democratic seats \\| (\\d+) \\|[\\s\\S]*?\\| Republican seats \\| (\\d+) \\|[\\s\\S]*?Number of seats (?:to tie|for majority): (\\d+)`));
    return m ? { dem: Number(m[1]), rep: Number(m[2]), target: Number(m[3]) } : null;
  };
  return { races, senate: tally("senate"), house: tally("house") };
}

async function pollNationalSenate(c: Ctx) {
  const body = await firecrawl<any>(c, "POST", "/v2/scrape", "scrape/national-board", {
    body: { url: NBC_SENATE, maxAge: 0, waitFor: 2500, onlyMainContent: false, formats: ["markdown"], origin: config.origin },
    bucket: "scrape",
  });
  const parsed = parseNbc(String(body.data?.markdown ?? ""));
  if (parsed.senate || parsed.house) updateControl(c, parsed.senate, parsed.house);
  if (!parsed.races.length) return;
  const nat = c.w.national;
  const prev = new Map(nat.senate.map((r) => [r.state, r]));
  if (c.w.newsMeta.nationalWarm) {
    for (const r of parsed.races) {
      const p = prev.get(r.state);
      if (!p) continue;
      const common = { state: r.state, source: "nbc-scrape", url: NBC_SENATE };
      const lead = r.candidates[0];
      if (r.winner && r.winner !== p.winner) {
        c.alert({ ...common, severity: "critical", kind: "PROJECTION · NBC", title: `${r.state} Senate: ${r.winner} projected winner`, detail: `NBC News projection · ${r.pctIn}% in` });
      } else if (PROJECTED.test(r.status) && !PROJECTED.test(p.status) && lead) {
        c.alert({ ...common, severity: "critical", kind: "PROJECTION · NBC", title: `${r.state} Senate: ${lead.name} (${lead.party}) projected`, detail: `${r.status} · ${r.pctIn}% in` });
      }
      if (p.pctIn === 0 && r.pctIn > 0 && lead) {
        c.alert({ ...common, severity: "medium", kind: "COUNTING · NBC", title: `${r.state} Senate: first votes in`, detail: `${lead.name} ${lead.pct}% · ${r.pctIn}% in` });
      }
      const pl = p.candidates[0];
      if (pl && lead && pl.name !== lead.name && r.pctIn >= 10 && p.pctIn > 0 && lead.pct > 0) {
        c.alert({ ...common, severity: "high", kind: "LEAD CHANGE · NBC", title: `${r.state} Senate: ${lead.name} (${lead.party}) moves ahead`, detail: `${lead.pct}% vs ${r.candidates[1]?.pct ?? "?"}% · ${r.pctIn}% in` });
      }
    }
  }
  c.w.newsMeta.nationalWarm = true;
  // Keep the last known row for any state a partial render missed.
  const merged = new Map(prev);
  for (const r of parsed.races) merged.set(r.state, r);
  nat.senate = [...merged.values()].sort((a, b) => a.state.localeCompare(b.state));
  nat.senateAt = Date.now();
}

function updateControl(c: Ctx, senate: Tally, house: Tally) {
  const nat = c.w.national;
  const prev = nat.control;
  nat.control = { senate: senate ?? prev?.senate ?? null, house: house ?? prev?.house ?? null };
  nat.houseAt = Date.now();
  if (!prev) return;
  const checks: [string, Tally, Tally, number][] = [
    ["House", prev.house, house, 0],
    ["Senate", prev.senate, senate, 1],
  ];
  for (const [chamber, before, after, extra] of checks) {
    if (!before || !after) continue;
    const need = after.target + extra;
    for (const [party, b, a] of [["Democrats", before.dem, after.dem], ["Republicans", before.rep, after.rep]] as const) {
      if (b < need && a >= need) {
        c.alert({ severity: "critical", kind: `${chamber.toUpperCase()} CONTROL · NBC`, title: `${party} projected to control the ${chamber} (${a} seats)`, source: "nbc-scrape", url: NBC_SENATE });
      } else if (a > b) {
        c.alert({ severity: "high", kind: `SEAT CALLED · NBC`, title: `${chamber}: ${party} now at ${a} seats`, detail: `${need} needed for control · ${party === "Democrats" ? after.rep : after.dem} for the other side`, source: "nbc-scrape", url: NBC_SENATE });
      }
    }
  }
}

// ---------- Firecrawl Monitors (every 5 minutes on Firecrawl's side; we poll their checks) ----------
const WEB_QUERIES = [
  "midterm election results",
  "Senate race projected winner",
  "House race called",
  "concedes election",
  "election recount",
  "polling place problems election day",
];
function monitorDefs() {
  return [
    {
      key: "pages",
      kind: "page" as const,
      body: {
        name: `${config.origin}:live-blogs`,
        schedule: { cron: "*/5 * * * *", timezone: "America/New_York" },
        goal: "Alert when an election live blog posts a new update about race calls or projections, vote counts, lead changes, concessions, recounts, voting problems, or control of Congress. Ignore timestamps, ads, view counts, reordering and formatting-only changes.",
        targets: [{ type: "scrape", urls: SEED_SOURCES.map((s) => s.url), scrapeOptions: { onlyMainContent: true, maxAge: 0 } }],
        retentionDays: 3,
      },
    },
    {
      key: "web",
      kind: "web" as const,
      body: {
        name: `${config.origin}:web-search`,
        schedule: { cron: "*/5 * * * *", timezone: "America/New_York" },
        goal: "Alert on new reporting about the 2026 US midterm elections: race calls and projections, lead changes, concessions, recounts, voting problems, and control of the House or Senate. Ignore opinion pieces, explainers, and how-to-watch guides.",
        targets: [
          {
            type: "search",
            queries: WEB_QUERIES,
            searchWindow: "1h",
            maxResults: 15,
            excludeDomains: ["youtube.com", "facebook.com", "x.com", "twitter.com", "instagram.com", "tiktok.com", "reddit.com", "nytimes.com"],
          },
        ],
        retentionDays: 3,
      },
    },
  ];
}

async function ensureMonitors(c: Ctx) {
  const saved = c.w.newsMeta.monitorIds;
  const existing: any[] = (await firecrawl<any>(c, "GET", "/v2/monitor", "monitor/list", { credits: () => 0 })).data ?? [];
  const monitors: MonitorInfo[] = [];
  for (const def of monitorDefs()) {
    let mon = existing.find((m) => m.id === saved[def.key]) ?? existing.find((m) => m.name === def.body.name);
    try {
      const shape = (ts: any[]) => JSON.stringify((ts ?? []).map((t) => [t.urls ?? t.queries, t.excludeDomains ?? []]));
      if (mon && shape(mon.targets) !== shape(def.body.targets)) {
        mon = (await firecrawl<any>(c, "PATCH", `/v2/monitor/${mon.id}`, "monitor/update", { body: { targets: def.body.targets, goal: def.body.goal } })).data ?? mon;
      }
      if (!mon) {
        mon = (await firecrawl<any>(c, "POST", "/v2/monitor", "monitor/create", { body: def.body })).data;
        c.alert({ severity: "system", kind: "MONITOR ARMED", title: `Firecrawl monitor created: ${def.body.name}`, detail: `Runs every 5 minutes · ${def.kind === "page" ? `${SEED_SOURCES.length} live-blog pages` : `${WEB_QUERIES.length} web searches`}`, source: "firecrawl-monitor" });
        await firecrawl(c, "POST", `/v2/monitor/${mon.id}/run`, "monitor/run").catch(() => {});
      }
      saved[def.key] = mon.id;
      const prev = c.w.monitors.find((m) => m.key === def.key);
      monitors.push({ ...prev, key: def.key, id: mon.id, name: def.body.name, kind: def.kind, status: mon.status, nextRunAt: mon.nextRunAt, lastRunAt: mon.lastRunAt, checks: prev?.checks ?? 0 });
    } catch (e: any) {
      monitors.push({ key: def.key, id: "", name: def.body.name, kind: def.kind, checks: 0, error: e.message });
    }
  }
  c.w.monitors = monitors;
  c.w.newsMeta.monitorsReady = monitors.every((m) => m.id);
  const pageMonitor = monitors.find((m) => m.kind === "page" && m.id);
  for (const s of Object.values(c.w.sources)) s.monitored = !!pageMonitor && SEED_SOURCES.some((x) => x.url === s.url);
}

async function checkPages(c: Ctx, monId: string, checkId: string) {
  const pages: any[] = [];
  let url: string | undefined = `/v2/monitor/${monId}/checks/${checkId}?limit=50`;
  let check: any;
  for (let i = 0; url && i < 4; i++) {
    const body: any = await firecrawl<any>(c, "GET", url, "monitor/check", { credits: () => 0 });
    check = body.data;
    pages.push(...(body.data?.pages ?? []));
    url = body.next;
  }
  return { check, pages };
}

function processPageCheck(c: Ctx, pages: any[], quiet: boolean) {
  let alerts = 0;
  const sources = Object.values(c.w.sources);
  for (const p of pages) {
    const src = c.w.sources[p.url] ?? sources.find((s) => s.domain === domainOf(p.url));
    if (src) {
      src.lastCheckAt = Date.now();
      src.lastCheckStatus = p.status === "changed" ? (p.judgment?.meaningful ? "meaningful" : "changed") : p.status;
      if (p.status === "changed") src.lastChangeAt = Date.now();
      if (p.judgment?.meaningful) src.dirty = true;
    }
    if (p.status !== "changed" || !p.judgment?.meaningful) continue;
    const name = src?.name ?? domainOf(p.url);
    const changes: any[] = (p.judgment.meaningfulChanges ?? []).filter((x: any) => x.type !== "removed").slice(0, 4);
    const fresh = c.ingestNews(
      (changes.length ? changes : [{ after: "", reason: p.judgment.reason }]).map((x: any) => ({
        id: `mon|${p.url}|${normTitle(String(x.reason || x.after || ""))}`,
        url: p.url,
        title: cleanText(String(x.reason || x.after || p.judgment.reason), 220),
        snippet: cleanText(x.after, 260),
        domain: domainOf(p.url),
        via: "monitor" as const,
        source: name,
      })),
    );
    if (!quiet && fresh.length) {
      alerts++;
      const brk = BREAKING.test(fresh.map((f) => f.title).join(" "));
      c.alert({
        severity: brk ? "high" : "medium",
        kind: `MONITOR · ${name}`,
        title: cleanText(p.judgment.reason, 220),
        detail: fresh[0].snippet ? fresh[0].snippet.slice(0, 180) : undefined,
        source: "firecrawl-monitor",
        url: p.url,
      });
    }
  }
  return alerts;
}

function processWebCheck(c: Ctx, pages: any[], quiet: boolean) {
  const hits = pages.filter((p) => !SKIP_DOMAINS.test(p.url) && (p.metadata?.searchStatus === "alert" || (p.status === "new" && p.judgment?.meaningful)));
  const fresh = c.ingestNews(
    hits.map((p) => ({
      id: p.url,
      url: p.url,
      title: p.metadata?.title || c.w.newsMeta.urlTitles[p.url] || titleFromUrl(p.url),
      snippet: cleanText(p.judgment?.reason ?? p.metadata?.rationale),
      date: p.metadata?.publishedAt
        ? new Date(p.metadata.publishedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }) + " ET"
        : undefined,
      domain: domainOf(p.url),
      via: "web-monitor" as const,
      source: p.metadata?.eventLabel,
    })),
  );
  if (quiet) return 0;
  for (const n of fresh.slice(0, 4)) {
    c.alert({ severity: BREAKING.test(n.title) ? "high" : "medium", kind: `WEB MONITOR · ${n.domain}`, title: n.title, detail: n.snippet ? n.snippet.slice(0, 180) : undefined, source: "firecrawl-monitor", url: n.url });
  }
  return fresh.length;
}

async function pollMonitors(c: Ctx) {
  if (!config.enableMonitors) {
    c.w.monitors = [];
    return;
  }
  const meta = c.w.newsMeta;
  if (!meta.monitorsReady) await ensureMonitors(c);
  const processed = new Set(meta.processedChecks);
  for (const mon of c.w.monitors.filter((m) => m.id)) {
    try {
      const [info, list] = await Promise.all([
        firecrawl<any>(c, "GET", `/v2/monitor/${mon.id}`, "monitor/get", { credits: () => 0 }),
        firecrawl<any>(c, "GET", `/v2/monitor/${mon.id}/checks?limit=6`, "monitor/checks", { credits: () => 0 }),
      ]);
      mon.status = info.data?.status;
      mon.nextRunAt = info.data?.nextRunAt;
      mon.lastRunAt = info.data?.lastRunAt;
      mon.error = undefined;
      const checks: any[] = Array.isArray(list.data) ? list.data : list.data?.checks ?? [];
      const done = checks.filter((ck) => ["completed", "partial"].includes(ck.status) && !processed.has(ck.id));
      // On the first poll, replay only the newest finished check without raising alerts.
      const todo = meta.monitorsWarm ? done.reverse() : done.slice(0, 1);
      if (!meta.monitorsWarm) checks.forEach((ck) => ["completed", "partial", "failed"].includes(ck.status) && processed.add(ck.id));
      for (const ck of todo) {
        processed.add(ck.id);
        const { check, pages } = await checkPages(c, mon.id, ck.id);
        const credits = Number(check?.actualCredits ?? 0);
        if (meta.monitorsWarm) c.tel.credits.monitor += credits;
        const n = mon.kind === "page" ? processPageCheck(c, pages, !meta.monitorsWarm) : processWebCheck(c, pages, !meta.monitorsWarm);
        mon.checks++;
        mon.lastCheck = { id: ck.id, status: check?.status ?? ck.status, at: check?.finishedAt ?? check?.createdAt ?? ck.createdAt, summary: check?.summary, credits, alerts: n };
      }
      const latest = checks[0];
      if (latest && ["failed", "skipped_no_credits"].includes(latest.status) && mon.lastCheck?.id !== latest.id) {
        mon.lastCheck = { id: latest.id, status: latest.status, at: latest.createdAt, alerts: 0 };
      }
    } catch (e: any) {
      mon.error = e.message;
      // A deleted monitor 404s; recreate it on the next pass.
      if (/not found|404/i.test(e.message)) meta.monitorsReady = false;
    }
  }
  meta.processedChecks = [...processed].slice(-200);
  meta.monitorsWarm = true;
}

// ---------- Prediction markets (Polymarket: live prices via Alexandria, history from Polymarket's API) ----------
function outcomeParty(label: string): MarketOutcome["party"] {
  if (/democrats sweep|\(D\)|democrat/i.test(label)) return "DEM";
  if (/republicans sweep|\(R\)|republican/i.test(label)) return "REP";
  if (/[DR] Senate, [DR] House/.test(label)) return "MIX";
  return null;
}

function normalizeMarket(cfg: (typeof MARKETS)[number], ev: any): Market {
  const outcomes: MarketOutcome[] = (ev.markets ?? [])
    .filter((m: any) => !m.closed && m.outcomePrices)
    .map((m: any) => {
      const label = m.groupItemTitle || m.question;
      let tokenId: string | undefined;
      try {
        tokenId = JSON.parse(m.clobTokenIds ?? "[]")[0];
      } catch {}
      return {
        label,
        party: outcomeParty(label),
        price: Number(JSON.parse(m.outcomePrices)[0]),
        change1d: m.oneDayPriceChange ?? null,
        change1h: m.oneHourPriceChange ?? null,
        volume24h: Number(m.volume24hr ?? 0),
        tokenId,
      };
    })
    .filter((o: MarketOutcome) => o.price >= 0.005)
    .sort((a: MarketOutcome, b: MarketOutcome) => b.price - a.price);
  return {
    slug: cfg.slug,
    role: cfg.role,
    title: cfg.title ?? ev.title,
    url: `https://polymarket.com/event/${cfg.slug}`,
    volume: Number(ev.volume ?? 0),
    volume24h: outcomes.reduce((s, o) => s + o.volume24h, 0),
    endDate: ev.endDate,
    state: cfg.state,
    office: cfg.office,
    outcomes,
    updatedAt: Date.now(),
  };
}

function recordMarketHistory(c: Ctx, m: Market) {
  const now = Date.now();
  const hist = (c.w.marketHistory[m.slug] ??= {});
  const cooldown = c.w.resultsMeta.moveCooldown;
  for (const o of m.outcomes) {
    const series = (hist[o.label] ??= []);
    series.push([now, o.price]);
    if (series.length > HISTORY_CAP) series.splice(0, series.length - HISTORY_CAP);
    const ref = series.find(([t]) => now - t <= 15 * 60_000) ?? series[0];
    const movePts = (o.price - ref[1]) * 100;
    const key = `${m.slug}|${o.label}`;
    if (Math.abs(movePts) >= MOVE_ALERT_PTS && now - (cooldown[key] ?? 0) > 15 * 60_000 && o.price >= 0.05) {
      cooldown[key] = now;
      c.alert({
        severity: Math.abs(movePts) >= 6 ? "high" : "medium",
        kind: "MARKET MOVE",
        title: `${m.title}: ${o.label} ${movePts > 0 ? "up" : "down"} ${Math.abs(movePts).toFixed(1)} pts to ${(o.price * 100).toFixed(1)}%`,
        detail: `Polymarket · past ${Math.round((now - ref[0]) / 60_000) || 1} min · $${Math.round(m.volume24h / 1000).toLocaleString("en-US")}K traded 24h`,
        state: m.state,
        source: "polymarket",
        url: m.url,
      });
    }
  }
}

async function pollMarkets(c: Ctx) {
  await mapLimit(MARKETS, 4, async (cfg) => {
    const ev = await alexandria<any>(c, "polymarket", "events/by-slug", { slug: cfg.slug });
    const next = normalizeMarket(cfg, ev);
    const prev = c.w.markets[cfg.slug];
    if (prev && prev.outcomes.length >= 2 && next.outcomes.length >= 2 && cfg.role !== "hero" && prev.outcomes[0].label !== next.outcomes[0].label) {
      c.alert({
        severity: "high",
        kind: "MARKET FLIP",
        title: `${next.title}: ${next.outcomes[0].label} retakes the lead on Polymarket`,
        detail: `${(next.outcomes[0].price * 100).toFixed(1)}% vs ${(next.outcomes[1].price * 100).toFixed(1)}%`,
        state: cfg.state,
        source: "polymarket",
        url: next.url,
      });
    }
    c.w.markets[cfg.slug] = next;
    recordMarketHistory(c, next);
  });
}

const CLOB = "https://clob.polymarket.com/prices-history";

/** Polymarket's public price history. Falls back to fetching the same URL through Firecrawl when the direct call fails. */
async function priceHistory(c: Ctx, tokenId: string): Promise<{ t: number; p: number }[]> {
  const url = `${CLOB}?market=${tokenId}&interval=1d&fidelity=10`;
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    recordCall(c, "polymarket", "clob/prices-history", true, performance.now() - t0, 0, "direct");
    return json.history ?? [];
  } catch {
    // Some networks block polymarket.com; the Firecrawl fetch below is the recorded call.
    const body = await firecrawl<any>(c, "POST", "/v2/scrape", "scrape/polymarket-history", {
      body: { url, formats: ["rawHtml"], maxAge: 5 * 60_000, origin: config.origin },
      bucket: "scrape",
      timeoutMs: 30_000,
    });
    const raw = String(body.data?.rawHtml ?? "");
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    return json.history ?? [];
  }
}

async function pollMarketHistory(c: Ctx) {
  const targets = Object.values(c.w.markets)
    .filter((m) => m.role === "hero" || m.role === "control")
    .flatMap((m) => m.outcomes.filter((o) => o.tokenId).map((o) => ({ m, o })))
    .slice(0, 12);
  if (!targets.length) throw new Error("markets not loaded yet");
  await mapLimit(targets, 4, async ({ m, o }) => {
    const points = await priceHistory(c, o.tokenId!);
    if (!points.length) return;
    const series: [number, number][] = points.map((h) => [h.t * 1000, h.p]);
    const lastT = series[series.length - 1][0];
    const hist = (c.w.marketHistory[m.slug] ??= {});
    const live = (hist[o.label] ?? []).filter(([t]) => t > lastT);
    hist[o.label] = [...series, ...live].slice(-HISTORY_CAP);
  });
  c.w.resultsMeta.historyAt = Date.now();
}

// ---------- Contest drill-down (on demand from the API) ----------
export async function contestDetails(st: string, electionId: string, contestId: string) {
  return alexandria<any>(null, "results-enr-clarityelections-com", "elections/get_contest_details", { state: st, election_id: electionId, contest_id: contestId });
}

// ---------- Lanes ----------
type Job = { name: string; every: number; run: (c: Ctx) => Promise<void> };
const I = config.intervals;

const JOBS: Record<Lane, Job[]> = {
  results: [
    { name: "results", every: I.results, run: pollResults },
    { name: "markets", every: I.markets, run: pollMarkets },
    { name: "marketHistory", every: I.marketHistory, run: pollMarketHistory },
  ],
  news: [
    { name: "news", every: I.news, run: pollNews },
    { name: "sources", every: I.sources, run: pollSources },
    { name: "discover", every: I.discover, run: discoverSources },
    { name: "national", every: I.national, run: pollNationalSenate },
    { name: "monitors", every: I.monitors, run: pollMonitors },
  ],
  money: [
    { name: "pollCloses", every: I.pollCloses, run: pollPollCloses },
    { name: "outsideMoney", every: I.outsideMoney, run: (c) => pollOutsideMoney(c, liveStates(c.w)) },
    { name: "campaignMoney", every: I.campaignMoney, run: (c) => pollCampaignMoney(c, c.w.races) },
    { name: "incumbents", every: I.incumbents, run: (c) => pollIncumbents(c, liveStates(c.w)) },
  ],
};

function liveStates(w: World) {
  return new Set(Object.values(w.feeds).filter((f) => f.status === "live").map((f) => f.state));
}

/** Jobs that need another lane's data first wait until it exists. */
function ready(job: string, w: World) {
  if (job === "campaignMoney" || job === "incumbents") return Object.keys(w.races).length > 0;
  if (job === "marketHistory") return Object.keys(w.markets).length > 0;
  return true;
}

const LEASE_SECONDS = 280;
// A tick that starts a little early still runs the job.
const SLACK_MS = 3_000;
// Failed jobs retry sooner than their interval.
const RETRY_MS = 60_000;

export type LaneResult = { lane: Lane; ran: string[]; failed: Record<string, string>; skipped?: string; alerts: number; news: number; ms: number };

export async function runLane(store: Store, lane: Lane): Promise<LaneResult> {
  const t0 = Date.now();
  const holder = crypto.randomUUID();
  const base = { lane, ran: [] as string[], failed: {} as Record<string, string>, alerts: 0, news: 0 };
  if (!(await store.claim(lane, holder, LEASE_SECONDS))) return { ...base, skipped: "another tick holds this lane", ms: Date.now() - t0 };
  try {
    const [{ world, fresh }, extra, seen] = await Promise.all([
      loadWorld(store),
      store.get([`telemetry:${lane}`, `jobs:${lane}`]),
      lane === "news" ? store.newsKeys(800) : Promise.resolve([] as string[]),
    ]);
    const tel: Telemetry = { ...emptyTelemetry(), ...(extra[`telemetry:${lane}`] ?? {}) };
    const jobs: Record<string, { at: number; ok: boolean }> = extra[`jobs:${lane}`] ?? {};
    const c = new Ctx(lane, world, tel, seen);

    if (lane === "results") ensureFeeds(world);
    if (lane === "news" && !Object.keys(world.sources).length) for (const s of SEED_SOURCES) addSource(world, s.url, s.name, s.kind, false);
    if (fresh && lane === "results") {
      c.alert({ severity: "system", kind: "BOOT", title: "War room online", detail: `Probing ${Object.keys(CLARITY_STATES).length} statewide Clarity ENR sites for the ${config.electionDate} general election`, source: "system" });
    }

    const now = Date.now();
    const due = JOBS[lane].filter((j) => {
      const last = jobs[j.name];
      const wait = last && !last.ok ? Math.min(j.every, RETRY_MS) : j.every;
      return (!last || now - last.at >= wait - SLACK_MS) && ready(j.name, world);
    });
    await Promise.all(
      due.map(async (j) => {
        try {
          await j.run(c);
          jobs[j.name] = { at: Date.now(), ok: true };
          base.ran.push(j.name);
        } catch (e: any) {
          jobs[j.name] = { at: Date.now(), ok: false };
          base.failed[j.name] = String(e?.message ?? e).slice(0, 200);
        }
      }),
    );

    const owned = Object.fromEntries(OWNED[lane].map((k) => [k, world[k]]));
    await Promise.all([
      store.set({ ...owned, ...(fresh ? { startedAt: world.startedAt } : {}), [`telemetry:${lane}`]: tel, [`jobs:${lane}`]: jobs }),
      store.addAlerts(c.alerts),
      store.addNews(c.news),
    ]);
    return { ...base, alerts: c.alerts.length, news: c.news.length, ms: Date.now() - t0 };
  } finally {
    await store.release(lane, holder).catch(() => {});
  }
}
