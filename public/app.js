const TILES = {
  AK: [0, 0], ME: [10, 0],
  WI: [5, 1], VT: [9, 1], NH: [10, 1],
  WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], MI: [6, 2], NY: [8, 2], MA: [9, 2],
  OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3], RI: [10, 3],
  CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4],
  AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5], DC: [8, 5],
  OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6],
  HI: [0, 7], TX: [3, 7], FL: [8, 7],
};
const POLL_MS = 3000;
const OFFICE_ORDER = { senate: 0, governor: 1, house: 2, statewide: 3, measure: 4 };

const S = {
  feeds: [], races: new Map(), markets: new Map(), marketHistory: {}, alerts: [], news: [], campaignMoney: {}, outsideMoney: [], incumbents: {},
  health: [], callLog: [], credits: { alexandria: 0, search: 0, scrape: 0, monitor: 0 }, nextResultsPollAt: 0, serverSkew: 0,
  sources: [], monitors: [], national: null, senateStates: new Set(), pollCloses: { states: {} },
  filters: { sev: "all", office: "all", state: "all", sort: "office", q: "", via: "all" },
  sound: false, notify: false, connected: false, booted: false,
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");
const fmtUsd = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};
const timeET = (t) => new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
const ago = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};
const partyClass = (p) => esc((p || "").toUpperCase());

// ---------- Clocks ----------
function tickClocks() {
  const now = new Date();
  $("clockET").textContent = now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
  $("clockUTC").textContent = now.toISOString().slice(11, 19);
  const next = S.nextResultsPollAt ? Math.max(0, Math.round((S.nextResultsPollAt - (Date.now() + S.serverSkew)) / 1000)) : null;
  $("nextPoll").textContent = next === null ? "--" : `${next}s`;
  document.querySelectorAll("[data-close]").forEach((el) => {
    const diff = new Date(el.dataset.close).getTime() - Date.now();
    el.textContent = diff > 0 ? `polls close in ${fmtDur(diff)}` : "polls closed";
  });
}
function fmtDur(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}
setInterval(tickClocks, 1000);

// ---------- Theme ----------
function syncThemeBtn() {
  const light = document.documentElement.dataset.theme === "light";
  $("themeBtn").textContent = light ? "☾ DARK" : "☀ LIGHT";
}
$("themeBtn").onclick = () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("warroom:theme:v1", next);
  } catch {}
  syncThemeBtn();
};
syncThemeBtn();

// ---------- Sound + notifications ----------
let audioCtx;
function beep(sev) {
  if (!S.sound) return;
  audioCtx ??= new AudioContext();
  const tones = sev === "critical" ? [880, 660, 880] : [740, 990];
  tones.forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "square";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime + i * 0.14);
    g.gain.exponentialRampToValueAtTime(0.06, audioCtx.currentTime + i * 0.14 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.14 + 0.12);
    o.connect(g).connect(audioCtx.destination);
    o.start(audioCtx.currentTime + i * 0.14);
    o.stop(audioCtx.currentTime + i * 0.14 + 0.13);
  });
}
$("soundBtn").onclick = () => {
  S.sound = !S.sound;
  $("soundBtn").classList.toggle("on", S.sound);
  $("soundBtn").textContent = S.sound ? "🔊 SOUND" : "🔇 SOUND";
  if (S.sound) beep("high");
};
$("notifyBtn").onclick = async () => {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") await Notification.requestPermission();
  S.notify = Notification.permission === "granted" && !S.notify;
  $("notifyBtn").classList.toggle("on", S.notify);
};

// ---------- Real-time feel ----------
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms));

function countTo(el, to, { dur = 900, fmt = fmtNum } = {}) {
  if (!el) return;
  const from = Number(el.dataset.v ?? 0);
  el.dataset.v = to;
  if (REDUCED || from === to) return void (el.textContent = fmt(to));
  if (from !== 0 || to !== 0) el.classList.remove("tick"), void el.offsetWidth, el.classList.add("tick");
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function bump(panelChild) {
  const p = (typeof panelChild === "string" ? $(panelChild) : panelChild)?.closest(".panel");
  if (!p) return;
  p.classList.remove("bump");
  void p.offsetWidth;
  p.classList.add("bump");
}

function edgeFlash(kind = "go") {
  const el = $("edgeFlash");
  el.className = "edge-flash";
  void el.offsetWidth;
  el.classList.add(kind);
}

function toast({ kind, sev = "medium", title, detail, at, onClick, life = 6500 }) {
  const box = $("toasts");
  const el = document.createElement("div");
  el.className = `toast ${sev}`;
  el.style.setProperty("--life", `${life}ms`);
  el.innerHTML = `<div class="tk"><span>${esc(kind)}</span><span>${at ? (Date.now() - at > 90_000 ? ago(at) : timeET(at)) : ""}</span></div><div class="tt">${esc(title)}</div>${detail ? `<div class="td">${esc(detail)}</div>` : ""}<div class="life"></div>`;
  let timer;
  const close = () => {
    clearTimeout(timer);
    el.classList.add("out");
    setTimeout(() => el.remove(), 350);
  };
  const arm = (ms) => (timer = setTimeout(close, ms));
  el.onmouseenter = () => clearTimeout(timer);
  el.onmouseleave = () => arm(2000);
  el.onclick = () => { onClick?.(); close(); };
  box.prepend(el);
  while (box.children.length > 5) box.lastElementChild.remove();
  arm(life);
}

function alertToast(a) {
  toast({
    kind: a.kind, sev: a.severity, title: a.title, detail: a.detail, at: a.at,
    life: a.severity === "critical" ? 12000 : 6500,
    onClick: () => {
      if (a.raceId && S.races.has(a.raceId)) openContest(S.races.get(a.raceId));
      else if (a.url) window.open(a.url, "_blank", "noopener");
    },
  });
}
function newsToast(n) {
  const who = n.source && n.via !== "web-monitor" ? n.source : n.domain;
  const label = { live: "LIVE BLOG", monitor: "MONITOR", "web-monitor": "WEB MONITOR" }[n.via] ?? "NEWSWIRE";
  toast({ kind: `${BREAKING.test(n.title) ? "BREAKING" : label} · ${who}`, sev: "news", title: n.title, at: n.firstSeen, onClick: () => window.open(n.url, "_blank", "noopener") });
}

// Live call blips + calls-per-minute sparkline, derived from the server's real call log.
const seenCalls = new Set();
const callTimes = [];
function callKey(c) { return `${c.at}|${c.requestId}`; }
function blip(c, delay = 0) {
  setTimeout(() => {
    const strip = $("pulseStrip");
    const el = document.createElement("span");
    el.className = `blip ${c.ok ? "" : "bad"} ${c.credits ? "paid" : ""}`;
    const what = c.provider === "firecrawl" ? c.capability.replace("/", " ") : `${c.provider.replace(/-com$|-gov$/, "").replace(/^results-enr-/, "")} ${c.capability.split("/").pop()}`;
    el.innerHTML = `<i>${c.ok ? "●" : "✕"}</i><b>${esc(what)}</b> ${c.ms}ms${c.ok ? "" : " ERR"}`;
    el.title = `${c.provider}/${c.capability} · request ${c.requestId ?? ""}`;
    strip.querySelector(".pulse-label").after(el);
    while (strip.children.length > 40) strip.lastElementChild.remove();
  }, delay);
}
function ingestCalls(log, { replay = false } = {}) {
  const fresh = log.filter((c) => !seenCalls.has(callKey(c)));
  fresh.forEach((c) => { seenCalls.add(callKey(c)); callTimes.push(c.at); });
  const order = fresh.slice().sort((a, b) => a.at - b.at);
  const show = replay ? order.slice(-14) : order;
  show.forEach((c, i) => blip(c, replay ? 900 + i * 120 : i * 90));
  if (fresh.length) {
    const pill = $("livePill");
    pill.classList.remove("beat");
    void pill.offsetWidth;
    pill.classList.add("beat");
  }
  drawSpark();
}
function drawSpark() {
  const cv = $("spark");
  const ctx = cv.getContext("2d");
  const now = Date.now() + S.serverSkew;
  const buckets = new Array(30).fill(0);
  for (const t of callTimes) {
    const i = Math.floor((now - t) / 10_000);
    if (i >= 0 && i < 30) buckets[29 - i]++;
  }
  while (callTimes.length && now - callTimes[0] > 300_000) callTimes.shift();
  const max = Math.max(1, ...buckets);
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const heat = getComputedStyle(document.documentElement).getPropertyValue("--heat").trim() || "#fa5d19";
  const bw = w / buckets.length;
  buckets.forEach((v, i) => {
    const bh = Math.max(1, (v / max) * (h - 2));
    ctx.fillStyle = heat;
    ctx.globalAlpha = i === buckets.length - 1 ? 1 : 0.35 + (i / buckets.length) * 0.5;
    ctx.fillRect(i * bw + 0.5, h - bh, bw - 1, bh);
  });
  ctx.globalAlpha = 1;
  const perMin = buckets.slice(-6).reduce((s, x) => s + x, 0);
  $("cpm").textContent = perMin;
}
setInterval(drawSpark, 2000);

let pollTarget = 0;
function armPollBar() {
  if (!S.nextResultsPollAt || S.nextResultsPollAt === pollTarget) return;
  pollTarget = S.nextResultsPollAt;
  const fill = $("pollbarFill");
  const remaining = Math.max(0, pollTarget - (Date.now() + S.serverSkew));
  fill.style.transition = "none";
  fill.style.width = "0%";
  void fill.offsetWidth;
  if (REDUCED) return;
  fill.style.transition = `width ${remaining}ms linear`;
  fill.style.width = "100%";
}

async function bootSequence(d) {
  const boot = $("boot");
  if (REDUCED) return boot.remove();
  let skip = false;
  boot.onclick = () => (skip = true);
  const log = $("bootLog");
  const live = d.feeds.filter((f) => f.status === "live");
  const providers = [...new Set(d.health.map((h) => h.provider))];
  const lines = [
    `> uplink api.firecrawl.dev/v2 ................ <span class="ok">OK</span>`,
    `> alexandria providers online: <span class="hl">${providers.length}</span>  ${esc(providers.join(", "))}`,
    `> results feeds live: <span class="hl">${live.map((f) => f.state).join(", ") || "none yet"}</span> · probing ${d.feeds.length - live.length} more`,
    `> races tracked: <span class="hl">${d.races.length}</span> · alerts: <span class="hl">${d.alerts.length}</span> · headlines: <span class="hl">${d.news.length}</span>`,
    `> polymarket markets: <span class="hl">${(d.markets ?? []).length}</span>${(d.markets ?? []).find((m) => m.role === "hero") ? ` · main market leader <span class="hl">${esc(d.markets.find((m) => m.role === "hero").outcomes[0].label)} ${(d.markets.find((m) => m.role === "hero").outcomes[0].price * 100).toFixed(1)}%</span>` : ""}`,
    `> watched sources: <span class="hl">${(d.sources ?? []).length}</span> · firecrawl monitors: <span class="hl">${(d.monitors ?? []).filter((m) => m.armed).length}</span> every 5 min · national senate board: <span class="hl">${d.national?.senate?.length ?? 0}</span> races`,
    `> fec filings loaded: <span class="hl">${d.outsideMoney.length}</span> · incumbents: <span class="hl">${Object.values(d.incumbents).flat().length}</span>`,
    `> arming alert engine ......................... <span class="ok">READY</span>`,
  ];
  let html = "";
  for (const l of lines) {
    if (skip) break;
    html += l + "\n";
    log.innerHTML = html + '<span class="cur"></span>';
    await new Promise((r) => setTimeout(r, 260));
  }
  if (!skip) await new Promise((r) => setTimeout(r, 450));
  boot.classList.add("done");
  setTimeout(() => boot.remove(), 600);
}

async function replayOnLoad() {
  const important = S.alerts.filter((a) => a.severity !== "system").slice(0, 4).reverse();
  const picks = important.length ? important : S.alerts.slice(0, 3).reverse();
  await sleep(500);
  for (const a of picks) {
    alertToast(a);
    if (a.severity === "critical") edgeFlash("go");
    await sleep(650);
  }
  for (const n of S.news.slice(0, 2).reverse()) {
    newsToast(n);
    await sleep(650);
  }
}

// ---------- Map + feeds ----------
function renderCloses() {
  const entries = Object.entries(S.pollCloses.states ?? {}).map(([st, iso]) => [st, new Date(iso).getTime()]);
  const upcoming = entries.filter(([, t]) => t > Date.now());
  const closedCount = entries.length - upcoming.length;
  const el = $("closes");
  if (!el) return;
  if (!entries.length) return void (el.textContent = "");
  if (!upcoming.length) {
    el.innerHTML = `All polls closed · <span class="muted">${esc(S.pollCloses.source ?? "")}</span>`;
    return;
  }
  const next = Math.min(...upcoming.map(([, t]) => t));
  const wave = upcoming.filter(([, t]) => t === next).map(([st]) => st).sort();
  el.innerHTML = `Next polls close <b>${timeET(next).slice(0, 5)} ET</b> <span data-close="${new Date(next).toISOString()}"></span> · <span class="hl">${wave.join(" ")}</span> · ${closedCount} closed · <span class="muted">${esc(S.pollCloses.source ?? "")}</span>`;
}
function renderMap() {
  const feeds = new Map(S.feeds.map((f) => [f.state, f]));
  const tiles = Object.entries(TILES).map(([st, [x, y]]) => {
    const f = feeds.get(st);
    const races = [...S.races.values()].filter((r) => r.state === st);
    const reporting = races.reduce((m, r) => (r.precinctsTotal > m.total ? { rep: r.precinctsReporting, total: r.precinctsTotal } : m), { rep: 0, total: 0 });
    const hasVotes = races.some((r) => r.totalVotes > 0);
    let cls = "";
    if (f?.status === "live") cls = hasVotes ? "live" : "armed";
    else if (f?.status === "error") cls = "err";
    const pct = reporting.total ? Math.round((reporting.rep / reporting.total) * 100) : null;
    const close = S.pollCloses.states?.[st];
    const closed = close && new Date(close).getTime() <= Date.now();
    const closeTxt = close ? ` · polls ${closed ? "closed" : "close"} ${timeET(close).slice(0, 5)} ET` : "";
    const title = (f ? `${f.name}: ${f.status}${f.error ? ` (${f.error})` : ""}` : `${st}: no statewide Alexandria results feed`) + closeTxt + (S.senateStates.has(st) ? " · Senate race" : "");
    return `<div class="tile ${cls} ${S.senateStates.has(st) ? "senate" : ""} ${closed ? "closed" : ""}" data-st="${st}" style="grid-column:${x + 1};grid-row:${y + 1}" title="${esc(title)}">${st}${f?.status === "live" && pct !== null ? `<span class="pct">${pct}%</span>` : ""}</div>`;
  });
  $("usmap").innerHTML = tiles.join("");
  $("usmap").querySelectorAll(".tile.live, .tile.armed").forEach((el) => (el.onclick = () => setStateFilter(el.dataset.st)));
  const live = S.feeds.filter((f) => f.status === "live");
  $("mapSummary").textContent = `${live.length} live feed${live.length === 1 ? "" : "s"} · ${S.races.size} races`;
  renderCloses();

  $("feeds").innerHTML = S.feeds
    .slice()
    .sort((a, b) => (a.status === "live" ? -1 : 1) - (b.status === "live" ? -1 : 1) || a.pollsCloseUtc.localeCompare(b.pollsCloseUtc))
    .map((f) => {
      const sub = f.status === "live"
        ? `${f.races} races · upload v${f.version ?? "?"}${f.lastPollAt ? ` · polled ${ago(f.lastPollAt)}` : ""}`
        : f.error ?? "probing…";
      return `<div class="feed" data-st="${f.state}"><span class="code">${f.state}</span><div><div class="st ${f.status}">${f.status.toUpperCase()} · <span data-close="${f.pollsCloseUtc}"></span></div><div class="sub">${esc(sub)}</div></div><span class="muted">${f.status === "live" ? "●" : "○"}</span></div>`;
    })
    .join("");
  $("feeds").querySelectorAll(".feed").forEach((el) => (el.onclick = () => setStateFilter(el.dataset.st)));

  const opts = ['<option value="all">All states</option>'].concat(live.map((f) => `<option value="${f.state}">${esc(f.name)}</option>`));
  const sel = $("stateFilter");
  const cur = sel.value;
  sel.innerHTML = opts.join("");
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "all";
  tickClocks();
}
function setStateFilter(st) {
  S.filters.state = st;
  $("stateFilter").value = st;
  renderRaces();
  $("races").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Alerts ----------
function alertHtml(a, isNew, i) {
  return `<li class="alert ${a.severity} ${isNew ? "new" : ""} ${i !== undefined ? "enter" : ""}" style="--i:${i ?? 0}" data-race="${esc(a.raceId ?? "")}" data-url="${esc(a.url ?? "")}">
    <div><time>${timeET(a.at)}</time><div class="kind">${esc(a.kind)}</div></div>
    <div><div class="title">${esc(a.title)}</div>${a.detail ? `<div class="detail">${esc(a.detail)}</div>` : ""}<div class="src">${esc(a.source)}${a.state ? ` · ${esc(a.state)}` : ""}</div></div>
  </li>`;
}
function renderAlerts(newId, enter = false) {
  const list = S.alerts.filter((a) => S.filters.sev === "all" || a.severity === S.filters.sev);
  $("alerts").innerHTML = list.slice(0, 150).map((a, i) => alertHtml(a, a.id === newId, enter && i < 25 ? i : undefined)).join("") || `<div class="empty">No alerts at this level yet.</div>`;
  countTo($("alertCount"), S.alerts.length);
  $("alerts").querySelectorAll(".alert").forEach((el) => {
    el.onclick = () => {
      if (el.dataset.race && S.races.has(el.dataset.race)) openContest(S.races.get(el.dataset.race));
      else if (el.dataset.url) window.open(el.dataset.url, "_blank", "noopener");
    };
  });
  const tick = S.alerts.filter((a) => a.severity !== "system").slice(0, 14);
  $("ticker").innerHTML = (tick.length ? tick : S.alerts.slice(0, 5))
    .map((a) => `<span class="${a.severity === "critical" ? "crit" : ""}"><b>${esc(a.kind)}</b>${esc(a.title)}</span>`)
    .join("");
}
$("alertFilter").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  S.filters.sev = b.dataset.sev;
  $("alertFilter").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  renderAlerts();
};
function onAlert(a) {
  S.alerts.unshift(a);
  S.alerts.length = Math.min(S.alerts.length, 400);
  renderAlerts(a.id);
  bump("alerts");
  if (S.booted && a.severity !== "system") alertToast(a);
  if (a.severity === "critical") edgeFlash("go");
  else if (a.severity === "high") edgeFlash("go-heat");
  if (a.severity === "critical" || a.severity === "high") {
    beep(a.severity);
    if (S.notify && document.hidden) new Notification(`${a.kind}: ${a.title}`, { body: a.detail ?? "" });
  }
}

// ---------- News ----------
const BREAKING = /\b(called|projected|projects|wins|won|defeats|concedes|recount|declared|flips)\b/i;
const VIA_LABEL = { live: "LIVE BLOG", monitor: "MONITOR", "web-monitor": "WEB MONITOR", search: "SEARCH" };
const viaGroup = (v) => (v === "web-monitor" ? "monitor" : v ?? "search");
function renderNews(freshIds = new Set(), enter = false) {
  const list = S.news.filter((n) => S.filters.via === "all" || viaGroup(n.via) === S.filters.via);
  $("news").innerHTML = list
    .slice(0, 120)
    .map((n, i) => `<li class="v-${esc(n.via ?? "search")} ${n.imageUrl ? "" : "nimg"} ${freshIds.has(n.id ?? n.url) ? "new" : ""} ${enter && i < 20 ? "enter" : ""}" style="--i:${i + 4}">
      <div>
        <div class="meta"><span class="via ${esc(n.via ?? "search")}">${VIA_LABEL[n.via] ?? "SEARCH"}</span><span class="dom">${esc(n.source && n.via !== "web-monitor" ? n.source : n.domain)}</span><span>${esc(n.date && n.date.length < 24 ? n.date : ago(n.firstSeen))}</span>${BREAKING.test(n.title) ? '<span class="brk">BREAKING</span>' : ""}</div>
        <a class="t" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>
        ${n.snippet ? `<div class="snip">${esc(n.snippet)}</div>` : ""}
      </div>
      ${n.imageUrl ? `<img src="${esc(n.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}
    </li>`)
    .join("") || `<div class="empty">${S.filters.via === "monitor" ? "Monitors report here when a watched page or web search finds something meaningful (checks run every 5 minutes)." : "Waiting for the first sweep…"}</div>`;
  countTo($("newsCount"), S.news.length);
  const by = { live: 0, monitor: 0, search: 0 };
  for (const n of S.news) by[viaGroup(n.via)] = (by[viaGroup(n.via)] ?? 0) + 1;
  $("nvLive").textContent = by.live;
  $("nvMon").textContent = by.monitor;
  $("nvSearch").textContent = by.search;
  renderNewsRate();
}
function renderNewsRate() {
  const now = Date.now() + S.serverSkew;
  const last15 = S.news.filter((n) => now - n.firstSeen < 15 * 60_000).length;
  const outlets = new Set(S.news.filter((n) => now - n.firstSeen < 60 * 60_000).map((n) => n.domain)).size;
  $("newsRate").innerHTML = `<b>${last15}</b> new items in the last 15 min · <b>${outlets}</b> outlets in the last hour · ${S.sources.length} watched pages`;
}
setInterval(renderNewsRate, 15_000);
$("newsFilter").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  S.filters.via = b.dataset.via;
  $("newsFilter").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  renderNews();
};

// ---------- National board ----------
function renderNational(prev) {
  const nat = S.national;
  if (!nat) return;
  const ctl = nat.control;
  const chamber = (label, t, seats, note) =>
    t
      ? `<div class="chamber"><div class="hh"><span class="D">DEM <b>${t.dem}</b></span><span>${label} · ${note} · ${seats - t.dem - t.rep} uncalled</span><span class="R"><b>${t.rep}</b> REP</span></div>
      <div class="tug"><div class="DEM" style="flex-grow:${t.dem}"></div><div style="flex-grow:${Math.max(0, seats - t.dem - t.rep)}"></div><div class="REP" style="flex-grow:${t.rep}"></div></div></div>`
      : "";
  $("natHouse").innerHTML = ctl
    ? chamber("US SENATE", ctl.senate, 100, `${ctl.senate?.target ?? 50} to tie, VP breaks it · includes seats not up`) + chamber("US HOUSE", ctl.house, 435, `${ctl.house?.target ?? 218} for majority`)
    : "";
  const prevMap = new Map((prev ?? []).map((r) => [r.state, r]));
  $("natSenate").innerHTML = nat.senate
    .map((r) => {
      const [a, b] = r.candidates;
      const lead = a && (a.votes > 0 || a.pct > 0) ? a.party : "";
      const called = !!r.winner || /project|winner|won|elected/i.test(r.status);
      const p = prevMap.get(r.state);
      const moved = p && (p.pctIn !== r.pctIn || p.status !== r.status || p.winner !== r.winner);
      const row = (c, isLead) => (c ? `<div class="nc ${isLead ? "lead" : ""}"><span>${esc(c.name)} <small class="muted">${esc(c.party[0] ?? "")}</small></span><span>${c.pct ? `${c.pct}%` : "—"}</span></div>` : "");
      return `<div class="ns ${lead} ${called ? "called" : ""} ${moved ? "flash" : ""}" title="${esc(r.status)}">
        <div class="nh"><b>${esc(r.state)}</b><span>${called ? `✓ ${esc(r.winner || "projected")}` : esc(r.status || "")}</span></div>
        ${row(a, !!lead)}${row(b, false)}
        <div class="nbar"><i style="width:${Math.min(100, r.pctIn || 0)}%"></i></div>
      </div>`;
    })
    .join("") || `<div class="empty">Scraping the national Senate board…</div>`;
  countTo($("natCount"), nat.senate.length);
  const counting = nat.senate.filter((r) => r.pctIn > 0).length;
  const called = nat.senate.filter((r) => r.winner || /project|winner|won|elected/i.test(r.status)).length;
  $("natMeta").textContent = `${nat.senate.length} Senate races · ${counting} counting · ${called} projected · scraped ${nat.senateAt ? ago(nat.senateAt) : "—"} from NBC News`;
}

// ---------- Watched sources + monitors ----------
function renderSources() {
  $("monitors").innerHTML = (S.monitors ?? [])
    .map((m) => {
      const lc = m.lastCheck;
      const sum = lc?.summary ? Object.entries(lc.summary).filter(([k, v]) => v && k !== "totalPages").map(([k, v]) => `${k} ${v}`).join(" · ") : "";
      const next = m.nextRunAt ? new Date(m.nextRunAt.replace(" ", "T").replace(/\+00$/, "Z")).getTime() : 0;
      return `<div class="mon"><div class="mh"><span>FIRECRAWL MONITOR · ${m.kind === "page" ? "PAGES" : "WEB SEARCH"}</span><span class="${m.error ? "bad" : "ok"}">● ${esc(m.error ? "ERROR" : (m.status ?? "starting").toUpperCase())}</span></div>
        <div class="mt">${m.kind === "page" ? "Live-blog pages, judged for meaningful updates" : "Always-on web search for new election reporting"}</div>
        <div class="mm">every 5 min · next check <b class="countdown" data-next="${next}">—</b> · checks seen <b>${m.checks}</b></div>
        <div class="mm">${lc ? `last check ${esc(lc.status)}${sum ? ` · ${esc(sum)}` : ""} · ${lc.alerts} alerts · ${lc.credits ?? 0} credits` : "waiting for the first check to finish…"}</div>
        ${m.error ? `<div class="mm" style="color:var(--crit)">${esc(m.error)}</div>` : ""}</div>`;
    })
    .join("");
  const srcs = S.sources ?? [];
  $("sources").innerHTML = srcs
    .slice()
    .sort((a, b) => (b.lastPostAt ?? 0) - (a.lastPostAt ?? 0))
    .map((s) => `<a class="src ${s.lastPostAt && Date.now() + S.serverSkew - s.lastPostAt < 60_000 ? "flash" : ""}" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.url)}">
      <div class="sh"><b>${esc(s.name)}</b><span class="tags">${s.monitored ? '<span class="tag mon">MONITOR</span>' : ""}${s.discovered ? '<span class="tag">FOUND</span>' : ""}${s.lastCheckStatus === "meaningful" ? '<span class="tag meaningful">UPDATED</span>' : ""}${s.error ? '<span class="tag err">ERR</span>' : ""}</span></div>
      <div class="sl">${esc(s.latest ?? (s.lastScrapeAt ? "No posts extracted yet" : "Queued for first scrape…"))}</div>
      <div class="sm">${s.posts} posts · scraped ${s.lastScrapeAt ? ago(s.lastScrapeAt) : "—"}${s.lastCheckAt ? ` · checked ${ago(s.lastCheckAt)}` : ""}</div>
    </a>`)
    .join("");
  countTo($("srcCount"), srcs.length);
  tickCountdowns();
}
function tickCountdowns() {
  document.querySelectorAll(".countdown").forEach((el) => {
    const t = Number(el.dataset.next);
    if (!t) return;
    const s = Math.round((t - (Date.now() + S.serverSkew)) / 1000);
    el.textContent = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "running…";
  });
}
setInterval(tickCountdowns, 1000);

// ---------- Races ----------
function raceHtml(r, prev, i) {
  const pct = r.precinctsTotal ? (r.precinctsReporting / r.precinctsTotal) * 100 : 0;
  const enter = i !== undefined;
  const prevPct = prev?.precinctsTotal ? (prev.precinctsReporting / prev.precinctsTotal) * 100 : 0;
  const prevChoice = (name) => prev?.choices.find((c) => c.name === name);
  const delta = prev && r.totalVotes > prev.totalVotes ? `<span class="delta">+${fmtNum(r.totalVotes - prev.totalVotes)} votes</span>` : "";
  const startW = (to, from) => (enter ? 0 : prev ? from : to);
  const winner = r.choices.find((c) => c.winner);
  const badge = winner
    ? `<span class="badge won">WINNER</span>`
    : r.marginPct !== null && r.marginPct < 2 && pct >= 50
      ? `<span class="badge tight">TIGHT</span>`
      : r.totalVotes > 0
        ? `<span class="badge counting">COUNTING</span>`
        : `<span class="badge">AWAITING</span>`;
  const top = r.choices.filter((c) => !/write-?in/i.test(c.name) || c.votes > 0).slice(0, 4);
  return `<article class="race ${enter ? "enter" : ""}" style="--i:${i ?? 0}" data-id="${esc(r.id)}">
    <div class="race-head"><div><div class="race-label">${esc(r.label)}${delta}</div><div class="race-name">${esc(r.name)}</div></div>${badge}</div>
    <div class="prog"><div data-w="${pct.toFixed(1)}" style="width:${startW(pct, prevPct).toFixed(1)}%"></div></div>
    <div class="prog-meta"><span>${fmtNum(r.precinctsReporting)}/${fmtNum(r.precinctsTotal)} precincts · ${pct.toFixed(0)}%</span><span><span data-to="${r.totalVotes}" data-from="${prev?.totalVotes ?? r.totalVotes}">${fmtNum(prev?.totalVotes ?? r.totalVotes)}</span> votes</span></div>
    ${top
      .map((c) => {
        const p = prevChoice(c.name);
        return `<div class="cand ${c.winner ? "win" : ""}">
        <div class="nm">${c.party ? `<span class="party ${partyClass(c.party)}">${esc(c.party)}</span>` : ""}<span class="n">${esc(c.name)}${c.winner ? " ✓" : ""}</span></div>
        <span class="v" data-to="${c.votes}" data-from="${p?.votes ?? c.votes}">${fmtNum(p?.votes ?? c.votes)}</span><span class="p">${c.percent.toFixed(1)}%</span>
        <div class="bar"><div class="${partyClass(c.party)}" data-w="${Math.min(100, c.percent)}" style="width:${startW(Math.min(100, c.percent), p?.percent ?? 0)}%"></div></div>
      </div>`;
      })
      .join("")}
    ${oddsLine(r)}
    <div class="race-foot"><span>${r.marginPct !== null ? `margin ${r.marginPct.toFixed(2)} pts` : "no votes yet"}</span><span>updated ${ago(r.updatedAt)} · v${esc(r.version)}</span></div>
  </article>`;
}
function oddsLine(r) {
  if (r.office !== "senate" && r.office !== "governor") return "";
  const m = marketForRace(r);
  if (!m || liveRaceFor(m)?.id !== r.id) return "";
  const parts = m.outcomes.slice(0, 2).map((o) => `${esc(o.label.replace(/\s*\(.\)$/, "").split(" ").pop())} <b>${(o.price * 100).toFixed(1)}%</b>`);
  return `<div class="odds"><span>POLYMARKET</span><span>${parts.join(" · ")}</span></div>`;
}
function filteredRaces() {
  const { office, state, sort, q } = S.filters;
  const qq = q.trim().toLowerCase();
  const list = [...S.races.values()].filter(
    (r) =>
      (office === "all" || r.office === office) &&
      (state === "all" || r.state === state) &&
      (!qq || r.label.toLowerCase().includes(qq) || r.name.toLowerCase().includes(qq) || r.choices.some((c) => c.name.toLowerCase().includes(qq))),
  );
  const rep = (r) => (r.precinctsTotal ? r.precinctsReporting / r.precinctsTotal : 0);
  const sorters = {
    office: (a, b) => OFFICE_ORDER[a.office] - OFFICE_ORDER[b.office] || a.state.localeCompare(b.state) || a.label.localeCompare(b.label, undefined, { numeric: true }),
    updated: (a, b) => b.updatedAt - a.updatedAt,
    margin: (a, b) => (a.marginPct ?? 999) - (b.marginPct ?? 999),
    reporting: (a, b) => rep(b) - rep(a),
  };
  return list.sort(sorters[sort]);
}
function renderRaces(flashIds = new Set(), prevMap = new Map(), enter = false) {
  const list = filteredRaces();
  countTo($("raceCount"), list.length);
  $("races").innerHTML = list.map((r, i) => raceHtml(r, prevMap.get(r.id), enter && i < 30 ? i : undefined)).join("") || `<div class="empty">No races match. Feeds connect as each state's Clarity site publishes its ${esc(S.electionDate ?? "")} election.</div>`;
  $("races").querySelectorAll(".race").forEach((el) => {
    if (flashIds.has(el.dataset.id)) el.classList.add("flash");
    el.onclick = () => openContest(S.races.get(el.dataset.id));
  });
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      $("races").querySelectorAll("[data-w]").forEach((el) => (el.style.width = `${el.dataset.w}%`));
      $("races").querySelectorAll("[data-to]").forEach((el) => {
        el.dataset.v = el.dataset.from;
        countTo(el, Number(el.dataset.to), { dur: 1400 });
      });
    }),
  );
}
$("officeFilter").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  S.filters.office = b.dataset.office;
  $("officeFilter").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  renderRaces();
};
$("stateFilter").onchange = (e) => { S.filters.state = e.target.value; renderRaces(); };
$("sortBy").onchange = (e) => { S.filters.sort = e.target.value; renderRaces(); };
$("search").oninput = (e) => { S.filters.q = e.target.value; renderRaces(); };

// ---------- Contest drill-down ----------
async function openContest(r) {
  if (!r) return;
  const modal = $("contestModal");
  $("modalTitle").textContent = r.label;
  $("modalSub").textContent = `${r.name} · loading county breakdown from Clarity ENR via Alexandria…`;
  const money = S.campaignMoney[r.id];
  $("modalBody").innerHTML = summaryTable(r) + (money ? moneyBlock(r, money) : "");
  growBars($("modalBody"));
  modal.showModal();
  try {
    const res = await fetch(`/api/contest?state=${r.state}&election_id=${r.electionId}&contest_id=${r.contestId}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? res.statusText);
    $("modalSub").innerHTML = `${esc(r.name)} · ${esc(d.area_level ?? "area")} breakdown · ${fmtNum(d.count ?? d.areas?.length ?? 0)} areas · <a href="${esc(d.source_url ?? r.resultsUrl)}" target="_blank" rel="noopener">source</a>`;
    $("modalBody").innerHTML = summaryTable(r) + areasTable(r, d) + (money ? moneyBlock(r, money) : "");
    growBars($("modalBody"));
  } catch (e) {
    $("modalSub").textContent = `${r.name} · breakdown unavailable: ${e.message}`;
  }
}
$("modalClose").onclick = () => $("contestModal").close();
$("contestModal").onclick = (e) => { if (e.target === $("contestModal")) $("contestModal").close(); };

function summaryTable(r) {
  return `<table><thead><tr><th>CANDIDATE</th><th>PARTY</th><th>VOTES</th><th>%</th></tr></thead><tbody>${r.choices
    .map((c, i) => `<tr><td class="${i === 0 && r.totalVotes ? "lead" : ""}">${esc(c.name)}${c.winner ? " ✓" : ""}</td><td>${esc(c.party ?? "—")}</td><td>${fmtNum(c.votes)}</td><td>${c.percent.toFixed(2)}</td></tr>`)
    .join("")}</tbody></table><div class="mnote">${fmtNum(r.precinctsReporting)}/${fmtNum(r.precinctsTotal)} precincts reporting · unofficial until certified</div><br/>`;
}
function areasTable(r, d) {
  const areas = d.areas ?? [];
  if (!areas.length) return `<div class="empty">No area-level data published yet.</div>`;
  const names = r.choices.filter((c) => !/write-?in/i.test(c.name)).slice(0, 4).map((c) => c.name);
  const votesFor = (a, name) => {
    const ch = (a.choices ?? []).find((c) => c.name === name);
    return ch ? Number(ch.votes ?? 0) : 0;
  };
  const rows = areas
    .map((a) => {
      const vals = names.map((n) => votesFor(a, n));
      const max = Math.max(...vals);
      const rep = a.precincts_reporting !== undefined ? `${a.precincts_reporting}/${a.precincts_total ?? "?"}` : "";
      return `<tr><td>${esc(a.name ?? a.area ?? "—")}</td><td>${esc(rep)}</td>${vals.map((v) => `<td class="${v && v === max ? "lead" : ""}">${fmtNum(v)}</td>`).join("")}<td>${fmtNum(a.total_votes ?? vals.reduce((s, x) => s + x, 0))}</td></tr>`;
    })
    .join("");
  return `<table><thead><tr><th>${esc((d.area_level ?? "AREA").toUpperCase())}</th><th>REPORTING</th>${names.map((n) => `<th>${esc(n.split(" ").slice(-1)[0].toUpperCase())}</th>`).join("")}<th>TOTAL</th></tr></thead><tbody>${rows}</tbody></table><br/>`;
}
function moneyBlock(r, rows) {
  const max = Math.max(...rows.map((x) => x.receipts), 1);
  return `<div class="money-race"><h3>CAMPAIGN MONEY · FEC 2026 CYCLE</h3>${rows.map((m) => moneyRow(m, max)).join("")}<div class="mnote">Bar = receipts, white tick = cash on hand · coverage through ${esc(rows[0]?.coverageEnd?.slice(0, 10) ?? "?")}</div></div>`;
}

// ---------- Money ----------
function moneyRow(m, max) {
  return `<div class="mrow" title="${esc(m.committeeName ?? "")}"><span class="mn">${m.party ? `<span class="party ${partyClass(m.party)}">${esc(m.party)}</span> ` : ""}${esc(m.candidate)}</span>
    <div class="mbar"><div class="${partyClass(m.party)}" data-w="${(m.receipts / max) * 100}" style="width:0%"></div><span style="left:${Math.min(100, (m.cashOnHand / max) * 100)}%"></span></div>
    <span class="mv">${fmtUsd(m.receipts)}</span></div>`;
}
function renderMoney() {
  const entries = Object.entries(S.campaignMoney)
    .map(([id, rows]) => ({ race: S.races.get(id), rows }))
    .filter((x) => x.race)
    .sort((a, b) => OFFICE_ORDER[a.race.office] - OFFICE_ORDER[b.race.office] || a.race.label.localeCompare(b.race.label, undefined, { numeric: true }));
  $("moneyCampaign").innerHTML = entries.length
    ? entries
        .map(({ race, rows }) => {
          const max = Math.max(...rows.map((x) => x.receipts), 1);
          return `<div class="money-race"><h3>${esc(race.label)}</h3>${rows.map((m) => moneyRow(m, max)).join("")}<div class="mnote">receipts · tick = cash on hand · through ${esc(rows[0]?.coverageEnd?.slice(0, 10) ?? "?")}</div></div>`;
        })
        .join("")
    : `<div class="empty">Matching ballot candidates to FEC committees…</div>`;
  const tracked = new Set(S.feeds.filter((f) => f.status === "live").map((f) => f.state));
  $("moneyOutside").innerHTML = S.outsideMoney.length
    ? S.outsideMoney
        .map((r) => `<div class="ie ${tracked.has(r.state) ? "tracked" : ""}">
          <div><span class="so ${r.supportOppose}">${r.supportOppose ? r.supportOppose.toUpperCase() : "—"}</span>${esc(r.candidate)} <span class="muted">${esc(r.state)}-${esc(r.office)} ${esc(r.party)}</span></div>
          <div class="amt">${fmtUsd(r.amount)}</div>
          <div class="sub">${esc(r.spender)} · ${esc(r.date)}${r.purpose ? ` · ${esc(r.purpose)}` : ""}${r.pdfUrl ? ` · <a href="${esc(r.pdfUrl)}" target="_blank" rel="noopener">filing</a>` : ""}</div>
        </div>`)
        .join("")
    : `<div class="empty">Loading independent expenditures…</div>`;
  growBars(document.querySelector(".money-panel") ?? $("moneyCampaign"));
}
function growBars(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll("[data-w]").forEach((el) => (el.style.width = `${el.dataset.w}%`))));
}
$("moneyTabs").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  $("moneyTabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  $("moneyCampaign").classList.toggle("hidden", b.dataset.tab !== "campaign");
  $("moneyOutside").classList.toggle("hidden", b.dataset.tab !== "outside");
};

// ---------- Prediction markets ----------
const pctTenths = (v) => `${(v / 10).toFixed(1)}%`;
const fmtVol = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);
const PARTY_COLOR = { DEM: "var(--dem)", REP: "var(--rep)", MIX: "var(--sys)", OTH: "var(--bar-neutral)" };
const marketPrev = new Map();

function chg(c) {
  if (c === null || c === undefined) return `<span class="chg">—</span>`;
  const pts = c * 100;
  if (Math.abs(pts) < 0.05) return `<span class="chg">0.0</span>`;
  return `<span class="chg ${pts > 0 ? "up" : "down"}" title="24h change, points">${pts > 0 ? "▲" : "▼"} ${Math.abs(pts).toFixed(1)}</span>`;
}
function pctEl(slug, o, cls = "pv") {
  return `<span class="${cls}" data-mk="${esc(`${slug}|${o.label}`)}" data-to="${Math.round(o.price * 1000)}">${pctTenths(Math.round(o.price * 1000))}</span>`;
}
function chartSvg(slug, outcomes) {
  const hist = S.marketHistory[slug] ?? {};
  const series = outcomes.slice(0, 4).map((o) => ({ o, pts: hist[o.label] ?? [[Date.now(), o.price]] }));
  const all = series.flatMap((s) => s.pts);
  const t0 = Math.min(...all.map((p) => p[0]));
  const t1 = Math.max(Date.now(), ...all.map((p) => p[0]));
  let lo = Math.min(...all.map((p) => p[1])) * 100;
  let hi = Math.max(...all.map((p) => p[1])) * 100;
  lo = Math.max(0, Math.floor(lo - 4));
  hi = Math.min(100, Math.ceil(hi + 4));
  const W = 300, H = 92, padL = 26, padB = 14;
  const x = (t) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - 4);
  const y = (p) => 4 + (1 - (p * 100 - lo) / Math.max(1, hi - lo)) * (H - padB - 6);
  const lines = series.map(({ o, pts }) => {
    const pp = pts.length === 1 ? [[t0, pts[0][1]], [t1, pts[0][1]]] : [...pts, [t1, pts[pts.length - 1][1]]];
    const d = pp.map(([t, p], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(p).toFixed(1)}`).join("");
    const [lt, lp] = pp[pp.length - 1];
    const color = PARTY_COLOR[o.party ?? "OTH"];
    return `<path d="${d}" fill="none" style="stroke:${color}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="${x(lt).toFixed(1)}" cy="${y(lp).toFixed(1)}" r="3" style="fill:${color}"><animate attributeName="r" values="3;5;3" dur="1.6s" repeatCount="indefinite"/></circle>`;
  });
  const grid = [hi, Math.round((hi + lo) / 2), lo].map((v) => `<line class="axis" x1="${padL}" x2="${W - 4}" y1="${y(v / 100)}" y2="${y(v / 100)}" stroke-dasharray="2 3"/><text x="0" y="${y(v / 100) + 3}">${v}%</text>`);
  return `<svg class="mk-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid.join("")}${lines.join("")}<text x="${padL}" y="${H - 2}">${timeET(t0).slice(0, 5)} ET</text><text x="${W - 34}" y="${H - 2}">now</text></svg>`;
}
function liveRaceFor(m) {
  if (!m.state) return null;
  const races = [...S.races.values()].filter((r) => r.state === m.state && r.office === m.office);
  return races.find((r) => /us senat|united states senat|governor/i.test(r.label + r.name)) ?? races[0] ?? null;
}
function marketForRace(r) {
  return [...S.markets.values()].find((m) => m.role === "race" && m.state === r.state && m.office === r.office) ?? null;
}
const lastName = (s) => s.replace(/\(.*?\)/g, "").split("/")[0].trim().split(/\s+/).pop()?.toLowerCase() ?? "";

function renderMarkets() {
  const all = [...S.markets.values()];
  $("mktCount").textContent = all.length;
  if (!all.length) return;
  const hero = all.find((m) => m.role === "hero");
  const controls = all.filter((m) => m.role === "control").sort((a, b) => a.title.localeCompare(b.title));
  const spread = (m) => (m.outcomes.length > 1 ? m.outcomes[0].price - m.outcomes[1].price : 1);
  const races = all.filter((m) => m.role === "race").sort((a, b) => spread(a) - spread(b));
  const total24 = all.reduce((s, m) => s + m.volume24h, 0);
  $("mktMeta").textContent = `Polymarket via Alexandria · ${fmtVol(total24)} traded in 24h · updated ${ago(Math.max(...all.map((m) => m.updatedAt)))}`;

  const heroHtml = hero
    ? (() => {
        const lead = hero.outcomes[0];
        return `<a class="mk-card mk-hero" href="${esc(hero.url)}" target="_blank" rel="noopener">
        <div class="mk-k"><span>Main market · ${esc(hero.title)}</span><span>${fmtVol(hero.volume)} volume</span></div>
        <div class="mk-big"><span class="lbl">${esc(lead.label)}</span>${pctEl(hero.slug, lead, "pct")}${chg(lead.change1d)}</div>
        <div class="mk-stack">${hero.outcomes.map((o) => `<div class="${o.party ?? "OTH"}" style="flex-grow:${o.price}" title="${esc(o.label)} ${(o.price * 100).toFixed(1)}%"></div>`).join("")}</div>
        <div class="mk-hero-body">
          <div class="mk-legend">${hero.outcomes.map((o) => `<div class="mk-row"><span class="sw ${o.party ?? "OTH"}"></span><span class="nm">${esc(o.label)}</span>${pctEl(hero.slug, o)}${chg(o.change1d)}</div>`).join("")}</div>
          ${chartSvg(hero.slug, hero.outcomes)}
        </div>
        <div class="mk-foot"><span>Implied probability = share price · 24h ${fmtVol(hero.volume24h)}</span><span>chart: ${S.historyAt ? "Polymarket price history, last 24h" : "since war room opened"}</span></div>
      </a>`;
      })()
    : "";

  const tug = (slug, outcomes) => {
    const d = outcomes.find((o) => o.party === "DEM");
    const r = outcomes.find((o) => o.party === "REP");
    if (!d || !r) return "";
    return { d, r, html: `<div class="tug"><div class="DEM" style="flex-grow:${d.price}"></div><div class="REP" style="flex-grow:${r.price}"></div></div>` };
  };
  const controlHtml = `<div class="mk-controls">${controls
    .map((m) => {
      const t = tug(m.slug, m.outcomes);
      if (!t) return "";
      return `<a class="mk-card" href="${esc(m.url)}" target="_blank" rel="noopener">
        <div class="mk-k"><span>${esc(m.title)}</span><span>${fmtVol(m.volume)}</span></div>
        <div class="tug-nums" style="margin-top:6px"><span class="l"><b data-mk="${esc(`${m.slug}|${t.d.label}`)}" data-to="${Math.round(t.d.price * 1000)}">${pctTenths(Math.round(t.d.price * 1000))}</b><small>DEM</small></span><span class="r"><small>REP</small> <b data-mk="${esc(`${m.slug}|${t.r.label}`)}" data-to="${Math.round(t.r.price * 1000)}">${pctTenths(Math.round(t.r.price * 1000))}</b></span></div>
        ${t.html}
        <div class="tug-nums"><span>${chg(t.d.change1d)}</span><span>${chg(t.r.change1d)}</span></div>
      </a>`;
    })
    .join("")}</div>`;

  const raceHtmlRows = `<div class="mk-races">${races
    .map((m) => {
      const [a, b] = m.outcomes;
      if (!a) return "";
      const left = a.party === "REP" && b?.party === "DEM" ? b : a;
      const right = left === a ? b : a;
      const live = liveRaceFor(m);
      const rep = live?.precinctsTotal ? Math.round((live.precinctsReporting / live.precinctsTotal) * 100) : 0;
      let count = "count: awaiting returns";
      if (live && live.totalVotes > 0) {
        const leader = live.choices[0];
        count = `count: <span class="hot">${esc(lastName(leader.name).replace(/^./, (c) => c.toUpperCase()))} +${(live.marginPct ?? 0).toFixed(1)}</span> · ${rep}% reporting`;
      } else if (live) count = `count: ${rep}% of precincts in · no votes yet`;
      return `<div class="mk-race" data-st="${esc(m.state)}" data-q="${esc(lastName(left.label))}" title="Open the live race board">
        <div class="top"><b>${esc(m.title.toUpperCase())}</b>${chg(left.change1d)}</div>
        <div class="names"><span>${esc(left.label)} <b data-mk="${esc(`${m.slug}|${left.label}`)}" data-to="${Math.round(left.price * 1000)}">${pctTenths(Math.round(left.price * 1000))}</b></span>${right ? `<span><b data-mk="${esc(`${m.slug}|${right.label}`)}" data-to="${Math.round(right.price * 1000)}">${pctTenths(Math.round(right.price * 1000))}</b> ${esc(right.label)}</span>` : ""}</div>
        <div class="tug"><div class="${left.party ?? "OTH"}" style="flex-grow:${left.price}"></div>${right ? `<div class="${right.party ?? "OTH"}" style="flex-grow:${right.price}"></div>` : ""}</div>
        <div class="vs">${count}</div>
      </div>`;
    })
    .join("")}</div>`;

  $("markets").innerHTML = heroHtml + controlHtml + raceHtmlRows;
  $("markets").querySelectorAll(".mk-race").forEach((el) => {
    el.onclick = () => {
      S.filters.q = el.dataset.q;
      $("search").value = el.dataset.q;
      setStateFilter(el.dataset.st);
    };
  });
  const prevSnap = new Map(marketPrev);
  $("markets").querySelectorAll("[data-mk]").forEach((el) => {
    const key = el.dataset.mk;
    const to = Number(el.dataset.to);
    const from = prevSnap.get(key);
    el.dataset.v = from ?? 0;
    if (from !== undefined && from !== to) el.classList.add(to > from ? "tickup" : "tickdown");
    countTo(el, to, { dur: from === undefined ? 1200 : 800, fmt: pctTenths });
    marketPrev.set(key, to);
  });
}

// ---------- Incumbents ----------
function renderIncumbents() {
  const all = Object.values(S.incumbents).flat();
  $("incumbents").innerHTML = all.length
    ? all
        .map((m) => `<div class="inc">
          <div class="inc-head"><a href="${esc(m.url)}" target="_blank" rel="noopener"><span class="party ${partyClass(m.party)}">${esc(m.party)}</span> ${esc(m.name)}</a><span class="muted">${esc(m.district)}</span></div>
          ${(m.votes ?? [])
            .map((v) => `<div class="vote"><span class="vv ${esc(String(v.vote).split(" ")[0])}">${esc(v.vote)}</span><div><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.bill)} ${esc(v.title)}</a><div class="vm">${esc(v.date)} · ${esc(v.result)}</div></div></div>`)
            .join("") || '<div class="muted">No recent roll calls.</div>'}
        </div>`)
        .join("")
    : `<div class="empty">Loading the delegations of the live states…</div>`;
}

// ---------- Health ----------
function renderHealth() {
  $("health").innerHTML = S.health
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((h) => `<div class="hc"><div class="hn"><b title="${esc(h.key)}">${esc(h.provider)}</b><span class="${h.ok ? "ok" : "bad"}">${h.ok ? "● OK" : "● ERR"}</span></div>
      <div class="hm">${esc(h.capability)} · ${h.calls} calls · ${h.errors} err · ${h.lastMs}ms</div>${!h.ok && h.lastError ? `<div class="he" title="${esc(h.lastError)}">${esc(h.lastError)}</div>` : ""}</div>`)
    .join("");
  $("calllog").innerHTML = S.callLog
    .map((c) => `<li class="${c.ok ? "" : "bad"}" title="request ${esc(c.requestId)}${c.note ? ` · ${esc(c.note)}` : ""}"><span>${timeET(c.at)}</span><span>${esc(c.provider)}/${esc(c.capability)}</span><span class="ms">${c.ms}ms</span><span>${c.ok ? (c.credits ? `${c.credits}cr` : "free") : "ERR"}</span></li>`)
    .join("");
  const c = S.credits;
  countTo($("credits"), (c.alexandria || 0) + (c.search || 0) + (c.scrape || 0) + (c.monitor || 0));
  $("credits").parentElement.title = `Alexandria ${c.alexandria || 0} · Search ${c.search || 0} · Scrape ${c.scrape || 0} · Monitor ${c.monitor || 0}`;
}

// ---------- Stream ----------
function applyMeta(m) {
  S.feeds = m.feeds;
  S.health = m.health;
  S.callLog = m.callLog;
  S.credits = m.credits;
  S.nextResultsPollAt = m.nextResultsPollAt;
  if (m.sources) S.sources = m.sources;
  if (m.monitors) S.monitors = m.monitors;
  if (m.serverTime) S.serverSkew = m.serverTime - Date.now();
  renderMap();
  renderHealth();
  renderSources();
  armPollBar();
  if (S.booted) ingestCalls(m.callLog);
}

// The server is polled rather than streamed so the same client works behind Vercel's CDN.
// Each poll is diffed against local state and fed through the same handlers.
function applySnapshot(d) {
  S.electionDate = d.electionDate;
  $("electionDate").textContent = d.electionDate;
  S.races = new Map(d.races.map((r) => [r.id, r]));
  S.alerts = d.alerts;
  S.news = d.news;
  S.campaignMoney = d.campaignMoney;
  S.outsideMoney = d.outsideMoney;
  S.incumbents = d.incumbents;
  S.markets = new Map((d.markets ?? []).map((m) => [m.slug, m]));
  S.marketHistory = d.marketHistory ?? {};
  S.national = d.national ?? null;
  S.moneyAt = d.moneyAt;
  S.historyAt = d.historyAt;
  applyShared(d);
  applyMeta(d);
  const first = !S.booted;
  const boot = first ? bootSequence(d) : Promise.resolve();
  return boot.then(() => {
    renderAlerts(undefined, first);
    renderNews(undefined, first);
    renderRaces(undefined, undefined, first);
    renderMoney();
    renderIncumbents();
    renderMarkets();
    renderNational();
    ingestCalls(d.callLog, { replay: first });
    S.booted = true;
    if (first) {
      document.querySelectorAll(".tile.live, .tile.armed").forEach((el, i) => setTimeout(() => el.classList.add("flash"), 200 + i * 120));
      replayOnLoad();
    }
  });
}

function applyShared(d) {
  S.senateStates = new Set(d.senateStates ?? []);
  S.pollCloses = d.pollCloses ?? { states: {} };
  S.paused = !!d.paused;
}

function onRaces(changed) {
  const ids = new Set();
  const prevMap = new Map();
  for (const r of changed) {
    const prev = S.races.get(r.id);
    if (prev) prevMap.set(r.id, prev);
    if (prev && (prev.totalVotes !== r.totalVotes || prev.precinctsReporting !== r.precinctsReporting)) ids.add(r.id);
    S.races.set(r.id, r);
  }
  renderRaces(ids, prevMap);
  renderMap();
  if (ids.size) bump("races");
  ids.forEach((id) => document.querySelector(`.tile[data-st="${id.split(":")[0]}"]`)?.classList.add("flash"));
}

function onNews(fresh) {
  S.news = [...fresh, ...S.news].slice(0, 400);
  renderNews(new Set(fresh.map((n) => n.id ?? n.url)));
  if (fresh.length) {
    bump("news");
    // Live-blog, monitor and breaking search items already raise an alert toast.
    fresh.filter((n) => (n.via ?? "search") === "search" && !BREAKING.test(n.title)).slice(0, 2).reverse().forEach((n, i) => setTimeout(() => newsToast(n), i * 700));
  }
}

function onNational(next) {
  const prev = S.national?.senate;
  S.national = next;
  renderNational(prev);
  bump("natSenate");
}

function onMarkets(markets) {
  const before = JSON.stringify([...S.markets.values()].map((m) => m.outcomes.map((o) => o.price)));
  for (const m of markets) {
    S.markets.set(m.slug, m);
    const hist = (S.marketHistory[m.slug] ??= {});
    for (const o of m.outcomes) {
      const series = (hist[o.label] ??= []);
      if (!series.length || series[series.length - 1][0] < m.updatedAt) series.push([m.updatedAt, o.price]);
    }
  }
  renderMarkets();
  if (JSON.stringify([...S.markets.values()].map((m) => m.outcomes.map((o) => o.price))) !== before) {
    bump("markets");
    renderRaces();
  }
}

function setLive(ok) {
  $("livePill").className = `live-pill ${ok ? "on" : "off"}`;
  $("liveText").textContent = ok ? (S.paused ? "PAUSED" : "LIVE") : "RECONNECTING";
}

async function getJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

const raceKey = (r) => `${r.totalVotes}|${r.precinctsReporting}|${r.version}|${r.choices.map((c) => `${c.votes}${c.winner ? "w" : ""}`).join(",")}`;

function applyLive(d) {
  applyShared(d);
  const seenAlerts = new Set(S.alerts.map((a) => a.id));
  d.alerts.filter((a) => !seenAlerts.has(a.id)).reverse().forEach((a) => onAlert(a));

  const seenNews = new Set(S.news.map((n) => n.id));
  const fresh = d.news.filter((n) => !seenNews.has(n.id));
  if (fresh.length) onNews(fresh);

  const changed = d.races.filter((r) => {
    const prev = S.races.get(r.id);
    return !prev || raceKey(prev) !== raceKey(r);
  });
  if (changed.length) onRaces(changed);

  const moved = d.markets.filter((m) => S.markets.get(m.slug)?.updatedAt !== m.updatedAt);
  if (moved.length) onMarkets(moved);

  if (d.national && d.national.senateAt !== S.national?.senateAt) onNational(d.national);

  applyMeta(d);
  if (d.historyAt !== S.historyAt || d.moneyAt !== S.moneyAt) refreshSlow();
}

let slowBusy = false;
async function refreshSlow() {
  if (slowBusy) return;
  slowBusy = true;
  try {
    const d = await getJson("/api/snapshot");
    if (d.historyAt !== S.historyAt) {
      S.marketHistory = d.marketHistory ?? {};
      S.historyAt = d.historyAt;
      renderMarkets();
    }
    if (d.moneyAt !== S.moneyAt) {
      S.campaignMoney = d.campaignMoney;
      S.outsideMoney = d.outsideMoney;
      S.incumbents = d.incumbents;
      S.moneyAt = d.moneyAt;
      renderMoney();
      renderIncumbents();
    }
  } catch {}
  slowBusy = false;
}

async function connect() {
  while (!S.booted) {
    try {
      await applySnapshot(await getJson("/api/snapshot"));
      setLive(true);
    } catch {
      setLive(false);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
  const poll = async () => {
    if (document.hidden) return setTimeout(poll, POLL_MS * 3);
    try {
      applyLive(await getJson("/api/live"));
      setLive(true);
    } catch {
      setLive(false);
    }
    setTimeout(poll, POLL_MS);
  };
  setTimeout(poll, POLL_MS);
}

setInterval(() => {
  document.querySelectorAll(".race-foot span:last-child").forEach((el) => {
    const id = el.closest(".race")?.dataset.id;
    const r = id && S.races.get(id);
    if (r) el.textContent = `updated ${ago(r.updatedAt)} · v${r.version}`;
  });
}, 10_000);

connect();
tickClocks();
