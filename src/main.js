// 火柴建築師 Match Architect — game flow, input and HUD
import { LEVELS, Design, Sim, L, QUAKE_TIME } from './sim.js';
import { REFERENCE } from './designs.js';
import { View, loadModels } from './render3d.js';
import { Audio } from './audio.js';
import { Leaderboard } from './leaderboard.js';
import { Turntable, hasLandmark } from './turntable.js';

const $ = id => document.getElementById(id);
const audio = new Audio();
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const G = {
  state: 'loading', idx: 0, design: null, sim: null, tool: 'match', undo: [],
  drag: null, pointers: new Map(), pinch: null, acc: 0, dustT: 0, lastReason: '', simHold: 0,
  progress: store.get('mq2_progress', { unlocked: 1, stars: {}, best: {} }),
};
G.progress.best = G.progress.best || {};
// coin economy: every match costs 1 coin (paid when the quake starts); after a clear, each unused match of the quota pays back 2
const START_COINS = 30, FLOOR_COINS = 10, MATCH_COST = 1, REFUND = 2;
const ZOOM_STEP = 1.3;   // one tap of + / − on the zoom buttons
G.coins = store.get('mq2_coins', START_COINS);
function setCoins(v) {
  G.coins = Math.max(0, Math.round(v));
  store.set('mq2_coins', G.coins);
  for (const id of ['coinHud', 'coinTitle']) { const e = $(id); if (e) e.textContent = G.coins; }
}
let view;
const lb = new Leaderboard();

const starsFor = (lv, used) => used <= lv.par ? 3 : used <= Math.round(lv.par * 1.25) ? 2 : 1;
const starStr = n => '★★★'.slice(0, n) + '<i>' + '★★★'.slice(n) + '</i>';

// ---------------------------------------------------------------- screens
const OVERLAYS = ['ovLoading', 'ovTitle', 'ovLevels', 'ovIntro', 'ovReveal', 'ovResult', 'ovBoard', 'ovError'];
let turntable = null;
function show(id) {
  for (const o of OVERLAYS) $(o).hidden = o !== id;
  if (id !== 'ovReveal' && turntable) turntable.stop();
  const playing = G.state === 'build' || G.state === 'sim';
  $('hud').hidden = !(playing || G.state === 'result' || G.state === 'intro');
  $('toolbar').hidden = !playing;
  $('zoomCtl').hidden = !playing;
  if (playing) paintZoom();
}
function paintZoom() {
  $('zoomIn').disabled = view.zoom <= view.zoomMin + 1e-3;
  $('zoomOut').disabled = view.zoom >= view.zoomMax - 1e-3;
  $('zoomFit').classList.toggle('dim', !view.zoomed);
}
function toast(msg, ms = 1700) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function titleScreen() {
  G.state = 'title';
  const demo = LEVELS.find(l => l.id === 8);
  view.pad = { top: Math.min(innerHeight * 0.34, 240), bottom: Math.min(innerHeight * 0.3, 230) };
  view.setLevel(demo);
  const d = new Design(demo);
  REFERENCE[8](d);
  view.buildMode = false;
  view.syncDesign(d);
  view.depthGoal = 0.9;
  view.camGoal.pitch = 0.18;
  show('ovTitle');
}
function levelsScreen() {
  G.state = 'levels';
  const grid = $('levelGrid'); grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const locked = i + 1 > G.progress.unlocked;
    const stars = G.progress.stars[lv.id] || 0, best = G.progress.best[lv.id];
    const b = document.createElement('button');
    b.className = 'lvcard c' + (i % 3) + (locked ? ' locked' : '');
    b.disabled = locked;
    const sub = best ? `你的最佳 ${best} 支` : `三星 ≤ ${lv.par} 支 · 最多 ${lv.budget}`;
    const wb = lb.ready ? lb.worldBest(lv.key) : null;
    b.innerHTML = `<span class="lvtop"><span class="lvnum">${lv.id}</span><span class="lvshindo">震度 ${lv.shindo}</span></span>
      <span class="lvname">${lv.name}</span><span class="lvtag">${sub}</span>
      ${wb ? `<span class="lvworld">世界最少 ${wb.n} 支</span>` : ''}
      <span class="lvstars" aria-label="${stars} 顆星">${locked ? '未解鎖' : starStr(stars)}</span>`;
    b.onclick = () => { audio.click(); startLevel(i); };
    grid.appendChild(b);
  });
  show('ovLevels');
}

function startLevel(i, restored) {
  G.idx = i;
  const lv = LEVELS[i];
  G.design = new Design(lv);
  const saved = restored ?? store.get('mq2_design_' + lv.id, null);
  if (saved) { try { G.design.restore(saved); } catch (e) { G.design = new Design(lv); } }
  G.undo = []; G.sim = null; audio.fireStop();
  view.setLevel(lv); view.resetView(); paintZoom();
  view.buildMode = true; view.syncDesign(G.design);
  view.camGoal.yaw = -0.06; view.camGoal.pitch = 0.1;
  setTool('match');
  $('lvTitle').textContent = `${lv.id}　${lv.name}`;
  $('shindoChip').textContent = `震度 ${lv.shindo}`;
  $('qShindo').textContent = `震度 ${lv.shindo}`;
  const no = String(lv.id).padStart(3, '0');
  $('orderNo').textContent = no; $('resNo').textContent = no;
  $('orderStamp').textContent = `震度 ${lv.shindo}`;
  $('introName').textContent = lv.name;
  $('introTag').textContent = lv.place || '火柴建築師工作室（新手訓練）';
  $('introDesc').textContent = lv.desc;
  $('introReal').textContent = lv.real ? '真實建築：' + lv.real : '';
  const li = (ul, items) => { const e = $(ul); e.innerHTML = ''; for (const h of items) { const x = document.createElement('li'); x.innerHTML = h; e.appendChild(x); } };
  li('orderReq', [
    lv.stars.length > 1 ? `碰到並撐住全部 <b>${lv.stars.length}</b> 顆星星` : '碰到並撐住星星（高度目標）',
    `撐過震度 <b>${lv.shindo}</b> 地震 <b>10</b> 秒，膠點一個都不能斷`,
    `火柴最多 <b>${lv.budget}</b> 支，每支成本 <b>${MATCH_COST}</b> 金幣（開震時付款）`,
  ]);
  li('orderReward', [
    `沒用完的火柴每支換 <b>${REFUND}</b> 金幣（最多 <b>+${(lv.budget - 1) * REFUND}</b>）`,
    `<b>${lv.par}</b> 支以內完成：★★★`,
    '上排行榜，比誰用的火柴最少',
  ]);
  $('howto').open = i === 0;
  const best = G.progress.best[lv.id];
  $('introBest').textContent = best ? `你的最佳紀錄：${best} 支` : '';
  $('introBest').hidden = !best;
  $('introHint').textContent = lv.hint;
  updateHUD();
  G.state = 'intro';
  show('ovIntro');
}
function measurePads() {
  const hud = $('hud'), tb = $('toolbar');
  if (!hud.hidden) view.pad.top = hud.getBoundingClientRect().bottom + 34;
  if (!tb.hidden) view.pad.bottom = innerHeight - tb.getBoundingClientRect().top + 12;
}
function beginBuild() {
  G.state = 'build';
  show(null);
  measurePads(); view._frameLevel(false);
  setPlayButton();
  const lv = LEVELS[G.idx];
  const tall = (lv.view[3] - lv.view[2]) > 4.5;
  if (tall) setTimeout(() => toast('建築很大：兩指捏合或右邊的 ＋／－ 可以縮放，單指拖空白處移動畫面', 3000), 400);
}

function updateHUD() {
  const lv = LEVELS[G.idx], d = G.design, used = d.used();
  const box = $('matchBox'); box.innerHTML = '';
  const m = document.createElement('i'); m.className = 'mstick'; box.appendChild(m);
  $('matchCount').innerHTML = `${used}<small>/${lv.budget} 支 · 三星 ≤ ${lv.par}</small>`;
  $('coinHud').textContent = G.coins;
  $('coinCost').textContent = used && G.state !== 'sim' && G.state !== 'result' ? `−${used * MATCH_COST}` : '';
  const reached = d.starsReached();
  $('starCount').textContent = `${reached.filter(Boolean).length}/${reached.length}`;
  const cs = canStart();
  $('btnPlay').classList.toggle('ready', cs.ok);
  $('btnUndo').disabled = !G.undo.length;
  $('btnClear').disabled = !used;
  store.set('mq2_design_' + lv.id, d.snapshot());
}
function canStart() {
  const cs = G.design.canStart();
  if (!cs.ok) return cs;
  const cost = G.design.used() * MATCH_COST;
  if (cost > G.coins) return { ok: false, reason: `金幣不夠：這次要 ${cost} 金幣，你只有 ${G.coins}` };
  return cs;
}
function setTool(t) {
  G.tool = t;
  for (const [id, k] of [['toolMatch', 'match'], ['toolDelete', 'delete']]) $(id).classList.toggle('on', k === t);
  document.body.classList.toggle('deleting', t === 'delete');
}
function pushUndo() { G.undo.push(G.design.snapshot()); if (G.undo.length > 120) G.undo.shift(); }
function refresh(fresh) { view.syncDesign(G.design, fresh); updateHUD(); }

// ---------------------------------------------------------------- quake
function setPlayButton() {
  const b = $('btnPlay');
  if (G.state === 'sim') { b.classList.add('stop'); $('playLabel').textContent = '停止'; }
  else { b.classList.remove('stop'); $('playLabel').textContent = '開始地震'; }
  for (const id of ['toolMatch', 'toolDelete', 'btnUndo', 'btnClear']) $(id).classList.toggle('dim', G.state === 'sim');
}
function startQuake() {
  const cs = canStart();
  if (!cs.ok) { audio.deny(); toast(cs.reason); $('matchBox').classList.remove('shakeit'); void $('matchBox').offsetWidth; $('matchBox').classList.add('shakeit'); return; }
  G.sim = new Sim(LEVELS[G.idx], G.design);
  G.acc = 0; G.simHold = 0;
  G.paid = G.design.used() * MATCH_COST;
  setCoins(G.coins - G.paid);
  $('coinCost').textContent = '';
  view.enterSim(G.sim);
  G.state = 'sim';
  setPlayButton();
  $('quake').hidden = false;
  audio.rumbleStart();
}
function stopQuake() {
  audio.fireStop();
  if (G.state === 'sim' && G.sim && G.sim.state === 'running' && G.paid) setCoins(G.coins + G.paid);   // cancelled mid-quake: matches not burned
  G.paid = 0;
  audio.rumbleStop();
  G.sim = null;
  view.exitSim(G.design);
  G.state = 'build';
  $('quake').hidden = true;
  setPlayButton(); show(null); updateHUD();
}
function simTick(dt) {
  const sim = G.sim; if (!sim) return 0;
  const running = sim.state === 'running';
  if (!running) {
    G.simHold += dt;
    if (G.simHold > (sim.state === 'lost' ? 12 : 4)) { audio.fireStop(); return 0; }   // a lost run keeps burning behind the slip
  }
  G.acc += dt;
  if (G.turbo) { for (let k = 0; k < G.turbo; k++) sim.step(1 / 60); G.acc = 0; }
  else {
    let n = 0;
    while (G.acc >= 1 / 60 && n < 4) { sim.step(1 / 60); G.acc -= 1 / 60; n++; }
    if (n === 4) G.acc = 0;
  }
  for (const ev of sim.events.splice(0)) {
    if (ev.type === 'break') {
      sim.fxN = (sim.fxN || 0) + 1;
      if (sim.fxN <= 5) { view.fxBreak(ev.x, ev.y); audio.snap(); } else { view.fxMelt(ev.x, ev.y); audio.crackle(1); }
      if (sim.fxN === 1) try { navigator.vibrate && navigator.vibrate(50); } catch (e) {}
    }
    if (ev.type === 'melt') { view.fxMelt(ev.x, ev.y); if (Math.random() < 0.5) audio.crackle(0.8); }
    if (ev.type === 'flare') {
      view.fxFlare(ev.x, ev.y);
      if (!(sim.flareT > performance.now() - 120)) { sim.flareT = performance.now(); audio.flare(); }
    }
    if (ev.type === 'lost') {
      audio.rumbleStop(); audio.fireStart(); view.kick(0.35);
      $('quake').hidden = true;
      sim.resultAt = sim.t + 3.2; sim.resultWon = false;   // watch it come down first (game time, so slow phones see it too)
    }
    if (ev.type === 'won') { audio.rumbleStop(); view.fxConfetti(); audio.win(); sim.resultAt = sim.t + 1.1; sim.resultWon = true; }
  }
  if (sim.resultAt !== undefined && sim.t >= sim.resultAt && G.state === 'sim') showResult(sim.resultWon, sim.reason);
  const env = running ? sim.quakeEnv(sim.t) : 0;
  const q = LEVELS[G.idx].quake, strength = env * q.A / 0.12;
  audio.rumbleLevel(Math.min(1.4, strength));
  if (sim.fireT !== null) {
    const n = sim.burning();
    audio.fireLevel(Math.min(1, n / 10));
    if (n && Math.random() < dt * Math.min(30, 4 + n * 1.2)) audio.crackle(Math.min(1, 0.4 + n / 20));
  }
  let maxS = 0; for (const v of sim.stress.values()) maxS = Math.max(maxS, v);
  if (running && maxS > 0.45 && Math.random() < dt * 4) audio.creak(Math.min(1, maxS));
  G.dustT -= dt;
  if (env > 0.3 && G.dustT <= 0) {
    G.dustT = 0.1 / env;
    const lv = LEVELS[G.idx], go = sim.ground.getPosition();
    const a = lv.anchors[Math.floor(Math.random() * lv.anchors.length)];
    view.fxDust(a[0] * L + go.x + (Math.random() - 0.5) * 3, go.y);
  }
  if (running) {
    $('quakeFill').style.width = (Math.min(1, sim.t / QUAKE_TIME) * 100).toFixed(1) + '%';
    $('quakeTime').textContent = Math.max(0, QUAKE_TIME - sim.t).toFixed(1);
  }
  return strength;
}

function showResult(won, reason) {
  if (G.state !== 'sim') return;
  G.state = 'result';
  $('quake').hidden = true;
  const lv = LEVELS[G.idx], used = G.design.used();
  let stars = 0, record = false;
  const paid = G.paid || 0; G.paid = 0;
  let coinLine;
  if (won) {
    const unused = Math.max(0, lv.budget - used), reward = unused * REFUND;
    setCoins(G.coins + reward);
    coinLine = `酬勞結算：成本 <b>−${paid}</b>　省下 ${unused} 支 × ${REFUND} = <b>+${reward}</b><br>金幣 <b class="big">${G.coins}</b>`;
    stars = starsFor(lv, used);
    const p = G.progress;
    p.stars[lv.id] = Math.max(p.stars[lv.id] || 0, stars);
    if (!p.best[lv.id] || used < p.best[lv.id]) { record = !!p.best[lv.id]; p.best[lv.id] = used; }
    p.unlocked = Math.max(p.unlocked, Math.min(LEVELS.length, G.idx + 2));
    store.set('mq2_progress', p);
  } else {
    audio.lose();
    coinLine = `火柴燒掉了：成本 <b>−${paid}</b><br>金幣 <b class="big">${G.coins}</b>`;
    if (G.coins < FLOOR_COINS) { const top = FLOOR_COINS - G.coins; setCoins(FLOOR_COINS); coinLine += `<br>火柴盒補給：送你 ${top} 金幣（補到 ${FLOOR_COINS}）`; }
    if (lb.canSubmit() && lb.nickname) lb.syncCoins(G.coins, lb.nickname);
  }
  $('resCoins').innerHTML = coinLine;
  $('resCard').classList.toggle('won', won);
  $('resStamp').textContent = won ? '合格' : '不合格';
  $('resTitle').textContent = won ? (record ? '驗收通過・新紀錄！' : '驗收通過') : '驗收不合格';
  $('resReason').textContent = won ? `${lv.name}的骨架撐過了震度 ${lv.shindo} 的 10 秒地震。` : reason;
  $('resStars').innerHTML = won ? starStr(stars) : '';
  $('resStats').innerHTML = `用了 <b>${used}</b> 支火柴` + (lv.par && won ? `　·　${stars < 3 ? `${lv.par} 支以內拿三顆星` : '三顆星達成'}　·　最佳 ${G.progress.best[lv.id]} 支` : '');
  const btns = $('resBtns'); btns.innerHTML = '';
  const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = () => { audio.click(); fn(); }; btns.appendChild(b); };
  if (won) {
    mk('省火柴重做', 'ghost', () => stopQuake());
    if (G.idx < LEVELS.length - 1) mk('下一張委託', 'primary', () => startLevel(G.idx + 1));
    else mk('全部完工！回委託清單', 'primary', () => { stopQuake(); levelsScreen(); });
  } else {
    mk('拆掉重蓋', 'ghost', () => { stopQuake(); pushUndo(); G.design.clear(); refresh(); });
    mk('修改設計再驗收', 'primary', () => stopQuake());
  }
  renderResultBoard(won, lv, used);
  G.state = 'result';
  if (won && hasLandmark(lv.key)) showReveal(lv);
  else show('ovResult');
  $('toolbar').hidden = true;
}
// 完工模型: the Q-version of the real building spins on a turntable before the inspection slip
function showReveal(lv) {
  $('revealName').textContent = lv.name;
  $('revealWhere').textContent = [lv.place || '火柴建築師工作室', lv.real ? '真實建築：' + lv.real : ''].filter(Boolean).join('　');
  show('ovReveal');
  try { turntable = turntable || new Turntable($('revealCanvas')); } catch (e) { console.error(e); show('ovResult'); return; }
  turntable.show(lv.key).then(ok => { if (!ok && G.state === 'result') show('ovResult'); });
  audio.cheer();
}
function closeReveal() { if (turntable) turntable.stop(); show('ovResult'); }

// ---------------------------------------------------------------- leaderboard UI
function rowsHTML(rows, max, unit = '支') {
  const list = document.createElement('ol'); list.className = 'board';
  const mine = rows.findIndex(r => r.me);
  rows.forEach((r, i) => {
    if (i >= max && i !== mine) return;
    if (i === max && mine > max) { const gap = document.createElement('li'); gap.className = 'gap'; gap.textContent = '⋯'; list.appendChild(gap); }
    const li = document.createElement('li'); if (r.me) li.className = 'me';
    const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = i + 1;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name + (r.me ? '（你）' : '');
    const n = document.createElement('span'); n.className = 'n'; n.textContent = r.n + ' ' + unit;
    li.append(rk, nm, n); list.appendChild(li);
  });
  return list;
}
let resultCtx = null;
function renderResultBoard(won, lv, used) {
  const box = $('resBoard');
  resultCtx = won ? { lv, used, design: G.design.snapshot() } : null;
  box.hidden = !lb.available || !won;
  if (box.hidden) return;
  paintResultBoard();
  if (lb.canSubmit() && lb.nickname) uploadScore(lb.nickname);
}
function paintResultBoard() {
  if (!resultCtx) return;
  const { lv } = resultCtx;
  const rows = lb.ranking(lv.key);
  const list = $('resBoardList'); list.innerHTML = '';
  if (!lb.ready) list.textContent = '讀取排行榜中…';
  else if (!rows.length) list.textContent = '還沒有人上榜，你可以當第一名。';
  else list.appendChild(rowsHTML(rows, 5));
  const form = $('resBoardForm'), note = $('resBoardNote');
  form.hidden = true; note.textContent = '';
  if (!lb.uid) note.textContent = '登入 Claude 後才能上傳成績。';
  else if (lb.readOnly) note.textContent = '你目前只能查看排行榜，沒有上傳權限。';
  else if (!lb.nickname) { form.hidden = false; }
  else if (resultCtx.status === 'done') {
    const mr = lb.myRank(resultCtx.lv.key);
    note.textContent = resultCtx.improved ? (mr ? `已上傳！目前排第 ${mr.rank} 名（共 ${mr.of} 人）` : '已上傳！')
      : (mr ? `你在這關的紀錄是 ${mr.n} 支，排第 ${mr.rank} 名` : '這次沒有比你的紀錄少');
  } else if (resultCtx.status) note.textContent = resultCtx.status;
}
async function uploadScore(name) {
  if (!resultCtx) return;
  const ctx = resultCtx;
  ctx.status = '上傳中…'; paintResultBoard();
  const r = await lb.submit(ctx.lv.key, ctx.used, name, ctx.design, G.coins);
  if (resultCtx !== ctx) return;
  if (r.ok) { ctx.status = 'done'; ctx.improved = r.improved; }
  else ctx.status = r.reason === 'readonly' ? '' : r.reason === 'full' ? '排行榜已滿，無法再新增玩家。' : '上傳失敗，請稍後再試。';
  paintResultBoard();
}
function boardScreen(levelIdx) {
  const sel = $('boardLevel');
  if (!sel.options.length) {
    const c = document.createElement('option'); c.value = '__coins'; c.textContent = '金幣總榜'; sel.appendChild(c);
    for (const lv of LEVELS) { const o = document.createElement('option'); o.value = lv.key; o.textContent = `${lv.id}　${lv.name}`; sel.appendChild(o); }
  }
  if (levelIdx !== undefined) sel.value = LEVELS[levelIdx].key;
  G.prevState = G.state; G.state = 'board';
  show('ovBoard');
  paintBoard();
}
function paintBoard() {
  if ($('ovBoard').hidden && G.state !== 'board') return;
  const key = $('boardLevel').value || '__coins';
  const coinsBoard = key === '__coins';
  const lv = LEVELS.find(l => l.key === key);
  const rows = coinsBoard ? lb.coinRanking() : lb.ranking(key), list = $('boardList');
  list.innerHTML = '';
  if (!lb.ready) list.textContent = '讀取排行榜中…';
  else if (!rows.length) list.textContent = '這關還沒有人上榜。';
  else list.appendChild(rowsHTML(rows, 20, coinsBoard ? '金幣' : '支'));
  $('boardInfo').textContent = coinsBoard ? '金幣越多排越前面：省下的火柴每支換 2 金幣' : `震度 ${lv.shindo} · 用最少火柴撐過 10 秒的人排前面`;
}

// ---------------------------------------------------------------- input
function hitRadius(e) { return Math.min((e.pointerType === 'mouse' ? 16 : 30) * view.worldPerPx(), 0.45 * L); }
function onDown(e) {
  if (!['build', 'sim', 'result'].includes(G.state)) return;
  e.preventDefault();
  audio.unlock();
  try { $('gl').setPointerCapture(e.pointerId); } catch (err) {}
  G.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (G.pointers.size === 2) {
    G.drag = null; view.setGhost(null);
    const [a, b] = [...G.pointers.values()];
    G.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    return;
  }
  if (G.pointers.size > 2) return;
  const w = view.screenToWorld(e.clientX, e.clientY);
  if (G.state === 'build') {
    if (G.tool === 'delete') {
      const h = G.design.hitStick(w.x, w.y, hitRadius(e));
      if (h) { pushUndo(); G.design.removeStick(h.id); audio.remove(); refresh(); return; }
    } else {
      const h = G.design.hit(w.x, w.y, hitRadius(e));
      if (h) { G.drag = { start: h, pv: null }; return; }
    }
  }
  G.drag = { pan: true, x: e.clientX, y: e.clientY, moved: 0 };
}
function onMove(e) {
  if (!G.pointers.has(e.pointerId)) return;
  e.preventDefault();
  G.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (G.pinch && G.pointers.size >= 2) {
    const [a, b] = [...G.pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const wpp = view.worldPerPx();
    view.panBy(-(mx - G.pinch.mx) * wpp, (my - G.pinch.my) * wpp);
    const w = view.screenToWorld(mx, my);
    if (d > 10 && G.pinch.d > 10) view.zoomBy(G.pinch.d / d, w.x, w.y);
    G.pinch = { d, mx, my };
    paintZoom();
    return;
  }
  const dr = G.drag;
  if (!dr) return;
  if (dr.pan) {
    const wpp = view.worldPerPx();
    view.panBy(-(e.clientX - dr.x) * wpp, (e.clientY - dr.y) * wpp);
    dr.moved += Math.abs(e.clientX - dr.x) + Math.abs(e.clientY - dr.y);
    dr.x = e.clientX; dr.y = e.clientY;
    paintZoom();
    return;
  }
  if (dr.start && G.state === 'build') {
    const w = view.screenToWorld(e.clientX, e.clientY);
    dr.pv = G.design.preview(dr.start, w.x, w.y);
    if (dr.pv && dr.pv.ok && (G.design.used() + 1) * MATCH_COST > G.coins) { dr.pv.ok = false; dr.pv.reason = '金幣不夠了'; }
    view.setGhost(dr.pv);
    const reason = dr.pv && !dr.pv.ok ? dr.pv.reason : '';
    if (reason && reason !== G.lastReason) toast(reason, 1100);
    G.lastReason = reason;
  }
}
function onUp(e) {
  if (!G.pointers.has(e.pointerId)) return;
  G.pointers.delete(e.pointerId);
  if (G.pinch && G.pointers.size < 2) {
    // one finger lifted after a pinch: the other keeps panning instead of freezing
    G.pinch = null;
    if (G.pointers.size === 1) { const [p] = [...G.pointers.values()]; G.drag = { pan: true, x: p.x, y: p.y, moved: 99 }; }
    return;
  }
  const dr = G.drag;
  if (!dr) return;
  if (G.pointers.size) return;
  G.drag = null;
  if (dr.pan) {
    if (dr.moved < 8 && G.state === 'build' && G.tool !== 'delete') toast('從紅色錨點或火柴上按住拖曳', 1400);
    return;
  }
  view.setGhost(null);
  G.lastReason = '';
  if (dr.start && dr.pv && G.state === 'build') {
    if (dr.pv.ok) { pushUndo(); const s = G.design.commit(dr.start, dr.pv); audio.place(); refresh(s && s.id); }
    else audio.deny();
  }
}

function bindUI() {
  const c = $('gl');
  c.addEventListener('pointerdown', onDown, { passive: false });
  c.addEventListener('pointermove', onMove, { passive: false });
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', onUp);
  c.addEventListener('contextmenu', e => e.preventDefault());
  c.addEventListener('wheel', e => {
    if (!['build', 'sim', 'result'].includes(G.state)) return;
    e.preventDefault();
    // mouse wheel ≈ ±100 per notch; a trackpad pinch arrives as small ctrl+wheel deltas
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const f = Math.exp(Math.max(-0.5, Math.min(0.5, dy * (e.ctrlKey ? 0.01 : 0.0015))));
    const w = view.screenToWorld(e.clientX, e.clientY);
    view.zoomBy(f, w.x, w.y);
    paintZoom();
  }, { passive: false });
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, e => e.preventDefault(), { passive: false });
  // zoom buttons (+ keyboard + − 0)
  const zoomIn = () => { view.zoomStep(1 / ZOOM_STEP); paintZoom(); };
  const zoomOut = () => { view.zoomStep(ZOOM_STEP); paintZoom(); };
  const zoomFit = () => { view.resetView(); paintZoom(); };
  $('zoomIn').addEventListener('click', () => { audio.unlock(); audio.click(); zoomIn(); });
  $('zoomOut').addEventListener('click', () => { audio.unlock(); audio.click(); zoomOut(); });
  $('zoomFit').addEventListener('click', () => { audio.unlock(); audio.click(); zoomFit(); });
  document.addEventListener('keydown', e => {
    if (!['build', 'sim'].includes(G.state) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === '+' || e.key === '=') zoomIn();
    else if (e.key === '-' || e.key === '_') zoomOut();
    else if (e.key === '0') zoomFit();
    else return;
    e.preventDefault();
  });
  const on = (id, fn) => $(id).addEventListener('click', e => { audio.unlock(); fn(e); });
  on('btnStart', () => { audio.click(); const n = Math.min(G.progress.unlocked, LEVELS.length) - 1; startLevel(Math.max(0, n)); });
  on('btnLevels', () => { audio.click(); levelsScreen(); });
  on('btnLevelsBack', () => { audio.click(); titleScreen(); });
  on('btnBoard', () => { audio.click(); boardScreen(); });
  on('btnRevealGo', () => { audio.click(); closeReveal(); });
  on('btnBoardBack', () => { audio.click(); titleScreen(); });
  $('boardLevel').addEventListener('change', paintBoard);
  $('resBoardForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('nickInput').value.trim();
    if (!name) { $('nickInput').focus(); return; }
    audio.click(); uploadScore(name);
  });
  on('btnIntroGo', () => { audio.click(); beginBuild(); });
  on('btnMenu', () => { audio.click(); if (G.state === 'sim' || G.state === 'result') stopQuake(); levelsScreen(); });
  on('btnHelp', () => { audio.click(); if (G.state === 'build') { G.state = 'intro'; show('ovIntro'); } });
  on('toolMatch', () => { if (G.state === 'build') { audio.click(); setTool('match'); } });
  on('toolDelete', () => { if (G.state === 'build') { audio.click(); setTool(G.tool === 'delete' ? 'match' : 'delete'); if (G.tool === 'delete') toast('點一下火柴把它拿掉', 1300); } });
  on('btnUndo', () => { if (G.state === 'build' && G.undo.length) { audio.remove(); G.design.restore(G.undo.pop()); refresh(); } });
  on('btnClear', () => {
    if (G.state !== 'build' || !G.design.used()) return;
    const b = $('btnClear');
    if (!b.classList.contains('confirm')) { b.classList.add('confirm'); $('clearLabel').textContent = '確定？'; setTimeout(() => { b.classList.remove('confirm'); $('clearLabel').textContent = '清空'; }, 2200); return; }
    b.classList.remove('confirm'); $('clearLabel').textContent = '清空';
    pushUndo(); G.design.clear(); audio.remove(); refresh();
  });
  on('btnPlay', () => { if (G.state === 'build') startQuake(); else if (G.state === 'sim') stopQuake(); });
  const sync = () => { $('btnSound').classList.toggle('off', audio.muted); $('btnSoundT').textContent = audio.muted ? '音效：關' : '音效：開'; };
  on('btnSound', () => { audio.setMuted(!audio.muted); sync(); });
  on('btnSoundT', () => { audio.setMuted(!audio.muted); sync(); });
  on('btnMusicT', () => { audio.setMusic(!audio.musicOn); $('btnMusicT').textContent = audio.musicOn ? '音樂：開' : '音樂：關'; });
  sync(); $('btnMusicT').textContent = audio.musicOn ? '音樂：開' : '音樂：關';
  const rs = () => { measurePads(); view.resize(); };
  addEventListener('resize', rs);
  addEventListener('orientationchange', () => setTimeout(rs, 250));
  new ResizeObserver(rs).observe(c);
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  let q = 0;
  if (G.state === 'sim' || G.state === 'result') { q = simTick(dt); if (G.sim) view.syncSim(G.sim, dt); }
  if (G.state === 'title') view.camGoal.yaw = 0.3 + Math.sin(now / 5000) * 0.35;
  view.render(dt, q);
  requestAnimationFrame(loop);
}

function fatal(msg) {
  const box = $('errMsg');
  if (box) box.textContent = msg;
  for (const o of OVERLAYS) $(o).hidden = o !== 'ovError';
}

export async function boot(data = {}) {
  window.__mqBooted = true;
  try {
    const models = await loadModels();
    view = new View($('gl'), models);
    bindUI();
    setCoins(G.coins);
    window.__mq = { G, LEVELS, REFERENCE, lb, get view() { return view; }, get turntable() { return turntable; }, loadRef(id) { G.design.clear(); REFERENCE[id](G.design); refresh(); },
      reveal(id) { G.idx = LEVELS.findIndex(l => l.id === id); G.state = 'result'; showReveal(LEVELS[G.idx]); } };
    lb.onChange(() => {
      $('btnBoard').hidden = !lb.available;
      if (G.state === 'levels') levelsScreen();
      if (G.state === 'board') paintBoard();
      if (G.state === 'result') paintResultBoard();
    });
    lb.init().then(ok => { $('btnBoard').hidden = !ok; });
    const hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) hot.snapshot(() => ({ idx: G.idx, design: G.design && G.design.snapshot(), state: G.state }));
    data = data || {};
    if (data.design && (data.state === 'build' || data.state === 'intro')) { startLevel(data.idx, data.design); beginBuild(); }
    else titleScreen();
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    fatal('3D 畫面啟動失敗：' + (err && err.message ? err.message : err));
  }
}
window.addEventListener('error', e => { if (!view) fatal('載入錯誤：' + e.message); });
