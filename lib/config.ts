const env = (name: string) => process.env[name]?.trim() || undefined;
const num = (name: string, fallback: number) => {
  const v = Number(env(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const flag = (name: string, fallback: boolean) => {
  const v = env(name);
  return v === undefined ? fallback : /^(1|true|yes|on)$/i.test(v);
};

export const config = {
  firecrawlApi: env("FIRECRAWL_API_URL") ?? "https://api.firecrawl.dev",
  firecrawlKey: env("FIRECRAWL_API_KEY"),
  origin: env("FIRECRAWL_ORIGIN") ?? "election-warroom",
  electionDate: env("ELECTION_DATE") ?? "2026-11-03",
  supabaseUrl: env("SUPABASE_URL"),
  supabaseServiceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
  cronSecret: env("CRON_SECRET"),
  ingestPaused: flag("INGEST_PAUSED", false),
  enableMonitors: flag("ENABLE_MONITORS", true),
  intervals: {
    results: num("RESULTS_INTERVAL_MS", 20_000),
    markets: num("MARKETS_INTERVAL_MS", 45_000),
    marketHistory: 10 * 60_000,
    news: num("NEWS_INTERVAL_MS", 45_000),
    sources: num("SOURCES_INTERVAL_MS", 75_000),
    discover: 20 * 60_000,
    national: num("NATIONAL_INTERVAL_MS", 2 * 60_000),
    monitors: 30_000,
    outsideMoney: 5 * 60_000,
    campaignMoney: 20 * 60_000,
    incumbents: 60 * 60_000,
    pollCloses: 6 * 60 * 60_000,
  },
};

export type Config = typeof config;
