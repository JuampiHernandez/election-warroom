// Probe every state-level Clarity ENR site for a 2026-11-03 election.
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
const KEY = loadKey();
const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

async function probe(state: string) {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "x-request-id": crypto.randomUUID() },
    body: JSON.stringify({ alexandria: { provider: "results-enr-clarityelections-com", capability: "elections/list_elections", options: { state } }, origin: "election-warroom" }),
  });
  const body: any = await res.json().catch(() => ({}));
  const item = body?.data?.alexandria?.[0];
  if (item?.error) return `${state}\tERR\t${item.error.code}\t${String(item.error.message).slice(0, 80)}`;
  const els = item?.data?.elections ?? [];
  const today = els.find((e: any) => e.date === "2026-11-03");
  return `${state}\t${today ? "LIVE" : els.length ? "SITE" : "NONE"}\t${today ? `${today.election_id} ${today.name}` : els[0] ? `latest ${els[0].date} ${els[0].name}` : ""}`;
}

const out: string[] = [];
for (let i = 0; i < STATES.length; i += 8) {
  out.push(...(await Promise.all(STATES.slice(i, i + 8).map((s) => probe(s).catch((e) => `${s}\tFAIL\t${e.message}`)))));
}
console.log(out.join("\n"));
