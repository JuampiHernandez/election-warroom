// Usage: bun scripts/call.ts <provider> <capability> '<options json>'
import { readFileSync, existsSync } from "node:fs";

function loadKey(): string {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  for (const p of [".env.local", ".env"]) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/^FIRECRAWL_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("FIRECRAWL_API_KEY missing");
}
const [provider, capability, opts = "{}"] = process.argv.slice(2);
const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
  method: "POST",
  headers: { Authorization: `Bearer ${loadKey()}`, "Content-Type": "application/json", "x-request-id": crypto.randomUUID() },
  body: JSON.stringify({ alexandria: { provider, capability, options: JSON.parse(opts) }, origin: "election-warroom" }),
});
const body: any = await res.json();
console.log(JSON.stringify(body?.data?.alexandria?.[0] ?? body, null, 1));
