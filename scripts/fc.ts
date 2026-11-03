// Usage: bun scripts/fc.ts <METHOD> <path> ['<json body>']   e.g. bun scripts/fc.ts POST /v2/search '{"query":"x"}'
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
const [method, path, body] = process.argv.slice(2);
const res = await fetch(`https://api.firecrawl.dev${path}`, {
  method,
  headers: { Authorization: `Bearer ${loadKey()}`, "Content-Type": "application/json" },
  body: body ?? undefined,
});
console.log(JSON.stringify(await res.json().catch(() => ({ status: res.status })), null, 1));
