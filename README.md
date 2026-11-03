# Election War Room

A real-time dashboard for US election night. It pulls official results, campaign money, prediction markets and live news into one screen and raises alerts when something moves: first votes, lead changes, tight margins, projections, seats reaching control, market swings and new live-blog posts.

Built on [Firecrawl](https://www.firecrawl.dev/?utm_source=election-warroom&utm_medium=integration): Alexandria for structured data, plus Search, Scrape and Monitor for the open web.

## Where the data comes from

| Panel | Source | How |
| --- | --- | --- |
| Race boards, map, county drill-down | State election offices on Clarity ENR (Iowa and Colorado list the 2026 general) | Alexandria `results-enr-clarityelections-com`, every 20s |
| Campaign totals, outside spending | FEC | Alexandria `fec-gov` |
| Incumbent voting records | Clerk of the U.S. House | Alexandria `clerk-house-gov` |
| Prediction markets | Polymarket | Alexandria `polymarket` for live prices, Polymarket's public price-history API for the 24h chart |
| National board (35 Senate races, chamber tallies) | NBC News results page | Firecrawl Scrape (markdown, parsed in code), every 2 min |
| Poll-close times, Senate states on the map | 270toWin table, NBC board | Firecrawl Scrape, with built-in fallbacks |
| Newswire | Outlet live blogs and the wider web | Firecrawl Search, Scrape (JSON extraction of posts) and two Monitors that check every 5 min |

Alerts, margins, deltas and the breaking-news keyword match are computed by this app.

## How it runs

```
Supabase pg_cron ──every 20–60s──▶ /api/tick?lane=results|news|money ──▶ Firecrawl
                                          │
                                          ▼
                                   Supabase (state, alerts, news)
                                          ▲
Browser ──polls every 4s──▶ /api/live (CDN-cached) ┘
```

- Ingestion is split into three lanes. Each tick loads the lane's state, runs the jobs that are due, and saves. A lease row keeps two ticks from running the same lane at once.
- Visitors only read `/api/live` and `/api/snapshot`, which the CDN caches for a few seconds, so traffic never spends Firecrawl credits. County drill-downs are limited to races the app already tracks and cached for 30s.
- Supabase tables have row-level security on with no policies. Only the server, holding the service-role key, can read or write them.

## Run it locally

Requires [Bun](https://bun.sh).

```bash
cp .env.example .env.local   # add FIRECRAWL_API_KEY
bun install
bun dev                      # http://localhost:4317
```

Without Supabase variables the server keeps state in memory and runs the lanes itself every 2 seconds.

## Deploy (Vercel + Supabase)

1. **Supabase:** create a project, then run `supabase/schema.sql` in the SQL editor.
2. **Vercel:** import this repo (no framework, no build step). Add the environment variables:
   - `FIRECRAWL_API_KEY` ([get one](https://www.firecrawl.dev/app/api-keys?utm_source=election-warroom&utm_medium=integration))
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API)
   - `CRON_SECRET` (`openssl rand -hex 32`)
3. **Scheduler:** in Supabase, store the same secret with `select vault.create_secret('<CRON_SECRET>', 'warroom_cron_secret');`, replace `YOUR-APP.vercel.app` in `supabase/cron.sql` with your domain, and run it. Vercel Hobby crons only run daily, so Supabase pg_cron drives the ticks.
4. Open the site. The first ticks fill every panel within about a minute.

Test a tick by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://YOUR-APP.vercel.app/api/tick?lane=all"
```

## Cost

At the default intervals the app spends roughly 900–1,000 Firecrawl credits an hour on election night. Alexandria calls in this app are free. Most of the spend is the two monitors (about 500/hour), live-blog scrapes (5 credits each) and search (2 per query).

- Set `ENABLE_MONITORS=false` to skip the monitors.
- Set `INGEST_PAUSED=true` to stop all Firecrawl calls while the dashboard keeps serving the last state.
- The monitors run on Firecrawl's side even when nothing is ticking. Stop them with `bun scripts/monitors.ts pause` (or `delete`), and unschedule the cron jobs listed at the bottom of `supabase/cron.sql`.

## Adapt it

The states, markets, seed live blogs, search queries and monitor goals live at the top of `lib/engine.ts`. Alexandria's catalogue has 100+ providers, and discovery is free: see the [Alexandria docs](https://docs.firecrawl.dev/features/alexandria?utm_source=election-warroom&utm_medium=integration).

## License

MIT
