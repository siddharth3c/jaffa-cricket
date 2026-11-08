/* Jaffa · the daily delivery. A cricket take on the daily-dive format. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- basics
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
    keys() { try { return Object.keys(localStorage).filter((k) => k.startsWith("jaffa:")); } catch (e) { return []; } },
  };

  const settings = Object.assign({ sound: true, contrast: false, motion: false }, store.get("jaffa:settings", {}));
  const reduceMotion = () => settings.motion || matchMedia("(prefers-reduced-motion: reduce)").matches;

  function toast(msg, ms = 1600) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), ms);
  }

  // seeded RNG
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffle(arr, rand = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---------------------------------------------------------------- sound
  const Sound = {
    ctx: null,
    get on() { return settings.sound !== false; },
    init() {
      if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    tone(f, dur = 0.08, type = "square", vol = 0.04, f2) {
      if (!this.on) return; this.init(); const c = this.ctx; if (!c) return;
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur = 0.2, vol = 0.15, freq = 1200, q = 0.7) {
      if (!this.on) return; this.init(); const c = this.ctx; if (!c) return;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(), t = c.currentTime;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + dur + 0.02);
    },
    click() { this.tone(660, 0.03, "square", 0.02); },
    tick() { this.tone(1250, 0.03, "square", 0.022); },
    bad() { this.tone(180, 0.18, "sawtooth", 0.05, 90); },
    good(tier) {
      const base = { p: 392, tc: 440, s: 523, g: 659, d: 784, j: 880 }[tier] || 392;
      this.tone(base, 0.09, "square", 0.04);
      setTimeout(() => this.tone(base * 1.5, 0.12, "square", 0.04), 90);
      if (tier === "d" || tier === "j") setTimeout(() => this.tone(base * 2, 0.22, "square", 0.04), 190);
    },
    whoosh() { this.noise(0.35, 0.06, 1800, 0.8); },
    thud() { this.tone(90, 0.12, "triangle", 0.12, 50); this.noise(0.08, 0.08, 400, 1); },
    crack() { this.noise(0.09, 0.6, 2600, 1.4); this.tone(240, 0.07, "triangle", 0.1, 120); },
    roar() { this.noise(1.8, 0.14, 700, 0.35); },
    pop() { this.noise(0.45, 0.45, 300, 0.5); this.tone(120, 0.3, "sawtooth", 0.08, 40); },
  };

  // ---------------------------------------------------------------- sprites
  const PAL = {
    r: "#d2232f", d: "#8e1420", w: "#f6efe0", h: "#ff9a9a", k: "#1a1a1a", o: "#4a2c1a", s: "#c98e63",
    c: "#d6cdb6", N: "#1f2d5a", g: "#9aa3ad", G: "#2d6bd1", P: "#ffffff", L: "#bdb6a3", S: "#f1e3c0",
    B: "#7a4a22", b: "#ecd39a", e: "#c7a565", H: "#3a2a1a", f: "#6b5a44", y: "#ffd34d", Y: "#ff8a00",
  };
  function rects(map, ox = 0, oy = 0) {
    let out = "";
    map.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        if (ch === "." || !PAL[ch]) { x++; continue; }
        let w = 1; while (row[x + w] === ch) w++;
        out += `<rect x="${x + ox}" y="${y + oy}" width="${w}" height="1" fill="${PAL[ch]}"/>`;
        x += w;
      }
    });
    return out;
  }
  const BALL = [
    "....dddd....", "..ddrrrrdd..", ".drrrrwrrhd.", ".drrrrwrrrd.", "drrrrrwrrrrd", "drrkkrwkkrrd",
    "drrkkrwkkrrd", "drrrrrwrrrrd", ".drrrrwrrrd.", ".drrrwrrrrd.", "..ddrrrrdd..", "....dddd....",
  ];
  const BOWLER = [
    "..........ss..", "..........ss..", ".........ww...", ".....oo..ww...", "....oooo.ww...", "....oooo.ww...",
    ".....ss..ww...", "...wwwwwwww...", "..wwwwwwwww...", ".wwwwwwwwww...", "ss.wwwwwwww...", "...wwwwwwww...",
    "...cccccccc...", "...wwwwwwww...", "...www..www...", "...www..www...", "...www..www...", "...www...www..",
    "...ww....www..", "...ww.....ww..", "..kkk.....kkk.",
  ];
  const BATTER = [
    ".....NNNNNN.....", "....NNNNNNNN....", "...NNNNNNNNNN...", "...NggggggggN...", "...NgsgsgsgsN...", "....gssssssg....",
    "......ssss......", "...wwwwwwwwww...", "..wwwwwwwwwwww..", "..wwwwwwwwwwww..", "..ww.wwwwww.ww..", "..ww.wwwwww.ww..",
    "...ww.wwww.ww...", "....wGGwwGGw....", "....wwGGGGww....", "....wwwwwwww....", "....PPP..PPP....", "....PLP..PLP....",
    "....PPP..PPP....", "....PLP..PLP....", "....PPP..PPP....", "....PLP..PLP....", "...kkkk..kkkk...",
  ];
  const BAT = [".HH.", ".HH.", ".HH.", ".HH.", "bbbe", "bbbe", "bbbe", "bbbe", "bbbe", "bbbe", "bbbe", "bbbe", "ebbe"];
  const STUMPS = [".BBBBBBB.", ".S..S..S.", ".S..S..S.", ".S..S..S.", ".S..S..S.", ".S..S..S.", ".S..S..S.", ".S..S..S.", ".S..S..S.", ".S..S..S.", ".S..S..S."];
  const svg = (w, h, inner, cls = "px") => `<svg class="${cls}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  const ballSVG = () => svg(12, 12, rects(BALL));
  const cherrySVG = (lit = true) => svg(16, 16,
    rects(BALL, 2, 4) + rects(["......ff", ".....f..", "....f...", "....f..."], 4, 0) + (lit ? rects(["y.Y.", ".yy.", "Y..y"], 10, 0) : ""));

  // ---------------------------------------------------------------- data + matching
  const PROMPTS = (window.JAFFA_PROMPTS || []).filter((p) => p && p.id && Array.isArray(p.answers));
  const BY_ID = Object.fromEntries(PROMPTS.map((p) => [p.id, p]));
  const TIERS = {
    p: { name: "Dot Ball", pts: 10, emoji: "⬜", air: 8 },
    tc: { name: "Too Clever", pts: 15, emoji: "🟪", air: 8 },
    s: { name: "Line & Length", pts: 30, emoji: "🟩", air: 9 },
    g: { name: "Googly", pts: 60, emoji: "🟨", air: 10 },
    d: { name: "Doosra", pts: 85, emoji: "🟧", air: 12 },
    j: { name: "Jaffa", pts: 100, emoji: "🟥", air: 16 },
    miss: { name: "Dead Ball", pts: 0, emoji: "⬛", air: 0 },
  };
  const TIER_ORDER = ["j", "d", "g", "s", "tc", "p"];
  const PACKS = {
    legends: { name: "Legends & Captains", blurb: "Greats, skippers and cult heroes." },
    grounds: { name: "Grounds & Geography", blurb: "Venues, cities and cricketing nations." },
    franchise: { name: "Franchise Leagues", blurb: "IPL, BBL, PSL, The Hundred and friends." },
    lingo: { name: "Lingo & Laws", blurb: "Deliveries, shots, fielders and dismissals." },
    history: { name: "Records & History", blurb: "Tournaments, eras and the record books." },
  };
  const tierBadge = (t) => `<span class="tier t-${t}">${esc(TIERS[t].name)}</span>`;

  function norm(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^(the|a|an) /, "");
  }
  const squash = (s) => norm(s).replace(/ /g, "");
  function variants(k) {
    const v = new Set([k]);
    if (k.length > 3) {
      if (k.endsWith("ies")) v.add(k.slice(0, -3) + "y");
      if (k.endsWith("es")) v.add(k.slice(0, -2));
      if (k.endsWith("s")) v.add(k.slice(0, -1));
    }
    return [...v];
  }
  const PERSON_RE = /player|captain|bowler|batter|batsman|batsmen|keeper|spinner|cricketer|commentator|all-rounder|allrounder|opener|skipper|quick|seamer|pacer|legend|umpire|coach|centur|twin|brother|knight|sir /i;
  const indexCache = new Map();
  function indexFor(p) {
    if (indexCache.has(p.id)) return indexCache.get(p.id);
    const idx = new Map();
    const add = (s, i) => { const k = squash(s); if (!k) return; for (const v of variants(k)) if (!idx.has(v)) idx.set(v, i); };
    p.answers.forEach((a, i) => { add(a[0], i); (a[2] || []).forEach((al) => add(al, i)); });
    if (PERSON_RE.test(p.text)) {
      const counts = new Map();
      const lastOf = (a) => { const w = norm(a[0]).split(" "); return w.length > 1 ? w[w.length - 1] : null; };
      p.answers.forEach((a) => { const l = lastOf(a); if (l) counts.set(l, (counts.get(l) || 0) + 1); });
      p.answers.forEach((a, i) => { const l = lastOf(a); if (l && l.length >= 4 && counts.get(l) === 1 && !idx.has(l)) idx.set(l, i); });
    }
    indexCache.set(p.id, idx);
    return idx;
  }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && i > 1 && j > 1) cur[j] = Math.min(cur[j], prev[j - 2] + 1);
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function matchAnswer(p, input) {
    const k = squash(input);
    if (!k) return null;
    const idx = indexFor(p);
    for (const v of variants(k)) if (idx.has(v)) return { i: idx.get(v), a: p.answers[idx.get(v)] };
    if (k.length < 5) return null;
    const max = k.length >= 9 ? 2 : 1;
    let best = null, bestD = max + 1;
    for (const [key, i] of idx) {
      if (key.length < 4) continue;
      const d = lev(k, key, max);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best == null ? null : { i: best, a: p.answers[best] };
  }
  function revealInfo(p, yourIdx) {
    const r = rng(hash(p.id));
    const ans = p.answers.map((a, i) => ({ name: a[0], t: a[1], i })).filter((x) => x.i !== yourIdx);
    const jaffa = p.answers.find((a) => a[1] === "j");
    const rare = shuffle(ans.filter((x) => x.t === "d" || x.t === "g"), r).slice(0, 3);
    const common = ans.filter((x) => x.t === "p").slice(0, 4);
    return { jaffa: jaffa ? jaffa[0] : null, rare, common, total: p.answers.length };
  }

  // ---------------------------------------------------------------- calendar
  const EPOCH = Date.UTC(2026, 9, 9); // delivery #1 = 9 Oct 2026
  const DAY = 864e5;
  const todayN = () => Math.floor((Date.now() - EPOCH) / DAY) + 1;
  const dateOfN = (n) => new Date(EPOCH + (n - 1) * DAY);
  const fmtDate = (n) => dateOfN(n).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const BALLS = 7;
  function dailyIds(n) {
    const ids = PROMPTS.map((p) => p.id).sort();
    const per = Math.min(BALLS, ids.length);
    const cycleLen = Math.max(1, Math.floor(ids.length / per));
    const cycle = Math.floor((n - 1) / cycleLen), pos = (n - 1) % cycleLen;
    const order = shuffle(ids, rng(7919 + cycle * 104729));
    return order.slice(pos * per, pos * per + per);
  }
  function untilNext() {
    const ms = EPOCH + todayN() * DAY - Date.now();
    const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
    return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
  }

  // ---------------------------------------------------------------- world
  const PITCH = 20.12, PX = 200, TOP = 860;
  const yOf = (d) => TOP + d * PX;
  const POP_FAR = 18.9;
  const CONTACT = 18.55;
  const PARK_MAX = 18.2;
  const WORLD_H = Math.round(yOf(PITCH) + 820);
  const HAND_Y = yOf(0) - 108;
  const ZONES = [
    [20.12, "THE STUMPS"], [17, "YORKER"], [13, "FULL"], [9, "GOOD LENGTH"], [5, "SHORT"], [0.6, "LONG HOP"], [0, "RELEASE"],
  ];
  const zoneOf = (d) => (ZONES.find(([m]) => d >= m - 1e-9) || ZONES[ZONES.length - 1])[1];
  const MARKERS = [
    [0, "── release point: the ball leaves the hand"],
    [0.6, "the seam is bolt upright ──"],
    [1.6, "── conventional swing starts to bite"],
    [2.6, "at 140 km/h this took 0.07 seconds ──"],
    [3.6, "── LONG HOP TERRITORY", true],
    [4.6, "batters lick their lips ──"],
    [5.4, "── SHORT: chin music lives here", true],
    [6.4, "the hook shot is loaded ──"],
    [7.6, "── the ball is now at head height"],
    [8.6, "short of a length: back-foot country ──"],
    [9.6, "── GOOD LENGTH", true],
    [10.6, "the corridor of uncertainty ──"],
    [11.6, "── edges fly to the slips from here"],
    [12.4, "the batter has 0.2s left to decide ──"],
    [13.4, "── FULL: tempting the cover drive", true],
    [14.4, "half-volley heaven ──"],
    [15.4, "── reverse swing hooks in late"],
    [16.4, "the off stump starts to sweat ──"],
    [17.4, "── THE YORKER ZONE", true],
    [18.0, "toe-crushers land here ──"],
    [18.9, "── the popping crease"],
    [20.12, "the stumps: a perfect delivery ends here ──", true],
  ];

  const world = $("#world");
  let ballEl, trailEl, batterEl, shoutEl;
  const ballPos = { x: 0, y: HAND_Y, rot: 0, scale: 1, d: 0 };

  function crowdRects(n, w, h, seed) {
    const r = rng(seed); let out = "";
    const cols = ["#e2283b", "#f4ecd6", "#2d6bd1", "#ffd34d", "#5bd06a", "#ff9a3c", "#b48cff", "#7ee3d0"];
    for (let i = 0; i < n; i++) out += `<i style="left:${(r() * 100).toFixed(2)}%;top:${Math.floor(r() * (h - 10))}px;background:${cols[Math.floor(r() * cols.length)]};opacity:${(0.35 + r() * 0.5).toFixed(2)}"></i>`;
    return out;
  }
  function buildWorld() {
    const r = rng(42);
    let stars = "";
    for (let i = 0; i < 40; i++) stars += `<i style="left:${(r() * 100).toFixed(1)}%;top:${Math.floor(r() * 300)}px;opacity:${(0.3 + r() * 0.6).toFixed(2)}"></i>`;
    let specks = "";
    const pitchTop = yOf(-1.22) - 160, pitchBot = yOf(PITCH) + 150;
    for (let i = 0; i < 160; i++) specks += `<i class="speck" style="left:${(r() * 96).toFixed(1)}%;top:${Math.floor(r() * (pitchBot - pitchTop))}px"></i>`;
    const markers = MARKERS.map(([d, text, big], i) => {
      const side = text.startsWith("──") ? "r" : "l";
      return `<div class="tick" style="top:${yOf(d)}px"></div><div class="marker ${side}${big ? " big" : ""}" data-d="${d}" style="top:${yOf(d)}px">${esc(text)}</div>`;
    }).join("");
    const S = 5;
    world.style.height = WORLD_H + "px";
    world.innerHTML = `
      <div class="outfield" style="top:${TOP - 470}px"></div>
      <div class="sky" style="height:${TOP - 330}px"><div class="stars">${stars}</div></div>
      <div class="crowd" style="top:${TOP - 470}px;height:90px;bottom:auto;background:#1b1530">${crowdRects(260, 100, 90, 7)}</div>
      <div class="rope" style="top:${TOP - 382}px"></div>
      <div class="pitch" style="top:${pitchTop}px;height:${pitchBot - pitchTop}px">${specks}
        <div class="crease" style="top:${yOf(-1.22) - pitchTop}px"></div>
        <div class="crease" style="top:${yOf(0) - pitchTop}px"></div>
        <div class="crease" style="top:${yOf(POP_FAR) - pitchTop}px"></div>
        <div class="crease" style="top:${yOf(PITCH) - pitchTop}px"></div>
      </div>
      ${markers}
      <div class="title-block" style="top:${innerWidth <= 480 ? 150 : 110}px">
        <h1 class="logo">JAFFA</h1>
        <div class="subtitle">the daily delivery</div>
        <div class="tagline">${BALLS} prompts · 25 seconds each · rarer answers travel further</div>
        <details class="howto"><summary>how to play</summary>
          <div class="box">
            <ol>
              <li>Every day everyone gets the same ${BALLS} cricket prompts.</li>
              <li>Type any valid answer before the 25-second timer runs out. Wrong guesses cost 2 seconds.</li>
              <li>Rarer answers score more and carry the ball further down the pitch.</li>
              <li>After ball ${BALLS}, the delivery reaches the batter. The further it got, the better your ball: a long hop gets smashed, a yorker barely gets dug out.</li>
            </ol>
            <div class="tierlist">${TIER_ORDER.map((t) => `${tierBadge(t)}<span class="muted">${{ j: "one perfect answer per prompt", d: "deep cut for true nerds", g: "rare, needs real knowledge", s: "solid fan pick", tc: "the 'obscure' pick everyone thinks of", p: "the obvious answer" }[t]}</span><span>${TIERS[t].pts}</span>`).join("")}</div>
          </div>
        </details>
      </div>
      <div class="sprite" style="left:calc(50% - ${4.5 * S}px);top:${yOf(-1.22) - 55}px;width:${9 * S}px;height:${11 * S}px">${svg(9, 11, rects(STUMPS))}</div>
      <div class="sprite" id="bowler" style="left:calc(50% - ${10.5 * S}px);top:${yOf(0) - 108}px;width:${14 * S}px;height:${21 * S}px">${svg(14, 21, rects(BOWLER))}</div>
      <div class="sprite" style="left:calc(50% - ${4.5 * S}px);top:${yOf(PITCH) - 30}px;width:${9 * S}px;height:${11 * S}px;z-index:5">${svg(9, 11, rects(STUMPS))}</div>
      <div class="sprite" id="batter" style="left:calc(50% - ${8 * S}px);top:${yOf(19.45) - 23 * S}px;width:${16 * S}px;height:${28 * S}px">
        ${svg(16, 28, rects(BATTER) + `<g class="bat">${rects(BAT, 6, 14)}</g>`)}
      </div>
      <div class="trail" id="trail" style="height:0"></div>
      <div id="ball">${ballSVG()}<div class="say" id="ballSay">howzat!</div></div>
      <div class="shout" id="shout"></div>
      <div class="rope" style="top:${yOf(PITCH) + 430}px"></div>
      <div class="crowd" style="top:${yOf(PITCH) + 440}px;height:${WORLD_H - yOf(PITCH) - 440}px">${crowdRects(420, 100, WORLD_H - yOf(PITCH) - 440, 9)}</div>
      <div class="footer" style="top:${WORLD_H - 150}px">
        <div class="box" style="display:inline-block;padding:8px 14px">Jaffa · a cricket take on the daily-dive format of <a href="https://krillion.io" target="_blank" rel="noopener">krillion.io</a>. Not affiliated.<br>Your progress stays in this browser. <a href="#/faq">FAQ</a></div>
      </div>`;
    ballEl = $("#ball"); trailEl = $("#trail"); batterEl = $("#batter"); shoutEl = $("#shout");
    setBall(0, HAND_Y);
  }
  function setBall(x, y, rot = ballPos.rot, scale = 1, opacity = 1) {
    Object.assign(ballPos, { x, y, rot, scale });
    ballEl.style.transform = `translate(${x}px, ${y}px)`;
    ballEl.firstElementChild.style.transform = `rotate(${rot}deg) scale(${scale})`;
    ballEl.style.opacity = opacity;
    ballEl.style.top = "0px";
  }
  const swayAt = (d) => Math.sin(d * 0.42) * Math.min(26, innerWidth * 0.05);
  function camTo(y, smooth = false) {
    const target = Math.max(0, y - innerHeight * 0.32);
    window.scrollTo({ top: target, behavior: smooth && !reduceMotion() ? "smooth" : "auto" });
  }
  function animate(dur, fn) {
    if (reduceMotion()) dur = Math.min(dur, 60);
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = clamp((now - t0) / dur, 0, 1);
        fn(t);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }
  function updateMarkers(d) { $$(".marker", world).forEach((m) => m.classList.toggle("reached", +m.dataset.d <= d + 1e-6 && d > 0)); }
  function parkY(d) { return yOf(Math.min(d, PARK_MAX)); }
  function placeBallAt(d, follow = true) {
    ballPos.d = d;
    setBall(swayAt(d), parkY(d), d * 90);
    trailEl.style.height = "0px";
    updateMarkers(d);
    if (follow) camTo(parkY(d));
  }
  let tweenToken = 0;
  async function moveBall(fromD, toD, dur = 1300, follow = true) {
    const my = ++tweenToken;
    if (toD > fromD + 0.01) Sound.whoosh();
    const y0 = parkY(fromD);
    await animate(dur, (t) => {
      if (my !== tweenToken) return;
      const e = easeInOut(t);
      const d = lerp(fromD, toD, e);
      const y = parkY(d);
      setBall(swayAt(d), y, d * 90);
      trailEl.style.top = Math.min(y0, y) + "px";
      trailEl.style.height = Math.max(0, y - y0) * (1 - t * 0.6) + "px";
      trailEl.style.transform = `translateX(${swayAt(d)}px)`;
      hud.dist(d);
      if (follow) camTo(y);
    });
    if (my !== tweenToken) return;
    ballPos.d = toD;
    trailEl.style.height = "0px";
    updateMarkers(toD);
  }
  function say(text, ms = 1400) {
    const el = $("#ballSay"); if (!el) return;
    el.textContent = text; el.classList.add("show");
    clearTimeout(say._t); say._t = setTimeout(() => el.classList.remove("show"), ms);
  }
  function puffAt(y) {
    const p = document.createElement("div"); p.className = "puff"; p.style.top = y + "px";
    p.style.transform = `translateX(${ballPos.x}px)`;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      p.insertAdjacentHTML("beforeend", `<i style="left:40px;top:15px;--dx:${Math.cos(a) * 40}px;--dy:${Math.sin(a) * 18}px"></i>`);
    }
    world.appendChild(p); setTimeout(() => p.remove(), 1000);
    const m = document.createElement("div"); m.className = "pitchmark"; m.style.top = y + "px"; m.style.transform = `translateX(${ballPos.x}px)`; m.dataset.mark = "1";
    world.appendChild(m);
  }
  function clearMarks() { $$("[data-mark]", world).forEach((m) => m.remove()); }
  function shout(text, y) {
    shoutEl.textContent = text; shoutEl.style.top = y + "px";
    shoutEl.classList.remove("go"); void shoutEl.offsetWidth; shoutEl.classList.add("go");
  }
  function resetBatter() { batterEl.classList.remove("backlift", "swing"); }

  // ---------------------------------------------------------------- HUD
  const hud = {
    dist(d) { $("#hudDist").textContent = d.toFixed(2) + "m"; $("#hudZone").textContent = zoneOf(d); },
    score(s) { $("#hudScore").textContent = s; },
    ball(text) { $("#hudBall").innerHTML = text || "&nbsp;"; },
    set(d, s, b) { this.dist(d); this.score(s); this.ball(b); },
  };
  function soundIcon() {
    $("#soundBtn").innerHTML = settings.sound
      ? `<svg class="px" viewBox="0 0 20 20" fill="currentColor"><path d="M2 7h4l5-4v14l-5-4H2z M13 7h2v6h-2z M16 5h2v10h-2z"/></svg>`
      : `<svg class="px" viewBox="0 0 20 20" fill="currentColor"><path d="M2 7h4l5-4v14l-5-4H2z M13 7h2v2h-2z M17 7h2v2h-2z M15 9h2v2h-2z M13 11h2v2h-2z M17 11h2v2h-2z"/></svg>`;
    $("#soundBtn").setAttribute("aria-pressed", settings.sound ? "true" : "false");
  }
  function saveSettings() {
    store.set("jaffa:settings", settings);
    document.documentElement.classList.toggle("contrast", !!settings.contrast);
    document.documentElement.classList.toggle("reduce-motion", !!settings.motion);
    soundIcon();
  }

  // ---------------------------------------------------------------- stats
  const BANDS = [
    { key: "LONG HOP", min: 0, call: "SIX!", line: "Long hop. Dispatched over cow corner." },
    { key: "SHORT", min: 5, call: "FOUR!", line: "Short and wide. Pulled hard through square leg." },
    { key: "GOOD LENGTH", min: 9, call: "TWO", line: "Good length. Pushed into the gap at cover." },
    { key: "FULL", min: 13, call: "ONE", line: "Full and swinging. Squeezed out to third man." },
    { key: "YORKER", min: 17, call: "DOT", line: "Yorker! Dug out at the very last moment." },
    { key: "JAFFA", min: 99, call: "DOT", line: "Unplayable. The batter barely got bat on it." },
  ];
  function bandOf(d, perfect) {
    if (perfect) return BANDS[5];
    let b = BANDS[0];
    for (const x of BANDS.slice(0, 5)) if (d >= x.min) b = x;
    return b;
  }
  const getStats = () => Object.assign({ played: 0, streak: 0, maxStreak: 0, best: 0, last: 0, hist: {}, tiers: {} }, store.get("jaffa:stats", {}));
  function recordDaily(n, st) {
    const stats = getStats();
    if (stats.hist[n]) return stats;
    const pts = st.results.reduce((a, r) => a + r.pts, 0);
    const d = distFor(pts, st.ids.length);
    stats.hist[n] = { p: pts, d: +d.toFixed(2), t: st.results.map((r) => r.tier).join(","), at: Date.now() };
    stats.played++;
    stats.best = Math.max(stats.best, pts);
    st.results.forEach((r) => { stats.tiers[r.tier] = (stats.tiers[r.tier] || 0) + 1; });
    if (n === todayN()) {
      stats.streak = stats.last === n - 1 ? stats.streak + 1 : 1;
      stats.last = n;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    }
    store.set("jaffa:stats", stats);
    return stats;
  }
  const distFor = (pts, balls) => clamp((pts / (balls * 100)) * PITCH, 0, PITCH);

  // ---------------------------------------------------------------- dock
  const dock = $("#dock");
  function setDock(html) { dock.innerHTML = html; }
  function pipsHTML(st, cur) {
    return `<div class="pips">${st.ids.map((_, i) => { const r = st.results[i]; return `<i class="${r ? "t-" + r.tier : i === cur ? "cur" : ""}"></i>`; }).join("")}</div>`;
  }

  function renderHome() {
    stopRunTimers();
    RUN = null;
    const n = todayN();
    const st = store.get("jaffa:d:" + n);
    const pts = st ? st.results.reduce((a, r) => a + r.pts, 0) : 0;
    const d = st ? distFor(pts, st.ids.length) : 0;
    resetBatter(); clearMarks();
    if (st && st.results.length) { placeBallAt(d, false); hud.set(d, pts, `BALL ${Math.min(st.results.length + (st.phase === "done" ? 0 : 1), BALLS)}/${BALLS}`); }
    else { setBall(0, HAND_Y, 0); ballPos.d = 0; updateMarkers(0); hud.set(0, 0, ""); }
    window.scrollTo({ top: 0 });
    let label = "▼ START YOUR RUN-UP ▼", sub = `DELIVERY #${n} · ${fmtDate(n)}`;
    if (st && st.phase === "done") { label = `TODAY: ${pts} PTS · SEE RESULT`; sub = `DELIVERY #${n} · next delivery in <span data-countdown>${untilNext()}</span>`; }
    else if (st && (st.results.length || st.phase === "reveal")) label = `▼ RESUME BALL ${Math.min(st.results.length + (st.phase === "reveal" ? 0 : 1), BALLS)} ▼`;
    setDock(`
      <a class="box party-card" href="#/party">
        <span class="badge">LIVE · MULTIPLAYER</span>
        ${cherrySVG()}
        <span class="name">CHERRY BOMB</span>
        <span class="meta">pass the ball<br>before it pops</span>
      </a>
      <button class="btn primary begin" id="beginBtn" type="button">${label}</button>
      <div class="dock-row">
        <div class="num">${sub}</div>
        <a class="btn small" href="#/archive">ARCHIVE ⟲</a>
        <a class="btn small" href="#/packs">THEMED PACKS</a>
        <a class="btn small" href="#/unlimited">UNLIMITED ∞</a>
      </div>`);
    $("#beginBtn").onclick = () => { Sound.click(); location.hash = st && st.phase === "done" ? "#/result/" + n : "#/play"; };
    tickCountdowns();
    if (!st) setTimeout(() => { if (!RUN) say(["howzat!", "bowl me!", "shine me up", "new ball!"][Math.floor(Math.random() * 4)]); }, 900);
  }

  // ---------------------------------------------------------------- runs (daily / archive / pack)
  const ROUND_MS = 25000, PENALTY_MS = 2000;
  let RUN = null;
  let timerRAF = 0, lastTickSec = -1, saveT = 0;

  function stopRunTimers() { cancelAnimationFrame(timerRAF); timerRAF = 0; if (RUN && RUN.deadline) { RUN.st.remaining = Math.max(0, RUN.deadline - performance.now()); saveRun(); RUN.deadline = 0; } }
  function saveRun() { if (RUN) store.set(RUN.cfg.key, RUN.st); }
  const runPts = (st) => st.results.reduce((a, r) => a + r.pts, 0);

  async function startRun(cfg) {
    closePage(true);
    stopRunTimers();
    let st = store.get(cfg.key);
    if (cfg.fresh || !st || !Array.isArray(st.ids) || (cfg.ids && st.ids.join() !== cfg.ids.join())) {
      st = { ids: cfg.ids, results: [], phase: "prompt", remaining: ROUND_MS, startedAt: Date.now() };
    }
    st.ids = st.ids.filter((id) => BY_ID[id]);
    if (!st.ids.length) { toast("No prompts available."); location.hash = "#/"; return; }
    RUN = { cfg, st, deadline: 0 };
    saveRun();
    resetBatter(); clearMarks();
    const pts = runPts(st);
    if (st.phase === "done") { placeBallAt(distFor(pts, st.ids.length)); showResults(); return; }
    if (!st.results.length && st.phase === "prompt") {
      hud.set(0, 0, `BALL 1/${st.ids.length}`);
      camTo(HAND_Y);
      setDock("");
      Sound.whoosh();
      const my = ++tweenToken;
      await animate(700, (t) => { if (my === tweenToken) setBall(0, lerp(HAND_Y, yOf(0), easeIn(t)), t * 360); });
      ballPos.d = 0; camTo(yOf(0));
      if (RUN && RUN.st === st) showPrompt();
    } else {
      placeBallAt(distFor(pts, st.ids.length));
      hud.set(ballPos.d, pts, `BALL ${Math.min(st.results.length + 1, st.ids.length)}/${st.ids.length}`);
      if (st.phase === "reveal") showReveal(); else showPrompt();
    }
  }

  function showPrompt() {
    const { st, cfg } = RUN;
    const i = st.results.length;
    const p = BY_ID[st.ids[i]];
    hud.set(ballPos.d, runPts(st), `BALL ${i + 1}/${st.ids.length}`);
    setDock(`<div class="box">
      <div class="prompt-head"><span>${esc(cfg.label)} · BALL ${i + 1} OF ${st.ids.length}</span>${pipsHTML(st, i)}</div>
      <div class="prompt-text">${esc(p.text)}</div>
      <div class="timerbar" id="timerbar"><i></i></div>
      <form class="answer-row" id="ansForm" autocomplete="off">
        <input id="ans" type="text" inputmode="text" enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="60" placeholder="type an answer…" aria-label="Your answer">
        <button class="btn primary" type="submit">BOWL</button>
      </form>
      <div class="feedback" id="fb">&nbsp;</div>
    </div>`);
    const input = $("#ans");
    setTimeout(() => input.focus({ preventScroll: true }), 30);
    $("#ansForm").onsubmit = (e) => { e.preventDefault(); submitRun(input.value); };
    RUN.deadline = performance.now() + (st.remaining || ROUND_MS);
    lastTickSec = -1;
    const bar = $("#timerbar"), fill = bar.firstElementChild;
    const loop = () => {
      if (!RUN || !RUN.deadline) return;
      const left = RUN.deadline - performance.now();
      const f = clamp(left / ROUND_MS, 0, 1);
      fill.style.width = (f * 100).toFixed(2) + "%";
      bar.classList.toggle("warn", left < 10000); bar.classList.toggle("crit", left < 5000);
      const sec = Math.ceil(left / 1000);
      if (left < 5000 && sec !== lastTickSec && sec > 0) { lastTickSec = sec; Sound.tick(); }
      if (performance.now() - saveT > 1000) { saveT = performance.now(); st.remaining = Math.max(0, left); saveRun(); }
      if (left <= 0) { RUN.deadline = 0; resolveRound(null, ""); return; }
      timerRAF = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(timerRAF);
    timerRAF = requestAnimationFrame(loop);
  }

  function submitRun(text) {
    if (!RUN || !RUN.deadline) return;
    const input = $("#ans");
    if (!text.trim()) { input.focus(); return; }
    const p = BY_ID[RUN.st.ids[RUN.st.results.length]];
    const m = matchAnswer(p, text);
    if (!m) {
      RUN.deadline -= PENALTY_MS;
      Sound.bad();
      const fb = $("#fb"); fb.textContent = `“${text.trim()}” isn't in the scorebook. −2s`; fb.className = "feedback bad";
      input.classList.remove("wobble"); void input.offsetWidth; input.classList.add("wobble");
      input.select();
      return;
    }
    resolveRound(m, text.trim());
  }

  async function resolveRound(m, input) {
    cancelAnimationFrame(timerRAF);
    const { st } = RUN;
    RUN.deadline = 0;
    const p = BY_ID[st.ids[st.results.length]];
    const tier = m ? m.a[1] : "miss";
    const res = { id: p.id, input, ans: m ? m.a[0] : null, ai: m ? m.i : -1, tier, pts: TIERS[tier] ? TIERS[tier].pts : 0 };
    const before = distFor(runPts(st), st.ids.length);
    st.results.push(res);
    st.phase = "reveal"; st.remaining = ROUND_MS;
    saveRun();
    if (m) { Sound.good(tier); say(TIERS[tier].name.toLowerCase() + "!"); } else { Sound.bad(); say("dead ball…"); }
    showReveal();
    const after = distFor(runPts(st), st.ids.length);
    hud.score(runPts(st));
    if (after > before) await moveBall(before, after, 1200 + (after - before) * 40);
  }

  function showReveal() {
    const { st } = RUN;
    const i = st.results.length - 1;
    const r = st.results[i];
    const p = BY_ID[r.id];
    const info = revealInfo(p, r.ai);
    const last = st.results.length >= st.ids.length;
    setDock(`<div class="box">
      <div class="prompt-head"><span>BALL ${i + 1} OF ${st.ids.length}</span>${pipsHTML(st, -1)}</div>
      <div class="muted" style="margin-top:4px">${esc(p.text)}</div>
      <div class="reveal-top" style="margin-top:6px">
        <span class="reveal-ans">${r.ans ? esc(r.ans) : "time's up"}</span>${tierBadge(r.tier)}
        <span class="reveal-pts">+${r.pts}</span>
      </div>
      <div class="reveal-list">
        ${info.jaffa && r.tier !== "j" ? `<div>the jaffa: <b class="c-j">${esc(info.jaffa)}</b></div>` : r.tier === "j" ? `<div class="c-j">You found today's jaffa for this prompt.</div>` : ""}
        ${info.rare.length ? `<div>rare picks: ${info.rare.map((x) => `<b class="c-${x.t}">${esc(x.name)}</b>`).join(", ")}</div>` : ""}
        ${info.common.length ? `<div>most bowled: ${info.common.map((x) => `<b>${esc(x.name)}</b>`).join(", ")}</div>` : ""}
        <div>${info.total} answers in the scorebook</div>
      </div>
      <div class="btn-row" style="justify-content:flex-end"><button class="btn primary" id="nextBtn" type="button">${last ? "FINISH THE DELIVERY ▶" : "NEXT BALL ▶"}</button></div>
    </div>`);
    const nb = $("#nextBtn");
    nb.focus({ preventScroll: true });
    nb.onclick = () => {
      Sound.click();
      if (last) { finale(); return; }
      st.phase = "prompt"; st.remaining = ROUND_MS; saveRun();
      showPrompt();
    };
  }

  async function finale() {
    const { st, cfg } = RUN;
    st.phase = "done"; st.finishedAt = Date.now(); saveRun();
    if (cfg.mode === "daily" || cfg.mode === "archive") recordDaily(cfg.n, st);
    if (cfg.mode === "pack") { const pb = store.get("jaffa:packbest", {}); pb[cfg.pack] = Math.max(pb[cfg.pack] || 0, runPts(st)); store.set("jaffa:packbest", pb); }
    setDock("");
    const pts = runPts(st), maxPts = st.ids.length * 100;
    const d = distFor(pts, st.ids.length);
    await bowlFinale(d, bandOf(d, pts >= maxPts));
    if (RUN && RUN.st === st) showResults();
  }

  async function bowlFinale(d, band) {
    const my = ++tweenToken;
    resetBatter();
    const startY = parkY(d), contactY = yOf(CONTACT) - 8;
    placeBallAt(d);
    hud.dist(d);
    puffAt(startY); Sound.thud();
    await sleep(reduceMotion() ? 50 : 450);
    batterEl.classList.add("backlift");
    Sound.whoosh();
    const x0 = ballPos.x;
    await animate(Math.max(380, 140 + (contactY - startY) * 0.45), (t) => {
      if (my !== tweenToken) return;
      const y = lerp(startY, contactY, t);
      setBall(lerp(x0, 6, t), y, ballPos.rot + 14);
      camTo(Math.max(y, contactY - innerHeight * 0.18));
    });
    if (my !== tweenToken) return;
    batterEl.classList.remove("backlift"); batterEl.classList.add("swing");
    Sound.crack();
    if (!reduceMotion()) { world.classList.remove("shake"); void world.offsetWidth; world.classList.add("shake"); }
    shout(band.call, contactY - 95);
    const vw = innerWidth;
    const flights = {
      "SIX!": { dx: -vw * 0.55, dy: -innerHeight * 0.75, s: 3.4, dur: 1200, fade: true },
      "FOUR!": { dx: vw * 0.62, dy: -90, s: 1, dur: 900, fade: true },
      TWO: { dx: -vw * 0.34, dy: -230, s: 1.2, dur: 1000 },
      ONE: { dx: vw * 0.24, dy: -70, s: 1, dur: 900 },
      DOT: { dx: -10, dy: -36, s: 1, dur: 700 },
    };
    const f = flights[band.call];
    if (band.call === "SIX!" || band.call === "FOUR!") setTimeout(() => Sound.roar(), 250);
    const bx = ballPos.x, by = ballPos.y, r0 = ballPos.rot;
    await animate(f.dur, (t) => {
      if (my !== tweenToken) return;
      const e = easeOut(t);
      const arc = band.call === "SIX!" ? Math.sin(t * Math.PI) * 1.2 : 0;
      setBall(bx + f.dx * e, by + f.dy * e, r0 + t * 900, 1 + (f.s - 1 + arc) * Math.sin(Math.min(1, t * 1.2) * Math.PI / 2), f.fade && t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
    });
    await sleep(reduceMotion() ? 50 : 700);
  }

  function shareText(r) {
    const head = r.mode === "daily" || r.mode === "archive" ? `JAFFA #${r.n}` : r.mode === "pack" ? `JAFFA · ${PACKS[r.pack] ? PACKS[r.pack].name : r.pack}` : "JAFFA";
    return `${head} 🏏 ${r.band.key}\n${r.tiers.map((t) => TIERS[t].emoji).join("")}\n${r.pts} pts · ${r.d.toFixed(2)}m down the pitch · ${r.band.call.replace("!", "")}\n${location.origin}${location.pathname}`;
  }
  async function doShare(text) {
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ text }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); }
    catch (e) { prompt("Copy your result:", text); }
  }
  const b64e = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64d = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))));
  function challengeLink(n, st) {
    const name = store.get("jaffa:name", "") || "A friend";
    return `${location.origin}${location.pathname}#/vs/${b64e({ n, p: runPts(st), t: st.results.map((r) => r.tier).join(","), nm: name })}`;
  }

  function showResults() {
    const { st, cfg } = RUN;
    const pts = runPts(st), maxPts = st.ids.length * 100;
    const d = distFor(pts, st.ids.length);
    const band = bandOf(d, pts >= maxPts);
    const tiers = st.results.map((r) => r.tier);
    const info = { mode: cfg.mode, n: cfg.n, pack: cfg.pack, pts, d, band, tiers };
    const stats = getStats();
    const isDaily = cfg.mode === "daily" || cfg.mode === "archive";
    hud.set(d, pts, "FINISHED");
    openPage(`
      <div class="box result-hero">
        <div class="eyebrow">${isDaily ? `DELIVERY #${cfg.n} · ${fmtDate(cfg.n)}` : esc(cfg.label)}</div>
        <div class="band">${esc(band.key)}</div>
        <div class="shot">${esc(band.line)} <b class="c-g">${esc(band.call)}</b></div>
        <div class="nums">${pts} / ${maxPts} pts · ${d.toFixed(2)}m down the pitch</div>
        <div class="share-grid" aria-label="Tiers per ball">${tiers.map((t) => TIERS[t].emoji).join("")}</div>
        <div class="btn-row">
          <button class="btn primary" id="shareBtn" type="button">SHARE RESULT</button>
          ${isDaily ? `<button class="btn" id="challengeBtn" type="button">CHALLENGE A FRIEND</button>` : ""}
          <button class="btn ghost" id="replayBtn" type="button">WATCH IT AGAIN</button>
        </div>
      </div>
      <div class="box">
        <div class="eyebrow">BALL BY BALL</div>
        <div class="ball-rows">${st.results.map((r, i) => `<div class="r"><span>${i + 1}.</span><span>${r.ans ? esc(r.ans) : '<span class="c-miss">time\'s up</span>'}<br><span class="q">${esc(BY_ID[r.id] ? BY_ID[r.id].text : r.id)}</span></span><span>${tierBadge(r.tier)} <b>${r.pts}</b></span></div>`).join("")}</div>
      </div>
      <div class="box">
        ${cfg.mode === "daily" ? `<div class="grid2">
          <div class="stat"><div class="v">${stats.streak}</div><div class="k">day streak</div></div>
          <div class="stat"><div class="v">${stats.played}</div><div class="k">deliveries</div></div>
          <div class="stat"><div class="v">${stats.best}</div><div class="k">best score</div></div>
          <div class="stat"><div class="v" data-countdown>${untilNext()}</div><div class="k">next delivery</div></div>
        </div>` : cfg.mode === "archive" ? `<p class="muted center">Archive deliveries don't count toward your streak.</p>` : `<p class="muted center">Pack best: ${(store.get("jaffa:packbest", {})[cfg.pack]) || pts} pts</p>`}
        <div class="btn-row">
          ${cfg.mode === "pack" ? `<a class="btn primary" href="#/packs/${esc(cfg.pack)}/new">PLAY THIS PACK AGAIN</a>` : ""}
          <a class="btn" href="#/unlimited">UNLIMITED ∞</a>
          <a class="btn" href="#/archive">ARCHIVE ⟲</a>
          <a class="btn" href="#/packs">PACKS</a>
          <a class="btn" href="#/me">MY STATS</a>
        </div>
      </div>`, { title: "Result" });
    $("#shareBtn").onclick = () => doShare(shareText(info));
    if ($("#challengeBtn")) $("#challengeBtn").onclick = () => {
      if (!store.get("jaffa:name")) { const nm = prompt("Your name for the challenge link:", ""); if (nm) store.set("jaffa:name", nm.slice(0, 24)); }
      doShare(`Beat my delivery on Jaffa #${cfg.n}: ${pts} pts (${band.key}). ${challengeLink(cfg.n, st)}`);
    };
    $("#replayBtn").onclick = async () => { closePage(true); setDock(""); await bowlFinale(d, band); if (RUN && RUN.st === st) showResults(); };
  }

  // ---------------------------------------------------------------- unlimited nets
  const AIR_MS = 45000;
  let NETS = null;
  function startNets() {
    closePage(true); stopRunTimers(); stopNets();
    RUN = null;
    resetBatter(); clearMarks();
    const order = shuffle(PROMPTS.map((p) => p.id));
    NETS = { order, k: 0, pts: 0, answered: 0, tiers: {}, air: AIR_MS, last: performance.now(), raf: 0, phase: "prompt", overs: 0, d: 0, wrong: 0 };
    placeBallAt(0); hud.set(0, 0, "NETS ∞");
    netsPrompt();
  }
  function stopNets() { if (NETS) { cancelAnimationFrame(NETS.raf); NETS.raf = 0; NETS.phase = "stopped"; } }
  function netsPrompt() {
    const N = NETS;
    if (N.k >= N.order.length) { N.order = shuffle(N.order); N.k = 0; }
    const p = BY_ID[N.order[N.k]];
    N.phase = "prompt";
    setDock(`<div class="box">
      <div class="prompt-head"><span>UNLIMITED NETS · ${N.answered} ANSWERED</span><span>${N.pts} PTS</span></div>
      <div class="prompt-text">${esc(p.text)}</div>
      <div class="timerbar" id="timerbar"><i></i></div>
      <form class="answer-row" id="ansForm" autocomplete="off">
        <input id="ans" type="text" enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="60" placeholder="type an answer…" aria-label="Your answer">
        <button class="btn primary" type="submit">BOWL</button>
      </form>
      <div class="dock-row" style="margin-top:6px"><span class="feedback" id="fb" style="flex:1;margin:0">stamina only drains while you're answering</span><button class="btn small" type="button" id="skipBtn">SKIP −5s</button></div>
    </div>`);
    const input = $("#ans");
    setTimeout(() => input.focus({ preventScroll: true }), 30);
    $("#ansForm").onsubmit = (e) => { e.preventDefault(); netsSubmit(p, input.value); };
    $("#skipBtn").onclick = () => { N.air -= 5000; N.k++; Sound.click(); if (N.air > 0) netsPrompt(); };
    N.last = performance.now();
    const bar = $("#timerbar"), fill = bar.firstElementChild;
    let lastSec = -1;
    const loop = (now) => {
      if (NETS !== N || N.phase !== "prompt") return;
      N.air -= now - N.last; N.last = now;
      const f = clamp(N.air / AIR_MS, 0, 1);
      fill.style.width = (f * 100).toFixed(2) + "%";
      bar.classList.toggle("warn", N.air < 15000); bar.classList.toggle("crit", N.air < 6000);
      const sec = Math.ceil(N.air / 1000);
      if (N.air < 6000 && sec !== lastSec) { lastSec = sec; Sound.tick(); }
      if (N.air <= 0) { netsOver(); return; }
      N.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(N.raf);
    N.raf = requestAnimationFrame((t) => { N.last = t; loop(t); });
  }
  async function netsSubmit(p, text) {
    const N = NETS; if (!N || N.phase !== "prompt" || !text.trim()) return;
    const m = matchAnswer(p, text);
    const fb = $("#fb");
    if (!m) {
      N.air -= PENALTY_MS; N.wrong++; Sound.bad();
      fb.textContent = `“${text.trim()}” isn't in the scorebook. −2s`; fb.className = "feedback bad";
      const input = $("#ans"); input.classList.remove("wobble"); void input.offsetWidth; input.classList.add("wobble"); input.select();
      return;
    }
    N.phase = "pause";
    cancelAnimationFrame(N.raf);
    const t = m.a[1];
    N.pts += TIERS[t].pts; N.answered++; N.tiers[t] = (N.tiers[t] || 0) + 1;
    N.air = Math.min(AIR_MS * 1.5, N.air + TIERS[t].air * 1000);
    N.k++;
    Sound.good(t); say(TIERS[t].name.toLowerCase() + "!");
    fb.innerHTML = `${esc(m.a[0])} ${tierBadge(t)} +${TIERS[t].pts} pts · +${TIERS[t].air}s stamina`; fb.className = "feedback";
    hud.score(N.pts);
    const before = N.d, after = N.d + (TIERS[t].pts / (BALLS * 100)) * PITCH;
    if (after >= PITCH) {
      await moveBall(before, PITCH, 700);
      if (NETS !== N) return;
      N.overs++;
      await bowlFinale(PITCH, BANDS[Math.floor(Math.random() * 5)]);
      if (NETS !== N) return;
      resetBatter(); N.d = after - PITCH; placeBallAt(N.d); hud.ball(`NETS · ${N.overs} BOWLED`);
    } else { N.d = after; await moveBall(before, after, 650); }
    if (NETS !== N) return;
    await sleep(250);
    if (NETS === N && N.phase === "pause") netsPrompt();
  }
  function netsOver() {
    const N = NETS; N.phase = "over"; cancelAnimationFrame(N.raf);
    Sound.pop();
    const best = Math.max(store.get("jaffa:netsbest", 0), N.pts);
    store.set("jaffa:netsbest", best);
    setDock("");
    const tiers = TIER_ORDER.filter((t) => N.tiers[t]);
    openPage(`<div class="box result-hero">
      <div class="eyebrow">UNLIMITED NETS</div>
      <div class="band">OUT OF GAS</div>
      <div class="shot">${N.answered} answers · ${N.pts} pts${N.pts >= best && N.pts > 0 ? ' · <b class="c-g">NEW BEST</b>' : ""}</div>
      <div class="nums">best: ${best} pts · deliveries completed: ${N.overs}</div>
      <div class="share-grid">${tiers.map((t) => TIERS[t].emoji + "×" + N.tiers[t]).join(" ") || "⬛"}</div>
      <div class="btn-row">
        <button class="btn primary" id="againBtn" type="button">GO AGAIN</button>
        <button class="btn" id="shareBtn" type="button">SHARE</button>
        <a class="btn ghost" href="#/">HOME</a>
      </div></div>`, { title: "Nets" });
    $("#againBtn").onclick = () => startNets();
    $("#shareBtn").onclick = () => doShare(`JAFFA NETS ∞ 🏏\n${N.answered} answers · ${N.pts} pts\n${tiers.map((t) => TIERS[t].emoji + "×" + N.tiers[t]).join(" ")}\n${location.origin}${location.pathname}#/unlimited`);
  }

  // ---------------------------------------------------------------- pages
  const page = $("#page");
  let pageTimers = [];
  function openPage(html, opts = {}) {
    pageTimers.forEach(clearInterval); pageTimers = [];
    page.innerHTML = `<button class="icon-btn close" type="button" aria-label="Close" id="pageClose">×</button><div class="page-inner">${html}</div>`;
    page.hidden = false; page.scrollTop = 0;
    $("#pageClose").onclick = () => { Sound.click(); if (opts.onClose) opts.onClose(); else location.hash = "#/"; };
    tickCountdowns();
    pageTimers.push(setInterval(tickCountdowns, 1000));
  }
  function closePage(silent) { pageTimers.forEach(clearInterval); pageTimers = []; page.hidden = true; page.innerHTML = ""; }
  function tickCountdowns() { $$("[data-countdown]").forEach((el) => (el.textContent = untilNext())); }

  function archivePage() {
    const n = todayN(), stats = getStats();
    let rows = "";
    for (let k = n; k >= 1; k--) {
      const h = stats.hist[k], st = store.get("jaffa:d:" + k);
      const status = h ? `<span class="c-g">${h.p} pts</span> · ${bandOf(h.d, h.p >= 700).key.toLowerCase()}` : st && st.results && st.results.length ? "in progress" : "not played";
      rows += `<a class="row" href="${k === n ? "#/play" : "#/archive/" + k}"><span style="width:60px">#${k}</span><span class="grow">${fmtDate(k)}${k === n ? ' <span class="tier t-s">today</span>' : ""}<div class="sub">${status}</div></span><span>${h ? h.t.split(",").map((t) => TIERS[t] ? TIERS[t].emoji : "").join("") : "▶"}</span></a>`;
    }
    openPage(`<div class="box"><div class="eyebrow">ARCHIVE ⟲</div><h1>Past deliveries</h1><p class="muted">Every daily delivery since #1. Replays don't affect your streak.</p><div class="list">${rows}</div></div>`);
  }

  function packsPage() {
    const best = store.get("jaffa:packbest", {});
    const cards = Object.entries(PACKS).map(([k, v]) => {
      const count = PROMPTS.filter((p) => p.pack === k).length;
      if (!count) return "";
      return `<a class="row" href="#/packs/${k}"><span class="grow"><b style="font-weight:normal;font-size:24px">${esc(v.name)}</b><div class="sub">${esc(v.blurb)} ${count} prompts.</div></span><span class="muted">${best[k] ? "best " + best[k] : "▶"}</span></a>`;
    }).join("");
    openPage(`<div class="box"><div class="eyebrow">THEMED PACKS</div><h1>Pick a pack</h1><p class="muted">Seven random prompts from one corner of the game. Free, replay as often as you like.</p><div class="list">${cards}</div></div>`);
  }
  function startPack(pack, fresh) {
    const pool = PROMPTS.filter((p) => p.pack === pack).map((p) => p.id);
    if (!pool.length) { location.hash = "#/packs"; return; }
    const key = "jaffa:pack:" + pack;
    const st = store.get(key);
    const needNew = fresh || !st || st.phase === "done" || !st.ids || !st.ids.every((id) => BY_ID[id]);
    startRun({ mode: "pack", pack, key, label: (PACKS[pack] || { name: pack }).name.toUpperCase(), ids: needNew ? shuffle(pool).slice(0, BALLS) : st.ids, fresh: needNew });
  }

  function mePage() {
    const s = getStats();
    const hist = Object.entries(s.hist).map(([n, h]) => ({ n: +n, ...h })).sort((a, b) => b.n - a.n);
    const avg = hist.length ? hist.reduce((a, h) => a + h.d, 0) / hist.length : 0;
    const bandCounts = BANDS.map((b) => ({ b, c: hist.filter((h) => bandOf(h.d, h.p >= 700).key === b.key).length }));
    const maxC = Math.max(1, ...bandCounts.map((x) => x.c));
    const todayH = s.hist[todayN()];
    const totalT = TIER_ORDER.concat("miss").reduce((a, t) => a + (s.tiers[t] || 0), 0);
    openPage(`<div class="box"><div class="eyebrow">MY JAFFA</div><h1>Your scorecard</h1>
      <div class="grid2">
        <div class="stat"><div class="v">${s.played}</div><div class="k">deliveries</div></div>
        <div class="stat"><div class="v">${s.streak}</div><div class="k">current streak</div></div>
        <div class="stat"><div class="v">${s.maxStreak}</div><div class="k">best streak</div></div>
        <div class="stat"><div class="v">${s.best}</div><div class="k">best score</div></div>
        <div class="stat"><div class="v">${avg.toFixed(1)}m</div><div class="k">avg distance</div></div>
        <div class="stat"><div class="v">${s.tiers.j || 0}</div><div class="k">jaffas found</div></div>
        <div class="stat"><div class="v">${store.get("jaffa:netsbest", 0)}</div><div class="k">nets best</div></div>
      </div></div>
      <div class="box"><div class="eyebrow">WHERE YOUR DELIVERIES PITCHED</div>
        <div class="bars" style="margin-top:8px">${bandCounts.map(({ b, c }) => `<div class="bar ${todayH && bandOf(todayH.d, todayH.p >= 700).key === b.key ? "me" : ""}"><span>${esc(b.key)}</span><span class="track"><i style="width:${(c / maxC) * 100}%"></i></span><span>${c}</span></div>`).join("")}</div>
      </div>
      <div class="box"><div class="eyebrow">ANSWER TIERS</div>
        <div class="bars" style="margin-top:8px">${TIER_ORDER.concat("miss").map((t) => `<div class="bar"><span class="c-${t}">${esc(TIERS[t].name)}</span><span class="track"><i style="background:var(--t-${t});width:${totalT ? ((s.tiers[t] || 0) / totalT) * 100 : 0}%"></i></span><span>${s.tiers[t] || 0}</span></div>`).join("")}</div>
      </div>
      <div class="box"><div class="eyebrow">RECENT</div>
        <div class="list" style="margin-top:8px">${hist.slice(0, 14).map((h) => `<a class="row" href="#/result/${h.n}"><span style="width:60px">#${h.n}</span><span class="grow">${h.p} pts · ${h.d.toFixed(2)}m<div class="sub">${fmtDate(h.n)}</div></span><span>${h.t.split(",").map((t) => TIERS[t] ? TIERS[t].emoji : "").join("")}</span></a>`).join("") || '<p class="muted">No deliveries yet. Today\'s is waiting.</p>'}</div>
      </div>
      <div class="box"><div class="eyebrow">MOVE TO ANOTHER DEVICE</div>
        <p class="muted">Your progress lives in this browser. Copy your save code here and paste it on another device.</p>
        <div class="btn-row" style="justify-content:flex-start"><button class="btn" id="exportBtn" type="button">COPY SAVE CODE</button><button class="btn" id="importBtn" type="button">PASTE SAVE CODE</button></div>
      </div>`);
    $("#exportBtn").onclick = async () => {
      const data = {}; store.keys().forEach((k) => (data[k] = localStorage.getItem(k)));
      const code = b64e(data);
      try { await navigator.clipboard.writeText(code); toast("Save code copied"); } catch (e) { prompt("Your save code:", code); }
    };
    $("#importBtn").onclick = () => {
      const code = prompt("Paste your save code:");
      if (!code) return;
      try { const data = b64d(code.trim()); Object.entries(data).forEach(([k, v]) => { if (k.startsWith("jaffa:")) localStorage.setItem(k, v); }); toast("Save restored"); setTimeout(() => location.reload(), 600); }
      catch (e) { toast("That code didn't work"); }
    };
  }

  function friendsPage() {
    const friends = store.get("jaffa:friends", []);
    const s = getStats(), n = todayN();
    const st = store.get("jaffa:d:" + n);
    const done = st && st.phase === "done";
    const rows = friends.slice().sort((a, b) => b.n - a.n || b.p - a.p).map((f) => {
      const mine = s.hist[f.n];
      const verdict = mine ? (mine.p > f.p ? '<span class="c-s">you won</span>' : mine.p < f.p ? '<span class="c-j">they won</span>' : "tied") : `<a href="${f.n === n ? "#/play" : "#/archive/" + f.n}">play #${f.n}</a>`;
      return `<div class="row"><span class="grow">${esc(f.nm)} · #${f.n} · ${f.p} pts<div class="sub">${f.t.split(",").map((t) => TIERS[t] ? TIERS[t].emoji : "").join("")} ${mine ? "· you: " + mine.p : ""}</div></span><span>${verdict}</span></div>`;
    }).join("");
    openPage(`<div class="box"><div class="eyebrow">FRIENDS</div><h1>Head to head</h1>
      <p class="muted">Send a challenge link after you play. When a friend opens it, your scores line up here, no account needed.</p>
      <div class="field"><input id="nameIn" maxlength="24" placeholder="your name" value="${esc(store.get("jaffa:name", ""))}" aria-label="Your name"><button class="btn" id="nameSave" type="button">SAVE NAME</button></div>
      <div class="btn-row" style="justify-content:flex-start">${done ? `<button class="btn primary" id="chal" type="button">COPY TODAY'S CHALLENGE LINK</button>` : `<a class="btn primary" href="#/play">PLAY TODAY FIRST</a>`}</div>
      </div>
      <div class="box"><div class="eyebrow">RESULTS FROM FRIENDS</div><div class="list" style="margin-top:8px">${rows || '<p class="muted">Nothing yet. Links your friends send you show up here.</p>'}</div></div>`);
    $("#nameSave").onclick = () => { store.set("jaffa:name", $("#nameIn").value.trim().slice(0, 24)); toast("Name saved"); };
    if ($("#chal")) $("#chal").onclick = () => { store.set("jaffa:name", $("#nameIn").value.trim().slice(0, 24)); doShare(`Beat my delivery on Jaffa #${n}: ${runPts(st)} pts. ${challengeLink(n, st)}`); };
  }

  function vsPage(code) {
    let f;
    try { f = b64d(code); if (!f || typeof f.n !== "number" || typeof f.p !== "number" || typeof f.t !== "string") throw 0; } catch (e) { toast("That challenge link is broken"); location.hash = "#/"; return; }
    f.nm = String(f.nm || "A friend").slice(0, 24); f.p = clamp(Math.round(f.p), 0, 700); f.n = clamp(Math.round(f.n), 1, todayN());
    f.t = f.t.split(",").filter((t) => TIERS[t]).slice(0, BALLS).join(",");
    const friends = store.get("jaffa:friends", []).filter((x) => !(x.nm === f.nm && x.n === f.n));
    friends.push(f); store.set("jaffa:friends", friends.slice(-100));
    const mine = getStats().hist[f.n];
    const theirD = distFor(f.p, BALLS);
    openPage(`<div class="box result-hero"><div class="eyebrow">CHALLENGE · DELIVERY #${f.n}</div>
      <div class="band">${esc(f.nm)}</div>
      <div class="shot">${f.p} pts · ${theirD.toFixed(2)}m · ${esc(bandOf(theirD, f.p >= 700).key)}</div>
      <div class="share-grid">${f.t.split(",").map((t) => TIERS[t] ? TIERS[t].emoji : "").join("")}</div>
      ${mine ? `<div class="nums">You: ${mine.p} pts · ${mine.p > f.p ? "you win this one" : mine.p < f.p ? "they got you" : "dead heat"}</div><div class="btn-row"><a class="btn primary" href="#/friends">SEE ALL FRIENDS</a></div>`
        : `<div class="btn-row"><a class="btn primary" href="${f.n === todayN() ? "#/play" : "#/archive/" + f.n}">BOWL #${f.n} NOW</a></div>`}
      </div>`);
  }

  function faqPage() {
    const qa = [
      ["What is Jaffa?", `A daily cricket quiz. Everyone gets the same ${BALLS} prompts each day, like "Name a fielding position". Any valid answer counts, but the rarer your answer, the more points it scores and the further the ball travels down the pitch.`],
      ["What's a jaffa?", "Cricket slang for an unplayable delivery. Here it's also the top tier: one hand-picked, delightful answer per prompt worth 100 points."],
      ["How are the tiers decided?", "Every answer in the scorebook is hand-graded by how often fans would think of it, from Dot Ball (the obvious pick) up to Doosra (deep cuts). It is curated, not a live count of what players typed."],
      ["What does Too Clever mean?", "It's the answer everyone reaches for when they're trying to be obscure, so it isn't actually obscure. It still counts, just for 15 points."],
      ["Why was my answer rejected?", "It isn't in the scorebook yet, or the spelling was too far off. Matching ignores capitals, accents, punctuation and plurals, accepts common nicknames and surnames, and forgives a typo or two. A wrong guess costs 2 seconds, so keep swinging."],
      ["Why does the batter always hit it?", "Because batters always get the last word. Your score decides where the ball pitches. A weak day is a long hop that goes for six; a perfect day is a yorker the batter barely digs out."],
      ["When does the next delivery drop?", "Every day at 00:00 UTC. Missed one? Play it from the Archive. Only today's delivery counts toward your streak."],
      ["What's Unlimited?", "Nets mode: endless prompts from the whole library, with one stamina bar that only drains while you're answering. Rarer answers buy more time (a jaffa is worth +16s)."],
      ["How does Cherry Bomb work?", "A party game for 2 or more. Everyone joins a room code. The ball has a hidden fuse of 10 to 30 seconds. Give a valid, unused answer to pass it on; the fuse keeps its remaining time, but never less than 8 seconds. Whoever holds it when it pops is out. Last one standing wins. You can also play on one shared device."],
      ["Where's my progress saved?", "In this browser only. Use My Jaffa → Copy save code to move it to another device. Nothing is sent to a server, and there are no accounts, ads or trackers."],
      ["Who made this?", "It's a fan-made cricket remix of the daily-dive format from krillion.io, which you should also play. It isn't affiliated with Krillion."],
    ];
    openPage(`<div class="box"><div class="eyebrow">FAQ</div><h1>Frequently asked</h1><dl class="faq">${qa.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl></div>`);
  }

  function resultPage(n) {
    const st = store.get("jaffa:d:" + n);
    if (!st || st.phase !== "done") { location.hash = n === todayN() ? "#/play" : "#/archive/" + n; return; }
    startRun({ mode: n === todayN() ? "daily" : "archive", n, key: "jaffa:d:" + n, ids: st.ids, label: n === todayN() ? `DELIVERY #${n}` : `ARCHIVE #${n}` });
  }

  // ---------------------------------------------------------------- router
  const routes = {};
  function leaveModes() { stopRunTimers(); stopNets(); NETS = null; if (window.JaffaParty && window.JaffaParty.leaveView) window.JaffaParty.leaveView(); }
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [head, a, b] = h.split("/");
    $("#menu").open && $("#menu").close();
    const n = todayN();
    leaveModes();
    switch (head) {
      case "": renderHome(); closePage(); break;
      case "play": startRun({ mode: "daily", n, key: "jaffa:d:" + n, ids: dailyIds(n), label: `DELIVERY #${n}` }); break;
      case "result": resultPage(+a || n); break;
      case "archive":
        if (a && +a >= 1 && +a <= n) startRun({ mode: +a === n ? "daily" : "archive", n: +a, key: "jaffa:d:" + a, ids: dailyIds(+a), label: +a === n ? `DELIVERY #${n}` : `ARCHIVE #${a}` });
        else { renderHome(); archivePage(); }
        break;
      case "packs":
        if (a && PACKS[a]) startPack(a, b === "new");
        else { renderHome(); packsPage(); }
        break;
      case "unlimited": startNets(); break;
      case "me": renderHome(); mePage(); break;
      case "friends": renderHome(); friendsPage(); break;
      case "faq": renderHome(); faqPage(); break;
      case "vs": renderHome(); vsPage(a || ""); break;
      case "party":
        renderHome(); closePage(true);
        if (routes.party) routes.party(a); else openPage('<div class="box"><p>Loading party…</p></div>');
        break;
      default: renderHome(); closePage();
    }
  }

  // ---------------------------------------------------------------- chrome wiring
  function wire() {
    const menu = $("#menu"), sett = $("#settings");
    $("#menuBtn").onclick = () => { Sound.click(); menu.showModal(); };
    $$("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));
    [menu, sett].forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
    $$(".menu-nav a", menu).forEach((a) => a.addEventListener("click", () => menu.close()));
    const openSettings = () => {
      $("#setSound").checked = !!settings.sound; $("#setContrast").checked = !!settings.contrast; $("#setMotion").checked = !!settings.motion;
      sett.showModal();
    };
    $("#settingsBtn").onclick = openSettings;
    $("#menuSettings").onclick = () => { menu.close(); openSettings(); };
    $("#setSound").onchange = (e) => { settings.sound = e.target.checked; saveSettings(); };
    $("#setContrast").onchange = (e) => { settings.contrast = e.target.checked; saveSettings(); };
    $("#setMotion").onchange = (e) => { settings.motion = e.target.checked; saveSettings(); };
    $("#resetData").onclick = () => { if (confirm("Erase all Jaffa progress in this browser?")) { store.keys().forEach((k) => localStorage.removeItem(k)); location.hash = "#/"; location.reload(); } };
    $("#soundBtn").onclick = () => { settings.sound = !settings.sound; saveSettings(); if (settings.sound) Sound.click(); };
    soundIcon();
    document.addEventListener("pointerdown", () => Sound.init(), { once: true });
    window.addEventListener("hashchange", route);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !page.hidden && !$("dialog[open]")) { const c = $("#pageClose"); if (c) c.click(); }
    });
    window.addEventListener("resize", () => { if (!RUN && !NETS) return; camTo(ballPos.y); });
  }

  // ---------------------------------------------------------------- public API (for party.js)
  window.Jaffa = { $, $$, esc, store, toast, Sound, PROMPTS, BY_ID, TIERS, matchAnswer, revealInfo, tierBadge, cherrySVG, ballSVG, openPage, closePage, setDock, renderHome, routes, shuffle, hud, say, route, dailyIds, todayN };

  buildWorld();
  wire();
  if (!PROMPTS.length) toast("Question bank failed to load", 4000);
  // party.js registers its route after this script; route once both are loaded
  window.addEventListener("DOMContentLoaded", route);
})();
