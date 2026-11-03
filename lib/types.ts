export type Severity = "critical" | "high" | "medium" | "info" | "system";
export type Alert = {
  id: string;
  at: number;
  severity: Severity;
  kind: string;
  title: string;
  detail?: string;
  raceId?: string;
  state?: string;
  source: string;
  url?: string;
};

export type Office = "senate" | "house" | "governor" | "statewide" | "measure";
export type Choice = { name: string; party: string | null; votes: number; percent: number; winner: boolean };
export type Race = {
  id: string;
  state: string;
  electionId: string;
  contestId: string;
  office: Office;
  label: string;
  name: string;
  category: string;
  precinctsReporting: number;
  precinctsTotal: number;
  totalVotes: number;
  choices: Choice[];
  leader: string | null;
  marginPct: number | null;
  updatedAt: number;
  version: string;
  resultsUrl: string;
};

export type Feed = {
  state: string;
  name: string;
  status: "probing" | "live" | "no-election" | "error";
  electionId?: string;
  electionName?: string;
  resultsUrl?: string;
  version?: string;
  lastModified?: string;
  lastPollAt?: number;
  lastChangeAt?: number;
  error?: string;
  nextProbeAt: number;
  pollsCloseUtc: string;
  races: number;
};

export type Health = {
  key: string;
  provider: string;
  capability: string;
  ok: boolean;
  calls: number;
  errors: number;
  streak: number;
  down: boolean;
  lastMs: number;
  lastAt: number;
  lastError?: string;
};

export type CallLog = { at: number; provider: string; capability: string; ms: number; ok: boolean; credits: number; requestId: string; note?: string };
export type Credits = { alexandria: number; search: number; scrape: number; monitor: number };
export type Telemetry = { health: Record<string, Health>; callLog: CallLog[]; credits: Credits };

export type NewsItem = {
  id: string;
  url: string;
  title: string;
  snippet: string;
  date?: string;
  imageUrl?: string;
  domain: string;
  firstSeen: number;
  via: "search" | "live" | "monitor" | "web-monitor";
  source?: string;
  query?: string;
};

export type Source = {
  url: string;
  name: string;
  domain: string;
  kind: "live" | "results";
  monitored: boolean;
  discovered: boolean;
  posts: number;
  latest?: string;
  lastScrapeAt?: number;
  lastPostAt?: number;
  lastCheckAt?: number;
  lastCheckStatus?: string;
  lastChangeAt?: number;
  dirty: boolean;
  error?: string;
};

export type MonitorInfo = {
  key: string;
  id: string;
  name: string;
  kind: "page" | "web";
  status?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  checks: number;
  lastCheck?: { id: string; status: string; at?: string; summary?: Record<string, number>; credits?: number; alerts: number };
  error?: string;
};

export type NatRace = { state: string; status: string; pctIn: number; winner: string; candidates: { name: string; party: string; votes: number; pct: number }[] };
export type Tally = { dem: number; rep: number; target: number } | null;
export type National = {
  senate: NatRace[];
  control: null | { senate: Tally; house: Tally };
  senateAt: number;
  houseAt: number;
  source: string;
};

export type MarketOutcome = {
  label: string;
  party: "DEM" | "REP" | "MIX" | null;
  price: number;
  change1d: number | null;
  change1h: number | null;
  volume24h: number;
  tokenId?: string;
};
export type Market = {
  slug: string;
  role: "hero" | "control" | "race";
  title: string;
  url: string;
  volume: number;
  volume24h: number;
  endDate?: string;
  state?: string;
  office?: Office;
  outcomes: MarketOutcome[];
  updatedAt: number;
};
/** slug -> outcome label -> [ms, price] points */
export type MarketHistory = Record<string, Record<string, [number, number][]>>;

export type CampaignMoneyRow = {
  candidate: string;
  party: string | null;
  committeeId: string;
  committeeName?: string;
  receipts: number;
  disbursements: number;
  cashOnHand: number;
  coverageEnd?: string;
  fecUrl?: string;
};
export type OutsideMoneyRow = {
  id: string;
  spender: string;
  candidate: string;
  state: string;
  office: string;
  party: string;
  supportOppose: string;
  amount: number;
  date: string;
  purpose?: string;
  pdfUrl?: string;
};
export type Incumbent = {
  name: string;
  party: string;
  district: string;
  bioguideId: string;
  url: string;
  votes: { date: string; bill: string; title: string; vote: string; result: string; url: string }[];
};

/** Latest scheduled poll close per state, ISO UTC. */
export type PollCloses = { at: number; source: string; states: Record<string, string> };
