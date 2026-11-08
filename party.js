/* Cherry Bomb: pass-the-ball party mode. Host-authoritative; online rooms via PeerJS, or one shared device. */
(() => {
  "use strict";
  const J = window.Jaffa;
  if (!J) return;
  const { $, esc, store, toast, Sound } = J;
  const FUSE_MIN = 10000, FUSE_MAX = 30000, FLOOR = 8000, POP_PAUSE = 4200;
  const PREFIX = "jaffa-cherry-";
  const randCode = () => Array.from({ length: 4 }, () => "BCDFGHJKLMNPQRSTVWXZ"[Math.floor(Math.random() * 20)]).join("");

  // ------------------------------------------------------------ engine (runs on the host / single device)
  class Engine {
    constructor(onChange) { this.players = []; this.phase = "lobby"; this.onChange = onChange; this.round = 0; this.used = []; this.usedIdx = new Set(); this.fuseT = 0; this.nextT = 0; this.events = []; }
    emit() { this.onChange(this.state()); }
    addPlayer(id, name) {
      if (this.players.find((p) => p.id === id)) return;
      let nm = String(name || "Player").trim().slice(0, 18) || "Player";
      let base = nm, k = 2;
      while (this.players.some((p) => p.name.toLowerCase() === nm.toLowerCase())) nm = `${base} ${k++}`;
      this.players.push({ id, name: nm, alive: this.phase === "lobby", wins: 0 });
      this.emit();
    }
    removePlayer(id) {
      const i = this.players.findIndex((p) => p.id === id);
      if (i < 0) return;
      const wasHolder = this.phase === "playing" && this.holder === i;
      this.players.splice(i, 1);
      if (this.holder > i) this.holder--;
      if (this.phase === "playing" || this.phase === "popped") {
        if (this.alive().length <= 1) { this.finish(); return; }
        if (wasHolder) this.holder = this.nextAlive(i - 1);
      }
      this.emit();
    }
    alive() { return this.players.filter((p) => p.alive); }
    nextAlive(from) {
      const n = this.players.length;
      for (let s = 1; s <= n; s++) { const j = (((from + s) % n) + n) % n; if (this.players[j] && this.players[j].alive) return j; }
      return -1;
    }
    start() {
      if (this.players.length < 2) return false;
      this.players.forEach((p) => (p.alive = true));
      this.round = 0; this.winner = null;
      this.newRound(Math.floor(Math.random() * this.players.length));
      return true;
    }
    pickPrompt() {
      const pool = J.PROMPTS.filter((p) => p.answers.length >= 25 && p.id !== this.promptId);
      const list = pool.length ? pool : J.PROMPTS;
      return list[Math.floor(Math.random() * list.length)];
    }
    newRound(startIdx) {
      clearTimeout(this.fuseT); clearTimeout(this.nextT);
      const p = this.pickPrompt();
      this.promptId = p.id; this.used = []; this.usedIdx = new Set();
      this.round++;
      this.phase = "playing";
      this.holder = this.players[startIdx] && this.players[startIdx].alive ? startIdx : this.nextAlive(startIdx);
      this.armFuse(FUSE_MIN + Math.random() * (FUSE_MAX - FUSE_MIN));
      this.lastOut = null;
      this.emit();
    }
    armFuse(ms) { clearTimeout(this.fuseT); this.fuseEnd = performance.now() + ms; this.fuseT = setTimeout(() => this.pop(), ms); }
    answer(pid, text) {
      if (this.phase !== "playing") return { ok: false, reason: "Hold on…" };
      const hp = this.players[this.holder];
      if (!hp || hp.id !== pid) return { ok: false, reason: "It's not your ball." };
      const p = J.BY_ID[this.promptId];
      const m = J.matchAnswer(p, text);
      if (!m) return { ok: false, reason: `“${String(text).trim().slice(0, 40)}” isn't in the scorebook.` };
      if (this.usedIdx.has(m.i)) return { ok: false, reason: `${m.a[0]} has already been used.` };
      this.usedIdx.add(m.i);
      this.used.push({ by: hp.name, ans: m.a[0], t: m.a[1] });
      const left = this.fuseEnd - performance.now();
      this.armFuse(Math.max(left, FLOOR));
      this.holder = this.nextAlive(this.holder);
      this.emit();
      return { ok: true, ans: m.a[0], t: m.a[1] };
    }
    pop() {
      if (this.phase !== "playing") return;
      const out = this.players[this.holder];
      if (out) out.alive = false;
      this.lastOut = out ? out.name : "?";
      this.phase = "popped";
      const outIdx = this.holder;
      this.emit();
      this.nextT = setTimeout(() => {
        if (this.alive().length <= 1) this.finish();
        else this.newRound(this.nextAlive(outIdx));
      }, POP_PAUSE);
    }
    finish() {
      clearTimeout(this.fuseT); clearTimeout(this.nextT);
      const w = this.alive()[0];
      if (w) w.wins++;
      this.winner = w ? w.name : null;
      this.phase = "over";
      this.emit();
    }
    toLobby() { clearTimeout(this.fuseT); clearTimeout(this.nextT); this.phase = "lobby"; this.players.forEach((p) => (p.alive = true)); this.emit(); }
    destroy() { clearTimeout(this.fuseT); clearTimeout(this.nextT); this.onChange = () => {}; }
    state() {
      const p = J.BY_ID[this.promptId];
      const s = {
        phase: this.phase, round: this.round,
        players: this.players.map((x) => ({ id: x.id, name: x.name, alive: x.alive, wins: x.wins })),
        holder: this.holder, prompt: p ? { id: p.id, text: p.text } : null,
        used: this.used, lastOut: this.lastOut, winner: this.winner,
      };
      if (this.phase === "popped" && p) {
        const free = p.answers.map((x, i) => ({ name: x[0], t: x[1], i })).filter((x) => !this.usedIdx.has(x.i));
        const j = free.find((x) => x.t === "j");
        const rare = J.shuffle(free.filter((x) => x.t === "d" || x.t === "g")).slice(0, 3).map((x) => x.name);
        s.reveal = { jaffa: j ? j.name : null, rare, left: free.length };
      }
      return s;
    }
  }

  // ------------------------------------------------------------ session (UI + transport)
  let S = null; // { mode:'host'|'client'|'local', peer, conns, engine, me, code, state }
  let tickT = 0;

  function leave() {
    if (!S) return;
    try { S.engine && S.engine.destroy(); } catch (e) {}
    try { S.conn && S.conn.close(); } catch (e) {}
    try { S.peer && S.peer.destroy(); } catch (e) {}
    S = null;
    clearInterval(tickT);
  }

  function waitPeerJS() {
    return new Promise((res, rej) => {
      if (window.Peer) return res();
      let n = 0;
      const t = setInterval(() => { if (window.Peer) { clearInterval(t); res(); } else if (++n > 80) { clearInterval(t); rej(new Error("PeerJS failed to load")); } }, 100);
    });
  }

  function landing(code) {
    leave();
    const name = store.get("jaffa:name", "");
    J.openPage(`<div class="box">
      <div class="eyebrow">LIVE · MULTIPLAYER</div>
      <h1>Cherry Bomb</h1>
      <div class="cherry-stage">${J.cherrySVG()}</div>
      <p>Pass the cherry before it pops. Everyone gets the same cricket prompt. On your turn, give a valid answer nobody has used yet to pass the ball on. The fuse is hidden: somewhere between 10 and 30 seconds, and passing never leaves less than 8. Hold it when it pops and you're out. Last one standing wins.</p>
      <div class="field"><input id="pName" maxlength="18" placeholder="your name" value="${esc(name)}" aria-label="Your name"></div>
      <div class="rule">Online room</div>
      <div class="btn-row" style="justify-content:flex-start"><button class="btn primary" id="pCreate" type="button">CREATE A ROOM</button></div>
      <div class="field"><input id="pCode" maxlength="4" placeholder="ROOM CODE" value="${esc((code || "").toUpperCase())}" style="text-transform:uppercase;letter-spacing:6px" aria-label="Room code"><button class="btn" id="pJoin" type="button">JOIN</button></div>
      <div class="rule">Same device</div>
      <p class="muted">No internet needed. Pass the phone around.</p>
      <div class="field"><input id="pLocal" placeholder="names, comma separated (2+)" aria-label="Player names"><button class="btn" id="pLocalGo" type="button">PLAY HERE</button></div>
      <div class="feedback bad" id="pErr"></div>
    </div>`);
    const nm = () => { const v = $("#pName").value.trim().slice(0, 18); if (v) store.set("jaffa:name", v); return v; };
    $("#pCreate").onclick = () => { const n = nm(); if (!n) return err("Pick a name first."); host(n); };
    $("#pJoin").onclick = () => { const n = nm(); const c = $("#pCode").value.trim().toUpperCase(); if (!n) return err("Pick a name first."); if (!/^[A-Z]{4}$/.test(c)) return err("Room codes are 4 letters."); join(n, c); };
    $("#pCode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#pJoin").click(); });
    $("#pLocalGo").onclick = () => {
      const names = $("#pLocal").value.split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length < 2) return err("Add at least two names.");
      local(names.slice(0, 12));
    };
    if (code) setTimeout(() => $("#pName").focus(), 50);
  }
  function err(msg) { const e = $("#pErr"); if (e) e.textContent = msg; Sound.bad(); }
  function status(msg) { J.openPage(`<div class="box center"><div class="cherry-stage">${J.cherrySVG()}</div><p>${esc(msg)}</p><div class="btn-row"><a class="btn" href="#/party">BACK</a></div></div>`, { onClose: () => (location.hash = "#/") }); }

  async function host(name, tries = 0) {
    leave();
    status("Opening the room…");
    try { await waitPeerJS(); } catch (e) { return status("Couldn't load the multiplayer library. Try the same-device mode."); }
    const code = randCode();
    const peer = new window.Peer(PREFIX + code, { debug: 0 });
    const sess = (S = { mode: "host", peer, conns: new Map(), code, me: null });
    peer.on("open", (id) => {
      if (S !== sess) return;
      sess.me = id;
      sess.engine = new Engine((st) => { sess.state = st; broadcast(st); render(); });
      sess.engine.addPlayer(id, name);
      history.replaceState(null, "", "#/party/" + code);
    });
    peer.on("connection", (conn) => {
      conn.on("data", (msg) => {
        if (S !== sess || !msg || typeof msg !== "object") return;
        if (msg.t === "join") { sess.conns.set(conn.peer, conn); sess.engine.addPlayer(conn.peer, msg.name); }
        else if (msg.t === "answer") {
          const r = sess.engine.answer(conn.peer, String(msg.text || "").slice(0, 60));
          if (!r.ok) conn.send({ t: "reject", reason: r.reason }); else conn.send({ t: "ok", ans: r.ans, tier: r.t });
        }
      });
      conn.on("close", () => { if (S !== sess) return; sess.conns.delete(conn.peer); sess.engine.removePlayer(conn.peer); });
    });
    peer.on("error", (e) => {
      if (S !== sess) return;
      if (e.type === "unavailable-id" && tries < 4) return host(name, tries + 1);
      if (e.type === "peer-unavailable") return;
      status("Connection problem: " + (e.type || e.message || "unknown") + ". Try again, or play on one device.");
    });
  }
  function broadcast(st) { if (!S || S.mode !== "host") return; for (const c of S.conns.values()) { try { c.open && c.send({ t: "state", s: st }); } catch (e) {} } }

  async function join(name, code) {
    leave();
    status(`Joining room ${code}…`);
    try { await waitPeerJS(); } catch (e) { return status("Couldn't load the multiplayer library."); }
    const peer = new window.Peer({ debug: 0 });
    const sess = (S = { mode: "client", peer, code, me: null });
    const timeout = setTimeout(() => { if (S === sess && !sess.state) status(`Couldn't reach room ${code}. Check the code and try again.`); }, 12000);
    peer.on("open", (id) => {
      sess.me = id;
      const conn = peer.connect(PREFIX + code, { reliable: true });
      sess.conn = conn;
      conn.on("open", () => conn.send({ t: "join", name }));
      conn.on("data", (msg) => {
        if (S !== sess || !msg) return;
        if (msg.t === "state") { clearTimeout(timeout); sess.state = msg.s; render(); }
        else if (msg.t === "reject") { feedback(msg.reason, true); Sound.bad(); }
        else if (msg.t === "ok") { Sound.good(msg.tier); }
      });
      conn.on("close", () => { if (S === sess) status("The host closed the room."); });
    });
    peer.on("error", (e) => {
      if (S !== sess) return;
      clearTimeout(timeout);
      status(e.type === "peer-unavailable" ? `Room ${code} doesn't exist (or the host left).` : "Connection problem: " + (e.type || "unknown") + ".");
    });
    history.replaceState(null, "", "#/party/" + code);
  }

  function local(names) {
    leave();
    const sess = (S = { mode: "local", me: null });
    sess.engine = new Engine((st) => { sess.state = st; render(); });
    names.forEach((n, i) => sess.engine.addPlayer("p" + i, n));
    sess.engine.start();
  }

  function sendAnswer(text) {
    if (!S || !text.trim()) return;
    if (S.mode === "client") { S.conn && S.conn.send({ t: "answer", text }); return; }
    const st = S.state;
    const pid = S.mode === "local" ? st.players[st.holder].id : S.me;
    const r = S.engine.answer(pid, text);
    if (!r.ok) { feedback(r.reason, true); Sound.bad(); } else Sound.good(r.t);
  }
  function feedback(msg, bad) {
    const fb = $("#cbFb"); if (!fb) return;
    fb.textContent = msg; fb.className = "feedback" + (bad ? " bad" : "");
    const i = $("#cbIn"); if (i && bad) { i.classList.remove("wobble"); void i.offsetWidth; i.classList.add("wobble"); i.select(); }
  }

  let lastPhase = "", lastHolder = -1, lastRound = -1, lastUsed = -1;
  function render() {
    if (!S || !S.state) return;
    const st = S.state, isHost = S.mode !== "client";
    const meIdx = st.players.findIndex((p) => p.id === S.me);
    const holder = st.players[st.holder];
    const myTurn = st.phase === "playing" && (S.mode === "local" || (holder && holder.id === S.me));
    const chips = st.players.map((p, i) => `<span class="${i === st.holder && st.phase === "playing" ? "hold" : ""} ${p.alive ? "" : "out"}">${esc(p.name)}${p.wins ? " ★" + p.wins : ""}${i === meIdx && S.mode !== "local" ? " (you)" : ""}</span>`).join("");
    const shareUrl = `${location.origin}${location.pathname}#/party/${S.code}`;
    const sameView = st.phase === "playing" && lastPhase === "playing" && st.round === lastRound && st.holder === lastHolder && st.used.length === lastUsed;
    if (sameView) return;
    if (st.phase !== lastPhase && st.phase === "popped") { Sound.pop(); }
    else if (st.phase === "playing" && st.used.length !== lastUsed && st.used.length) Sound.whoosh();
    lastPhase = st.phase; lastHolder = st.holder; lastRound = st.round; lastUsed = st.used.length;
    clearInterval(tickT);
    let body = "";
    if (st.phase === "lobby") {
      body = `<div class="eyebrow">CHERRY BOMB · LOBBY</div>
        ${S.code ? `<div class="code">${esc(S.code)}</div><p class="center muted">Friends join at <a href="${esc(shareUrl)}">${esc(shareUrl)}</a> or with the code.</p>
        <div class="btn-row"><button class="btn small" id="cbCopy" type="button">COPY INVITE LINK</button></div>` : ""}
        <div class="rule">${st.players.length} in the room</div>
        <div class="players">${chips}</div>
        ${isHost ? `<div class="btn-row"><button class="btn primary" id="cbStart" type="button" ${st.players.length < 2 ? "disabled" : ""}>${st.players.length < 2 ? "WAITING FOR PLAYERS…" : "START THE MATCH"}</button></div>` : `<p class="center muted">Waiting for the host to start…</p>`}`;
    } else if (st.phase === "playing") {
      body = `<div class="eyebrow">ROUND ${st.round} · ${st.players.filter((p) => p.alive).length} LEFT</div>
        <div class="prompt-text center">${esc(st.prompt.text)}</div>
        <div class="cherry-stage"><div class="fuse-glow">${J.cherrySVG()}</div></div>
        <div class="holder">${myTurn ? (S.mode === "local" ? `${esc(holder.name)}, it's yours!` : "You have the cherry!") : `${esc(holder ? holder.name : "?")} has the cherry`}</div>
        ${myTurn ? `<form class="answer-row" id="cbForm" autocomplete="off"><input id="cbIn" type="text" enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="60" placeholder="answer to pass it on…" aria-label="Your answer"><button class="btn primary" type="submit">PASS</button></form>` : ""}
        <div class="feedback" id="cbFb">&nbsp;</div>
        <div class="players">${chips}</div>
        ${st.used.length ? `<div class="rule">Used</div><div class="used">${st.used.slice().reverse().map((u) => `<span class="c-${u.t}">${esc(u.ans)}</span>`).join("")}</div>` : ""}`;
    } else if (st.phase === "popped") {
      body = `<div class="eyebrow">ROUND ${st.round}</div>
        <div class="band center" style="font-family:'Press Start 2P',monospace;font-size:34px;color:var(--t-j);margin:10px 0">POP!</div>
        <div class="holder">${esc(st.lastOut)} is OUT.</div>
        ${st.reveal ? `<p class="center muted">${esc(st.prompt.text)}: ${st.reveal.jaffa ? `nobody found the jaffa: <b class="c-j">${esc(st.reveal.jaffa)}</b>` : "the jaffa was found"}${st.reveal.rare.length ? `; still unused: ${st.reveal.rare.map(esc).join(", ")}` : ""}. ${st.reveal.left} answers were left.</p>` : ""}
        <div class="players">${chips}</div>
        <p class="center muted">Next round coming up…</p>`;
    } else if (st.phase === "over") {
      body = `<div class="eyebrow">MATCH OVER</div>
        <div class="cherry-stage">${J.ballSVG()}</div>
        <div class="holder">${esc(st.winner || "Nobody")} wins!</div>
        <div class="players">${chips}</div>
        ${isHost ? `<div class="btn-row"><button class="btn primary" id="cbAgain" type="button">PLAY AGAIN</button>${S.mode === "host" ? `<button class="btn" id="cbLobby" type="button">BACK TO LOBBY</button>` : ""}</div>` : `<p class="center muted">Waiting for the host…</p>`}`;
    }
    J.openPage(`<div class="box">${body}</div>`, { onClose: () => { leave(); location.hash = "#/"; } });
    const start = $("#cbStart"); if (start) start.onclick = () => { Sound.click(); S.engine.start(); };
    const again = $("#cbAgain"); if (again) again.onclick = () => { Sound.click(); S.engine.start(); };
    const lob = $("#cbLobby"); if (lob) lob.onclick = () => S.engine.toLobby();
    const copy = $("#cbCopy"); if (copy) copy.onclick = async () => { try { await navigator.clipboard.writeText(shareUrl); toast("Invite link copied"); } catch (e) { prompt("Invite link:", shareUrl); } };
    const form = $("#cbForm");
    if (form) { const i = $("#cbIn"); setTimeout(() => i.focus({ preventScroll: true }), 30); form.onsubmit = (e) => { e.preventDefault(); sendAnswer(i.value); }; }
    if (st.phase === "playing") tickT = setInterval(() => Sound.tick(), 1000);
  }

  J.routes.party = (code) => {
    if (S && S.code && code && S.code === code.toUpperCase() && S.state) { lastPhase = ""; render(); return; }
    landing(code);
  };
  window.JaffaParty = {
    leaveView() {
      const h = location.hash.replace(/^#\/?/, "");
      if (!h.startsWith("party")) { leave(); lastPhase = ""; }
    },
    _engine: Engine,
  };
})();
