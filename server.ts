// Local dev server. Runs the same lanes and API handlers as the Vercel deployment,
// with an in-memory store unless SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
import { join } from "node:path";
import { handleContest, handleLive, handleSnapshot, handleTick } from "./lib/api.js";
import { config } from "./lib/config.js";
import { LANES, runLane } from "./lib/engine.js";
import { getStore } from "./lib/store.js";

const PORT = Number(process.env.PORT ?? 4317);
const LOOP_MS = 2_000;

if (!config.firecrawlKey) {
  console.error("FIRECRAWL_API_KEY is missing. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const store = getStore();
const local = !process.env.LOCAL_TICKS || process.env.LOCAL_TICKS !== "off";

if (local && !config.ingestPaused) {
  for (const lane of LANES) {
    const loop = async () => {
      try {
        const r = await runLane(store, lane);
        if (Object.keys(r.failed).length) console.warn(`[${lane}] failed:`, r.failed);
      } catch (e) {
        console.error(`[${lane}]`, e);
      }
      setTimeout(loop, LOOP_MS);
    };
    loop();
  }
}

const PUBLIC = join(import.meta.dir, "public");
const routes: Record<string, (req: Request) => Promise<Response>> = {
  "/api/live": handleLive,
  "/api/snapshot": handleSnapshot,
  "/api/contest": handleContest,
  "/api/tick": handleTick,
};

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    const route = routes[url.pathname];
    if (route) return route(req);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    if (path.includes("..")) return new Response("Not found", { status: 404 });
    const file = Bun.file(join(PUBLIC, path));
    if (await file.exists()) return new Response(file);
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Election war room on http://localhost:${PORT} (store: ${store.kind}${local ? ", local ticks on" : ""})`);
