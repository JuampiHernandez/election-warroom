import { config } from "./config.js";
import { FALLBACK_SENATE_STATES, LANES, WORLD_KEYS, closeFor, contestDetails, fallbackCloses, loadWorld, runLane, type Lane, type World } from "./engine.js";
import { getStore, type Store } from "./store.js";
import type { CallLog, Credits, Health, Telemetry } from "./types.js";

const SLOW_KEYS = new Set(["marketHistory", "campaignMoney", "outsideMoney", "incumbents"]);
const LIVE_KEYS = (WORLD_KEYS as string[]).filter((k) => !SLOW_KEYS.has(k));

function json(body: unknown, init: { status?: number; cache?: string } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": init.cache ?? "no-store" },
  });
}

async function telemetry(store: Store) {
  const raw = await store.get(LANES.map((l) => `telemetry:${l}`));
  const health: Health[] = [];
  const callLog: CallLog[] = [];
  const credits: Credits = { alexandria: 0, search: 0, scrape: 0, monitor: 0 };
  for (const t of Object.values(raw) as Telemetry[]) {
    health.push(...Object.values(t.health ?? {}));
    callLog.push(...(t.callLog ?? []));
    for (const k of Object.keys(credits) as (keyof Credits)[]) credits[k] += Number(t.credits?.[k] ?? 0);
  }
  return { health, callLog: callLog.sort((a, b) => b.at - a.at).slice(0, 40), credits };
}

/** Public view of the world. Monitor IDs and internal cursors stay server-side. */
function publicView(w: World) {
  const senateStates = w.national.senate.length >= 30 ? w.national.senate.map((r) => r.state) : FALLBACK_SENATE_STATES;
  const closes = { ...fallbackCloses(), ...(w.pollCloses?.states ?? {}) };
  return {
    startedAt: w.startedAt,
    electionDate: config.electionDate,
    feeds: Object.values(w.feeds).map((f) => ({ ...f, pollsCloseUtc: closeFor(w, f.state) })),
    races: Object.values(w.races),
    sources: Object.values(w.sources),
    monitors: w.monitors.map(({ id, ...m }) => ({ ...m, armed: !!id })),
    national: w.national,
    markets: Object.values(w.markets).map((m) => ({ ...m, outcomes: m.outcomes.map(({ tokenId, ...o }) => o) })),
    nextResultsPollAt: w.resultsMeta.nextResultsPollAt,
    historyAt: w.resultsMeta.historyAt,
    moneyAt: w.moneyMeta.updatedAt,
    senateStates,
    senateSource: w.national.senate.length >= 30 ? "NBC News Senate board" : "built-in list",
    pollCloses: { states: closes, source: w.pollCloses ? "270toWin (scraped)" : "built-in table", at: w.pollCloses?.at ?? 0 },
    intervals: { results: config.intervals.results, news: config.intervals.news, sources: config.intervals.sources, national: config.intervals.national, monitors: 5 * 60_000 },
    paused: config.ingestPaused,
  };
}

/** Everything the dashboard needs on first load. */
export async function snapshot(store = getStore()) {
  const [{ world }, alerts, news, tel] = await Promise.all([loadWorld(store), store.recentAlerts(200), store.recentNews(200), telemetry(store)]);
  return {
    serverTime: Date.now(),
    ...publicView(world),
    alerts,
    news,
    marketHistory: world.marketHistory,
    campaignMoney: world.campaignMoney,
    outsideMoney: world.outsideMoney,
    incumbents: world.incumbents,
    ...tel,
  };
}

/** The small, frequently polled view. Same for every visitor, so the CDN can share it. */
export async function live(store = getStore()) {
  const [{ world }, alerts, news, tel] = await Promise.all([loadWorld(store, LIVE_KEYS), store.recentAlerts(40), store.recentNews(40), telemetry(store)]);
  return { serverTime: Date.now(), ...publicView(world), alerts, news, ...tel };
}

export async function handleSnapshot(_req: Request) {
  try {
    return json(await snapshot(), { cache: "public, max-age=0, s-maxage=5, stale-while-revalidate=30" });
  } catch (e: any) {
    console.error("snapshot failed", e);
    return json({ error: "snapshot unavailable" }, { status: 503 });
  }
}

export async function handleLive(_req: Request) {
  try {
    return json(await live(), { cache: "public, max-age=0, s-maxage=2, stale-while-revalidate=10" });
  } catch (e: any) {
    console.error("live failed", e);
    return json({ error: "live view unavailable" }, { status: 503 });
  }
}

const contestCache = new Map<string, { at: number; data: unknown }>();

/** County drill-down. Only races the war room already tracks can be requested, so visitors cannot spend credits on arbitrary calls. */
export async function handleContest(req: Request) {
  const url = new URL(req.url);
  const st = url.searchParams.get("state") ?? "";
  const eid = url.searchParams.get("election_id") ?? "";
  const cid = url.searchParams.get("contest_id") ?? "";
  if (!/^[A-Z]{2}$/.test(st) || !/^\d{1,12}$/.test(eid) || !/^\d{1,12}$/.test(cid)) return json({ error: "bad params" }, { status: 400 });
  const key = `${st}:${eid}:${cid}`;
  const hit = contestCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return json(hit.data, { cache: "public, s-maxage=30, stale-while-revalidate=60" });
  try {
    const { races } = await getStore().get(["races"]);
    if (!races?.[key]) return json({ error: "unknown contest" }, { status: 404 });
    const data = await contestDetails(st, eid, cid);
    contestCache.set(key, { at: Date.now(), data });
    return json(data, { cache: "public, s-maxage=30, stale-while-revalidate=60" });
  } catch (e: any) {
    console.error("contest failed", e);
    return json({ error: "contest details unavailable" }, { status: 502 });
  }
}

function authorized(req: Request) {
  if (!config.cronSecret) return getStore().kind === "memory";
  const header = req.headers.get("authorization") ?? "";
  const a = new TextEncoder().encode(header);
  const b = new TextEncoder().encode(`Bearer ${config.cronSecret}`);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Runs one ingest pass. Called by a scheduler (Supabase pg_cron) with the CRON_SECRET bearer token. */
export async function handleTick(req: Request) {
  if (!authorized(req)) return json({ error: "unauthorized" }, { status: 401 });
  if (config.ingestPaused) return json({ paused: true });
  if (!config.firecrawlKey) return json({ error: "FIRECRAWL_API_KEY is not set" }, { status: 500 });
  const param = new URL(req.url).searchParams.get("lane") ?? "all";
  const lanes = param === "all" ? LANES : LANES.filter((l) => l === param);
  if (!lanes.length) return json({ error: "lane must be results, news, money or all" }, { status: 400 });
  const results = await Promise.all(lanes.map((l: Lane) => runLane(getStore(), l)));
  return json({ ok: true, results });
}
