// Manage the war room's Firecrawl monitors so they stop spending credits after election night.
//   bun scripts/monitors.ts list      show election-warroom monitors and their status
//   bun scripts/monitors.ts pause     set them to paused (keeps history)
//   bun scripts/monitors.ts resume    set them back to active
//   bun scripts/monitors.ts delete    delete them and clear .monitors.json
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PREFIX = "election-warroom:";

function loadKey(): string {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  for (const rel of [".env.local", ".env"]) {
    const file = join(ROOT, rel);
    if (!existsSync(file)) continue;
    const m = readFileSync(file, "utf8").match(/^FIRECRAWL_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("FIRECRAWL_API_KEY missing");
}
const KEY = loadKey();

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.firecrawl.dev${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(`${method} ${path}: ${json.error ?? res.status}`);
  return json;
}

const cmd = process.argv[2] ?? "list";
const mine = ((await api("GET", "/v2/monitor")).data ?? []).filter((m: any) => String(m.name).startsWith(PREFIX));

if (!mine.length) console.log("No election-warroom monitors found.");
for (const m of mine) {
  if (cmd === "pause" || cmd === "resume") await api("PATCH", `/v2/monitor/${m.id}`, { status: cmd === "pause" ? "paused" : "active" });
  if (cmd === "delete") await api("DELETE", `/v2/monitor/${m.id}`);
  console.log(`${cmd.padEnd(6)} ${m.name}  ${m.id}  status=${cmd === "list" ? m.status : cmd}  ~${m.estimatedCreditsPerMonth ?? "?"} credits/month at this schedule`);
}
if (cmd === "delete") rmSync(join(ROOT, ".monitors.json"), { force: true });
