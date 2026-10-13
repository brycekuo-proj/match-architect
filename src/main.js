// 火柴建築師 Match Architect — game flow, input and HUD
import { LEVELS, Design, Sim, L, QUAKE_TIME } from './sim.js';
import { REFERENCE } from './designs.js';
import { View, loadModels } from './render3d.js';
import { Audio } from './audio.js';
import { Leaderboard } from './leaderboard.js';
import { Turntable, hasLandmark } from './turntable.js';
import { t, sh, lvt, LANG, setLang, applyStatic } from './i18n.js';
import { Coach, HintLayer, ScanLayer } from './coach.js';
import { Shop } from './shop.js';
import { ICONS } from './icons.js';
import { Ads, setAdText, REMOVE_ADS_PRICE } from './ads.js';

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
G.earned = Math.max(store.get('mq2_earned', 0), G.coins);   // lifetime coins earned (the coin leaderboard), spending doesn't lower it
const earn = n => { G.earned += Math.max(0, n); store.set('mq2_earned', G.earned); };
const shop = new Shop(store);
const ads = new Ads(store); setAdText(t);   // off in web builds; ?ads=mock to try the flow; AdMob in the app
function setCoins(v) {
  G.coins = Math.max(0, Math.round(v));
  store.set('mq2_coins', G.coins);
  for (const id of ['coinHud', 'coinTitle', 'coinShop']) { const e = $(id); if (e) e.textContent = G.coins; }
}
let view;
const lb = new Leaderboard();

const starsFor = (lv, used) => used <= lv.par ? 3 : used <= Math.round(lv.par * 1.25) ? 2 : 1;
const starStr = n => '★★★'.slice(0, n) + '<i>' + '★★★'.slice(n) + '</i>';

// ---------------------------------------------------------------- screens
const OVERLAYS = ['ovLoading', 'ovTitle', 'ovLevels', 'ovIntro', 'ovReveal', 'ovResult', 'ovBoard', 'ovShop', 'ovCollect', 'ovError'];
let turntable = null, coach = null, hint = null, scan = null;
function show(id) {
  for (const o of OVERLAYS) $(o).hidden = o !== id;
  if (id !== 'ovReveal' && turntable) turntable.stop();
  const playing = G.state === 'build' || G.state === 'sim';
  $('hud').hidden = !(playing || G.state === 'result' || G.state === 'intro');
  $('toolbar').hidden = !playing;
  $('zoomCtl').hidden = !playing;
  $('itemTray').hidden = !playing || !!G.guide;   // the hands-on tutorial keeps the screen simple
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
  titleDemo();
  show('ovTitle');
  paintDaily();
}
// 每日禮物 (ad builds only): 30 coins a day, 60 with a rewarded ad
function paintDaily() {
  const b = $('btnDaily');
  b.hidden = !ads.enabled;
  b.classList.toggle('done', ads.dailyClaimed());
}
function onDaily() {
  if (ads.dailyClaimed()) { toast(t('daily.done')); return; }
  const give = n => { if (ads.dailyClaimed()) return; ads.claimDaily(); setCoins(G.coins + n); audio.win(); toast(t('daily.got', { n })); paintDaily(); };
  ask(t('daily.ask'), [
    { label: t('daily.ad'), cls: 'adbtn', fn: async () => { const ok = await ads.rewarded(); if (!ok) toast(t('ad.none')); give(ok ? 60 : 30); } },
    { label: t('daily.take'), cls: 'ghost', fn: () => give(30) }]);
}
function titleDemo() {
  const demo = LEVELS.find(l => l.id === 8);
  view.pad = { top: Math.min(innerHeight * 0.34, 240), bottom: Math.min(innerHeight * 0.3, 230) };
  view.setLevel(demo);
  const d = new Design(demo);
  REFERENCE[8](d);
  view.buildMode = false; view.load = null; view.pick = null;
  view.syncDesign(d);
  view.depthGoal = 0.9;
  view.camGoal.pitch = 0.18;
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
    const sub = best ? t('lv.best', { n: best }) : t('lv.sub', { par: lv.par, budget: lv.budget });
    const wb = lb.ready ? lb.worldBest(lv.key) : null;
    b.innerHTML = `<span class="lvtop"><span class="lvnum">${lv.id}</span><span class="lvshindo">${t('shindo', { s: sh(lv.shindo) })}</span></span>
      <span class="lvname">${lvt(lv, 'name')}</span><span class="lvtag">${sub}</span>
      ${wb ? `<span class="lvworld">${t('lv.world', { n: wb.n })}</span>` : ''}
      <span class="lvstars" aria-label="${t('lv.starsA', { n: stars })}">${locked ? t('lv.locked') : starStr(stars)}</span>`;
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
  G.load = loadFor(lv); pruneLoad(); hideScan();
  view.setLevel(lv); view.resetView(); paintZoom();
  view.buildMode = true; view.load = G.load; view.pick = null; view.syncDesign(G.design);
  view.camGoal.yaw = -0.06; view.camGoal.pitch = 0.1;
  setTool('match');
  const S = sh(lv.shindo);
  $('lvTitle').textContent = `${lv.id}　${lvt(lv, 'name')}`;
  $('shindoChip').textContent = t('shindo', { s: S });
  $('qShindo').textContent = t('shindo', { s: S });
  const no = String(lv.id).padStart(3, '0');
  $('orderNo').textContent = no; $('resNo').textContent = no;
  $('orderStamp').textContent = t('shindo', { s: S });
  $('introName').textContent = lvt(lv, 'name');
  $('introTag').textContent = lvt(lv, 'place') || t('order.tutorial');
  $('introDesc').textContent = lvt(lv, 'desc');
  $('introReal').textContent = lv.real ? t('order.real', { r: lvt(lv, 'real') }) : '';
  const li = (ul, items) => { const e = $(ul); e.innerHTML = ''; for (const h of items) { const x = document.createElement('li'); x.innerHTML = h; e.appendChild(x); } };
  li('orderReq', [
    lv.stars.length > 1 ? t('req.stars', { n: lv.stars.length }) : t('req.star'),
    t('req.quake', { s: S }),
    t('req.quota', { budget: lv.budget, cost: MATCH_COST }),
  ]);
  li('orderReward', [
    t('rew.refund', { r: REFUND, max: (lv.budget - 1) * REFUND }),
    t('rew.par', { par: lv.par }),
    t('rew.board'),
  ]);
  // first jobs: a hands-on tutorial instead of a wall of text (until cleared once, or skipped)
  if (hint) hint.hide();
  G.guide = !!coach && !G.progress.stars[lv.id] && !store.get('mq_guide_off', false) && coach.start(lv.id);
  if (!G.guide && coach) coach.stop();
  $('howto').open = false; $('howto').hidden = G.guide;
  $('orderRewardBox').hidden = G.guide && i === 0;
  $('btnIntroGo').textContent = t(G.guide ? 'order.goTutorial' : 'order.go');
  const best = G.progress.best[lv.id];
  $('introBest').textContent = best ? t('order.best', { n: best }) : '';
  $('introBest').hidden = !best;
  $('introHint').textContent = lvt(lv, 'hint');
  updateHUD(); paintTray();
  G.state = 'intro';
  show('ovIntro');
}
function measurePads() {
  const hud = $('hud'), tb = $('toolbar');
  if (!hud.hidden) view.pad.top = hud.getBoundingClientRect().bottom + 34;
  if (!tb.hidden) view.pad.bottom = innerHeight - tb.getBoundingClientRect().top + 12;
  const tray = $('itemTray'), zc = $('zoomCtl');
  view.pad.left = tray.hidden ? 0 : tray.getBoundingClientRect().right + 6;
  view.pad.right = zc.hidden ? 0 : innerWidth - zc.getBoundingClientRect().left + 6;
}
function beginBuild() {
  G.state = 'build';
  show(null);
  measurePads(); view._frameLevel(false);
  setPlayButton();
  const lv = LEVELS[G.idx];
  const tall = (lv.view[3] - lv.view[2]) > 4.5;
  if (tall) setTimeout(() => toast(t('toast.big'), 3000), 400);
}

function updateHUD() {
  const lv = LEVELS[G.idx], d = G.design, used = d.used();
  const box = $('matchBox'); box.innerHTML = '';
  const m = document.createElement('i'); m.className = 'mstick'; box.appendChild(m);
  $('matchCount').innerHTML = t('hud.count', { used, budget: lv.budget, par: lv.par });
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
  if (!cs.ok) return { ...cs, reason: why(cs) };
  const cost = G.design.used() * MATCH_COST;
  if (cost > G.coins) return { ok: false, reason: t('why.coins', { cost, coins: G.coins }) };
  return cs;
}
const PLACING = { cfrp: 1, strut: 1, damper: 1 };
function setTool(tool) {
  G.tool = tool;
  for (const [id, k] of [['toolMatch', 'match'], ['toolDelete', 'delete']]) $(id).classList.toggle('on', k === tool);
  document.body.classList.toggle('deleting', tool === 'delete');
  document.body.classList.toggle('placing', !!PLACING[tool]);
  G.strutA = null; if (view) view.setPick(null);
  paintPlace(); paintTray();
}
const why = r => r.code ? t('why.' + r.code, r) : r.reason;
function pushUndo() { G.undo.push(G.design.snapshot()); if (G.undo.length > 120) G.undo.shift(); }
function refresh(fresh) { pruneLoad(); saveLoad(); hideScan(); view.syncDesign(G.design, fresh); updateHUD(); paintTray(); paintPlace(); }

// ---------------------------------------------------------------- quake
function setPlayButton() {
  const b = $('btnPlay');
  if (G.state === 'sim') { b.classList.add('stop'); $('playLabel').textContent = t('play.stop'); }
  else { b.classList.remove('stop'); $('playLabel').textContent = t('play.start'); }
  for (const id of ['toolMatch', 'toolDelete', 'btnUndo', 'btnClear']) $(id).classList.toggle('dim', G.state === 'sim');
  paintTray();
}
function startQuake() {
  const cs = canStart();
  if (!cs.ok) { audio.deny(); toast(cs.reason); $('matchBox').classList.remove('shakeit'); void $('matchBox').offsetWidth; $('matchBox').classList.add('shakeit'); return; }
  const ld = G.load, need = supplyNeed(ld);
  const short = Object.keys(need).filter(id => need[id] > shop.count(id));
  if (short.length) {
    audio.deny();
    ask(t('load.short', { list: short.map(id => t('load.need', { name: t('nm.' + id), need: need[id], have: shop.count(id) })).join(LANG === 'en' ? '; ' : '；') }), [
      { label: t('load.drop'), cls: 'primary', fn: () => { dropItems(short); itemsChanged(); startQuake(); } },
      { label: t('btn.cancel'), cls: 'ghost' }]);
    return;
  }
  for (const id in need) shop.take(id, need[id]);
  G.spent = need;
  G.runItems = activeItems(ld);
  const used = Object.keys(need).filter(id => need[id]);
  if (used.length) toast(t('toast.used', { list: used.map(id => t('nm.' + id) + (need[id] > 1 ? ' ×' + need[id] : '')).join(LANG === 'en' ? ', ' : '、') }), 1600);
  setTool('match'); hideScan();
  G.sim = new Sim(LEVELS[G.idx], G.design, undefined, simOpts(ld));
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
  if (G.state === 'sim' && G.sim && G.sim.state === 'running') {   // cancelled mid-quake: matches not burned, supplies not used
    if (G.paid) setCoins(G.coins + G.paid);
    if (G.spent && Object.values(G.spent).some(n => n)) { for (const id in G.spent) shop.give(id, G.spent[id]); toast(t('toast.refund'), 1500); }
  }
  G.paid = 0; G.spent = null;
  audio.rumbleStop();
  G.sim = null;
  view.exitSim(G.design);
  G.state = 'build';
  $('quake').hidden = true;
  setPlayButton(); show(null); updateHUD(); paintTray();
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
    if (ev.type === 'yield') { view.fxYield(ev.x, ev.y); audio.creak(0.7); }
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
  if (sim.resultAt !== undefined && sim.t >= sim.resultAt && G.state === 'sim') showResult(sim.resultWon, t('fail.' + (sim.reasonCode || 'joint')));
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
  const paid = G.paid || 0; G.paid = 0; G.spent = null;
  const items = G.runItems || [];
  let coinLine, reward = 0;
  if (won) {
    const unused = Math.max(0, lv.budget - used); reward = unused * REFUND;
    ads.cleared();
    setCoins(G.coins + reward); earn(reward);
    coinLine = t('res.pay', { paid, unused, r: REFUND, reward, coins: G.coins });
    stars = starsFor(lv, used);
    const p = G.progress;
    p.stars[lv.id] = Math.max(p.stars[lv.id] || 0, stars);
    if (!p.best[lv.id] || used < p.best[lv.id]) { record = !!p.best[lv.id]; p.best[lv.id] = used; }
    p.unlocked = Math.max(p.unlocked, Math.min(LEVELS.length, G.idx + 2));
    store.set('mq2_progress', p);
  } else {
    audio.lose();
    coinLine = t('res.burn', { paid, coins: G.coins });
    if (G.coins < FLOOR_COINS) { const top = FLOOR_COINS - G.coins; setCoins(FLOOR_COINS); coinLine += t('res.topup', { top, floor: FLOOR_COINS }); }
    if (lb.canSubmit() && lb.nickname) lb.syncCoins(G.earned, lb.nickname);
  }
  $('resCoins').innerHTML = coinLine;
  // rewarded ad offers (ad builds only): double the pay after a pass, or get the burned matches back after a fall
  const adBox = $('resAd'); adBox.innerHTML = ''; adBox.hidden = true;
  const adOffer = (label, n) => {
    const b = document.createElement('button'); b.className = 'btn adbtn'; b.textContent = label;
    b.onclick = async () => {
      audio.click(); b.disabled = true;
      if (await ads.rewarded()) { setCoins(G.coins + n); audio.win(); toast(t('ad.got', { n })); adBox.hidden = true; $('resCoins').innerHTML += `<br>${t('ad.got', { n })}`; }
      else { b.disabled = false; toast(t('ad.none')); }
    };
    adBox.appendChild(b); adBox.hidden = false;
  };
  if (ads.enabled) {
    if (won && reward > 0) adOffer(t('ad.double', { n: reward }), reward);
    else if (!won && paid > 0) adOffer(t('ad.refund', { n: paid }), paid);
  }
  $('resCard').classList.toggle('won', won);
  $('resStamp').textContent = won ? t('stamp.ok') : t('stamp.no');
  $('resTitle').textContent = won ? (record ? t('res.passRecord') : t('res.pass')) : t('res.fail');
  $('resReason').textContent = won ? t('res.passWhy', { name: lvt(lv, 'name'), s: sh(lv.shindo) }) : reason;
  $('resStars').innerHTML = won ? starStr(stars) : '';
  $('resStats').innerHTML = t('res.used', { n: used }) + (lv.par && won ? `　·　${stars < 3 ? t('res.toThree', { par: lv.par }) : t('res.three')}　·　${t('res.best', { n: G.progress.best[lv.id] })}` : '')
    + (items.length ? `<br><small class="resitems">${t('res.items', { list: itemList(items) })}</small>` : '');
  const btns = $('resBtns'); btns.innerHTML = '';
  const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = () => { audio.click(); fn(); }; btns.appendChild(b); };
  if (won) {
    mk(t('btn.retryLess'), 'ghost', () => stopQuake());
    // an interstitial can only come here, between jobs (see Ads.interstitialDue for the pacing)
    if (G.idx < LEVELS.length - 1) mk(t('btn.next'), 'primary', async () => { if (ads.interstitialDue(lv.id, shop.noAds)) await ads.interstitial(); startLevel(G.idx + 1); });
    else mk(t('btn.allDone'), 'primary', () => { stopQuake(); levelsScreen(); });
  } else {
    mk(t('btn.tearDown'), 'ghost', () => { stopQuake(); pushUndo(); G.design.clear(); refresh(); });
    mk(t('btn.fix'), 'primary', () => stopQuake());
  }
  renderResultBoard(won, lv, used, items.length > 0);
  G.state = 'result';
  if (won && hasLandmark(lv.key)) showReveal(lv);
  else show('ovResult');
  $('toolbar').hidden = true;
}
// 完工模型: the Q-version of the real building spins on a turntable before the inspection slip
function showReveal(lv, mode = 'result') {
  G.revealMode = mode;
  $('btnRevealGo').textContent = t(mode === 'collect' ? 'col.back' : 'reveal.go');
  $('revealName').textContent = lvt(lv, 'name');
  $('revealWhere').textContent = [lvt(lv, 'place') || t('reveal.studio'), lv.real ? t('order.real', { r: lvt(lv, 'real') }) : ''].filter(Boolean).join('　');
  show('ovReveal');
  try { turntable = turntable || new Turntable($('revealCanvas')); } catch (e) { console.error(e); show('ovResult'); return; }
  turntable.show(lv.key).then(ok => { if (!ok && G.state === 'result') show('ovResult'); });
  if (mode === 'result') audio.cheer();
}
function closeReveal() { if (turntable) turntable.stop(); if (G.revealMode === 'collect') collectScreen(); else show('ovResult'); }

// ---------------------------------------------------------------- shop (火柴雜貨店)
G.shopTab = 'item';
// only reachable from the title screen: nothing can be bought while a job is under way
function shopScreen(tab) {
  G.state = 'shop';
  if (tab) G.shopTab = tab;
  G.peek = null;
  show('ovShop'); paintShop();
}
function paintShop() {
  const kind = G.shopTab, look = kind === 'skin' || kind === 'scene';
  for (const b of document.querySelectorAll('#ovShop .tab')) b.classList.toggle('on', b.dataset.tab === kind);
  $('shopNote').textContent = t('shop.note.' + kind);
  $('coinShop').textContent = G.coins;
  const grid = $('shopGrid'); grid.innerHTML = '';
  for (const it of Shop.list(kind)) {
    const key = `${kind}.${it.id}`, card = document.createElement('div');
    const using = look && shop[kind] === it.id, owned = look && shop.owns(kind, it.id);
    const n = look ? 0 : shop.count(it.id);
    card.className = 'sitem' + (using ? ' on' : '') + (G.peek === key ? ' peek' : '');
    const badge = !n ? '' : `<em>×${n}</em>`;
    const prev = look ? `<div class="sprev ${kind}-${it.id}">${kind === 'skin' ? '<i class="stk"></i><i class="hd"></i>' : ''}</div>`
      : `<div class="sprev item">${ICONS[it.id]}${badge}</div>`;
    const own = look || !n ? '' : `<span class="own">${t('shop.stock', { n })}</span>`;
    card.innerHTML = `${prev}<div class="sinfo"><b>${t(key)}</b><small>${t(key + '.d')}</small>${own}</div>`;
    const btn = document.createElement('button'); btn.className = 'btn sbuy';
    if (using) { btn.classList.add('using'); btn.textContent = t('shop.using'); btn.disabled = true; }
    else if (owned) { btn.textContent = t('shop.equip'); btn.onclick = e => { e.stopPropagation(); audio.click(); shop.equip(kind, it.id); applyLook(); paintShop(); }; }
    else {
      btn.classList.add('price'); if (G.coins < it.price) btn.classList.add('short');
      btn.innerHTML = `<i class="coin" aria-hidden="true"></i>${it.price}`;
      btn.onclick = e => { e.stopPropagation(); buyItem(kind, it); };
    }
    card.appendChild(btn);
    if (look) card.onclick = () => { audio.click(); G.peek = key; preview(kind, it.id); paintShop(); };
    grid.appendChild(card);
  }
  if (kind === 'item' && ads.enabled) adCards(grid);
}
// ad builds: free coins / hint tickets for rewarded ads (a few a day), and the remove-ads purchase
function adCards(grid) {
  const card = (cls, prev, name, desc, btn, extra) => {
    const c = document.createElement('div'); c.className = 'sitem ' + cls;
    c.innerHTML = `<div class="sprev item">${prev}</div><div class="sinfo"><b>${name}</b><small>${desc}</small></div>`;
    if (extra) c.querySelector('.sinfo').appendChild(extra);
    c.appendChild(btn); return c;
  };
  const mkb = (label, cls, fn, off) => { const b = document.createElement('button'); b.className = 'btn sbuy ' + cls; b.textContent = label; b.disabled = !!off; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; };
  for (const kind of ['hint', 'coins']) {
    const left = ads.left(kind);
    const b = mkb(t(left ? 'ad.watch' : 'ad.used'), 'adbtn', async btn => {
      audio.click(); btn.disabled = true;
      if (await ads.rewarded(kind)) {
        if (kind === 'coins') { setCoins(G.coins + 20); toast(t('ad.got', { n: 20 })); } else { shop.give('hint', 1); toast(t('ad.gotHint')); }
        audio.win();
      } else toast(t('ad.none'));
      paintShop();
    }, !left);
    grid.prepend(card('adcard', kind === 'coins' ? '<b class="plus">+20</b>' : ICONS.hint, t('ad.' + kind), t('ad.' + kind + '.d', { n: left }), b));
  }
  const owned = shop.noAds;
  const buy = mkb(owned ? t('noads.done') : REMOVE_ADS_PRICE, owned ? 'using' : 'price', async () => {
    audio.click();
    if (await ads.buyRemoveAds()) { shop.setNoAds(true); audio.win(); toast(t('noads.thanks')); }
    paintShop();
  }, owned);
  let restore = null;
  if (!owned) {
    restore = document.createElement('button'); restore.className = 'linkbtn'; restore.textContent = t('noads.restore');
    restore.onclick = async e => { e.stopPropagation(); audio.click(); if (await ads.restore()) { shop.setNoAds(true); toast(t('noads.restored')); paintShop(); } else toast(t('noads.restoreNone')); };
  }
  grid.appendChild(card(owned ? 'on' : '', ICONS.noads, t('noads.title'), t('noads.d'), buy, restore));
}
function buyItem(kind, it) {
  const paid = shop.buy(kind, it.id, G.coins);
  if (paid === null) return;
  if (paid < 0) { audio.deny(); toast(t('shop.short', { n: -paid })); return; }
  setCoins(G.coins - paid); audio.win();
  toast(t('shop.bought', { name: t(`${kind}.${it.id}`) }), 1500);
  if (kind === 'skin' || kind === 'scene') { G.peek = null; applyLook(); }
  paintShop(); paintTray();
}
// skin / scene: try something on behind the shop, or apply what's equipped
function preview(kind, id) {
  if (kind === 'skin') view.setSkin(id);
  else { view.setScene(id); rebuildScene(); }
}
function applyLook() {
  const sceneChanged = view.sceneId !== shop.scene;
  view.setSkin(shop.skin);
  if (sceneChanged) { view.setScene(shop.scene); rebuildScene(); }
}
function rebuildScene() { titleDemo(); }
function closeShop() { G.peek = null; applyLook(); titleScreen(); }

// ---------------------------------------------------------------- 防震道具: what is fitted to the current job
const emptyLoad = () => ({ steel: false, iso: false, wraps: [], struts: [], damper: null });
G.load = emptyLoad();
function loadFor(lv) { const s = store.get('mq2_load_' + lv.id, null); return { ...emptyLoad(), ...(s && typeof s === 'object' ? s : {}) }; }
function saveLoad() { if (G.design && LEVELS[G.idx]) store.set('mq2_load_' + LEVELS[G.idx].id, G.load); }
// drop whatever no longer fits the design (a wrapped match was deleted…). What's fitted may be more than what's in stock
// (the last quake used it up); the quake start then asks to restock or go without.
const MAX_STRUTS = 6;
function pruneLoad() {
  const d = G.design, ld = G.load; if (!d) return;
  ld.wraps = [...new Set(ld.wraps)].filter(id => d.stick(id));
  ld.struts = ld.struts.filter(st => d.node(st.a) && d.node(st.b) && !strutError(st.a, st.b, true)).slice(0, MAX_STRUTS);
  if (ld.damper !== null) { const n = d.node(ld.damper); if (!n || n.kind === 'anchor') ld.damper = null; }
}
function dropItems(ids) {
  const ld = G.load;
  for (const id of ids) {
    if (id === 'steel') ld.steel = false; else if (id === 'iso') ld.iso = false; else if (id === 'damper') ld.damper = null;
    else if (id === 'cfrp') ld.wraps.length = Math.min(ld.wraps.length, shop.count('cfrp'));
    else if (id === 'spring') ld.struts.length = Math.min(ld.struts.length, shop.count('spring'));
  }
}
function itemsChanged() {
  pruneLoad(); saveLoad(); hideScan();
  if (view && G.design && (G.state === 'build' || G.state === 'intro')) { view.load = G.load; view.syncDesign(G.design); }
  paintTray(); paintPlace();
}
const activeItems = ld => [ld.steel && 'steel', ld.iso && 'iso', ld.wraps.length && 'cfrp', ld.struts.length && 'spring', ld.damper !== null && 'damper'].filter(Boolean);
const itemList = ids => ids.map(id => t('nm.' + id)).join(LANG === 'en' ? ', ' : '、');
const supplyNeed = ld => ({ damper: ld.damper !== null ? 1 : 0, iso: ld.iso ? 1 : 0, spring: ld.struts.length, cfrp: ld.wraps.length, steel: ld.steel ? 1 : 0 });
const simOpts = ld => ({ steel: ld.steel, iso: ld.iso, wraps: ld.wraps, struts: ld.struts, damper: ld.damper });
// 道具框: the item tray beside the build. Items are only used here; buying happens in the shop on the title screen.
const TRAY = ['damper', 'iso', 'spring', 'cfrp', 'steel', 'scanner', 'hint'];
const TRAY_MODE = { damper: 'damper', spring: 'strut', cfrp: 'cfrp' };
function buildTray() {
  const tray = $('itemTray'); tray.innerHTML = '';
  for (const id of TRAY) {
    const b = document.createElement('button'); b.className = 'islot'; b.dataset.id = id;
    b.innerHTML = `${ICONS[id]}<i class="cnt"></i><i class="chk"></i>`;
    b.addEventListener('click', () => { audio.unlock(); slotTap(id); });
    tray.appendChild(b);
  }
}
function paintTray() {
  const tray = $('itemTray'); if (!tray.children.length || !G.load) return;
  const ld = G.load, need = supplyNeed(ld), lv = LEVELS[G.idx];
  const on = { damper: ld.damper !== null, iso: ld.iso, spring: ld.struts.length > 0, cfrp: ld.wraps.length > 0, steel: ld.steel, scanner: !!(scan && scan.on), hint: !!(hint && hint.on) };
  for (const b of tray.children) {
    const id = b.dataset.id, n = shop.count(id), unlocked = id === 'hint' && lv && shop.hinted(lv.id);
    b.classList.toggle('on', !!on[id]);
    b.classList.toggle('placing', G.tool === TRAY_MODE[id]);
    b.classList.toggle('empty', !n && !on[id] && !unlocked);
    b.classList.toggle('short', (need[id] || 0) > n);
    b.querySelector('.cnt').textContent = unlocked && !n ? '✓' : String(n);
    const name = id === 'cfrp' ? t('it.cfrp.name') : t('item.' + id);
    b.setAttribute('aria-label', `${name}, ${t('shop.stock', { n })}`); b.title = name;
  }
  tray.classList.toggle('dim', G.state !== 'build');
}
function slotTap(id) {
  if (G.state !== 'build') return;
  const ld = G.load, n = shop.count(id);
  const mode = TRAY_MODE[id];
  if (mode) {
    if (G.tool === mode) { audio.click(); setTool('match'); return; }
    const fitted = id === 'damper' ? ld.damper !== null : id === 'spring' ? ld.struts.length : ld.wraps.length;
    if (!n && !fitted) return outOf(id);
    audio.click(); setTool(mode); return;
  }
  setTool('match');
  if (id === 'iso' || id === 'steel') {
    if (!ld[id] && !n) return outOf(id);
    audio.click(); ld[id] = !ld[id]; itemsChanged();
    toast(t('tray.toggled', { name: t('item.' + id), on: ld[id] }), 1200); return;
  }
  if (id === 'scanner') {
    if (scan.on || G.scanTok) { audio.click(); hideScan(); return; }
    if (!n) return outOf(id);
    audio.click(); runScan(); return;
  }
  onHint();
}
function outOf(id) { audio.deny(); toast(t('tray.out', { name: t('nm.' + id) }), 2200); }
// placing carbon wraps, spring dampers and the mass damper on the design
function paintPlace() {
  const bar = $('placeBar'), tool = G.tool, ld = G.load;
  bar.hidden = !PLACING[tool] || G.state !== 'build';
  if (bar.hidden) return;
  $('placeText').textContent = tool === 'cfrp' ? t('place.cfrp', { k: ld.wraps.length, n: shop.count('cfrp') })
    : tool === 'strut' ? (G.strutA !== null && G.strutA !== undefined ? t('place.strutB') : t('place.strutA', { k: ld.struts.length, n: shop.count('spring') }))
      : t('place.damper');
}
function hitNode(w, r) {
  let best = null;
  for (const n of G.design.nodes) { const d = Math.hypot(n.x - w.x, n.y - w.y); if (d <= r && (!best || d < best.d)) best = { n, d }; }
  return best && best.n;
}
const segD = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)); return Math.hypot(px - x1 - dx * u, py - y1 - dy * u); };
// which matches a joint sits on (as an end, or glued onto its body)
const onSticks = n => new Set([...G.design.sticks.filter(s => s.a === n.id || s.b === n.id).map(s => s.id), ...(n.kind === 'glue' ? [n.host] : [])]);
function strutError(a, b, quiet) {
  const d = G.design, A = d.node(a), B = d.node(b), len = Math.hypot(A.x - B.x, A.y - B.y);
  if (A.kind === 'anchor' && B.kind === 'anchor') return 'place.strutSame';
  const sa = onSticks(A); for (const id of onSticks(B)) if (sa.has(id)) return 'place.strutSame';
  if (len < 0.5 * L) return 'place.strutShort';
  if (len > 2.6 * L) return 'place.strutLong';
  if (!quiet && G.load.struts.some(st => (st.a === a && st.b === b) || (st.a === b && st.b === a))) return 'place.strutDup';
  return null;
}
function placeTap(w, r) {
  const d = G.design, ld = G.load;
  if (G.tool === 'cfrp') {
    const h = d.hitStick(w.x, w.y, r); if (!h) return false;
    const i = ld.wraps.indexOf(h.id);
    if (i >= 0) { ld.wraps.splice(i, 1); audio.remove(); }
    else if (ld.wraps.length >= shop.count('cfrp')) { outOf('cfrp'); return true; }
    else { ld.wraps.push(h.id); audio.place(); }
    itemsChanged(); return true;
  }
  if (G.tool === 'damper') {
    const n = hitNode(w, r); if (!n) return false;
    if (n.kind === 'anchor') { audio.deny(); toast(t('place.damperAnchor')); return true; }
    if (ld.damper === null && !shop.count('damper')) { outOf('damper'); return true; }
    ld.damper = ld.damper === n.id ? null : n.id;
    if (ld.damper === null) audio.remove(); else audio.place();
    itemsChanged(); return true;
  }
  if (G.tool === 'strut') {
    const n = hitNode(w, r);
    if (G.strutA === null || G.strutA === undefined) {
      if (!n) {
        const k = ld.struts.findIndex(st => { const A = d.node(st.a), B = d.node(st.b); return segD(w.x, w.y, A.x, A.y, B.x, B.y) <= r * 0.8; });
        if (k < 0) return false;
        ld.struts.splice(k, 1); audio.remove(); itemsChanged(); return true;
      }
      if (ld.struts.length >= MAX_STRUTS) { audio.deny(); toast(t('place.strutMax', { n: MAX_STRUTS })); return true; }
      if (ld.struts.length >= shop.count('spring')) { outOf('spring'); return true; }
      G.strutA = n.id; view.setPick(n.id); audio.click(); paintPlace(); return true;
    }
    if (!n) return false;
    if (n.id === G.strutA) { G.strutA = null; view.setPick(null); paintPlace(); return true; }
    const err = strutError(G.strutA, n.id);
    if (err) { audio.deny(); toast(t(err)); return true; }
    ld.struts.push({ a: G.strutA, b: n.id }); G.strutA = null; view.setPick(null); audio.place(); itemsChanged(); return true;
  }
  return false;
}
// 結構檢測儀: run the whole quake on a copy, a little each frame, then mark the joints
function runScan() {
  if (G.state !== 'build') return;
  const cs = G.design.canStart();
  if (!cs.ok) { audio.deny(); toast(t('scan.need')); return; }
  hideScan();
  if (!shop.take('scanner', 1)) { outOf('scanner'); return; }
  const gen = new Sim(LEVELS[G.idx], G.design, undefined, simOpts(G.load)).scan();
  const tok = G.scanTok = { paid: 1 };
  $('scanBar').hidden = false; $('scanBar').className = 'topbar'; $('btnScanClose').hidden = true;
  $('scanText').textContent = t('scan.run', { p: 0 });
  document.body.classList.add('scanned');
  const tick = () => {
    if (G.scanTok !== tok) return;
    const t0 = performance.now(); let r;
    do { r = gen.next(); } while (!r.done && performance.now() - t0 < 14);
    if (!r.done) { $('scanText').textContent = t('scan.run', { p: Math.round(r.value * 100) }); requestAnimationFrame(tick); return; }
    G.scanTok = null;
    const res = r.value, top = Math.max(0, ...res.peaks.map(p => p.s));
    $('scanBar').className = 'topbar ' + (res.survived ? 'good' : 'bad');
    $('scanText').textContent = res.survived ? t('scan.ok', { p: Math.round(top * 100) }) : t(res.first.star ? 'scan.star' : 'scan.fail', { t: res.first.t });
    $('btnScanClose').hidden = false;
    scan.show(res); paintTray();
    if (res.survived) audio.place(); else audio.deny();
  };
  requestAnimationFrame(tick);
}
function hideScan() {
  if (G.scanTok && G.scanTok.paid) shop.give('scanner', 1);   // cancelled before it finished: not used
  G.scanTok = null;
  if (scan) scan.hide();
  const b = $('scanBar'); if (b) b.hidden = true;
  document.body.classList.remove('scanned');
  paintTray();
}

// ---------------------------------------------------------------- model cabinet (完工模型展示櫃)
const thumbs = new Map();
function collectScreen() {
  G.state = 'collect';
  show('ovCollect');
  const grid = $('colGrid'); grid.innerHTML = '';
  const have = LEVELS.filter(lv => G.progress.stars[lv.id] && hasLandmark(lv.key));
  $('colCount').textContent = t('col.count', { n: have.length, of: LEVELS.length });
  const todo = [];
  for (const lv of LEVELS) {
    const open = !!G.progress.stars[lv.id] && hasLandmark(lv.key);
    const b = document.createElement('button');
    b.className = 'colitem' + (open ? '' : ' locked'); b.disabled = !open;
    b.innerHTML = `${open ? '<img alt="">' : '<span class="ph">?</span>'}<b>${open ? lvt(lv, 'name') : '？？？'}</b><small>${open ? (lvt(lv, 'place') || t('reveal.studio')) : t('col.locked', { n: lv.id })}</small>`;
    if (open) {
      const img = b.querySelector('img'); img.alt = lvt(lv, 'name');
      if (thumbs.has(lv.key)) img.src = thumbs.get(lv.key); else todo.push([lv.key, img]);
      b.onclick = () => { audio.click(); G.state = 'collect'; showReveal(lv, 'collect'); };
    }
    grid.appendChild(b);
  }
  // pictures are rendered one by one on the turntable's renderer
  (async () => {
    try { turntable = turntable || new Turntable($('revealCanvas')); } catch (e) { return; }
    for (const [key, img] of todo) {
      if (G.state !== 'collect') return;
      const url = await turntable.snapshot(key);
      if (url) { thumbs.set(key, url); img.src = url; }
    }
  })();
}

// ---------------------------------------------------------------- 工頭示範 (hint)
function referenceEdges(lv) {
  const d = new Design(lv); REFERENCE[lv.id](d);
  return d.sticks.map(st => { const [a, b, c, e] = d.ends(st); return [[a, b], [c, e]]; });
}
function showHint() { hint.show(referenceEdges(LEVELS[G.idx])); toast(t('hint.on'), 1600); paintTray(); }
function onHint() {
  if (G.state !== 'build') return;
  const lv = LEVELS[G.idx];
  audio.click();
  if (hint.on) { hint.hide(); toast(t('hint.off'), 1000); paintTray(); return; }
  if (shop.hinted(lv.id)) { showHint(); return; }
  if (shop.tickets > 0) ask(t('hint.use', { n: shop.tickets }), [
    { label: t('hint.useBtn'), cls: 'primary', fn: () => { shop.useTicket(lv.id); showHint(); } },
    { label: t('btn.cancel'), cls: 'ghost' }]);
  else outOf('hint');
}
// small confirm dialog on top of whatever is showing
function ask(text, buttons) {
  $('askText').textContent = text;
  const row = $('askBtns'); row.innerHTML = '';
  for (const bt of buttons) {
    const b = document.createElement('button'); b.className = 'btn ' + (bt.cls || 'ghost'); b.textContent = bt.label;
    b.onclick = () => { $('ask').hidden = true; if (bt.fn) bt.fn(); };
    row.appendChild(b);
  }
  $('ask').hidden = false;
}

// ---------------------------------------------------------------- leaderboard UI
function rowsHTML(rows, max, unit = t('unit.matches')) {
  const list = document.createElement('ol'); list.className = 'board';
  const mine = rows.findIndex(r => r.me);
  rows.forEach((r, i) => {
    if (i >= max && i !== mine) return;
    if (i === max && mine > max) { const gap = document.createElement('li'); gap.className = 'gap'; gap.textContent = '⋯'; list.appendChild(gap); }
    const li = document.createElement('li'); if (r.me) li.className = 'me';
    const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = i + 1;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = (r.name || t('lb.anon')) + (r.me ? t('lb.you') : '');
    const n = document.createElement('span'); n.className = 'n'; n.textContent = unit ? r.n + ' ' + unit : String(r.n);
    li.append(rk, nm, n); list.appendChild(li);
  });
  return list;
}
let resultCtx = null;
function renderResultBoard(won, lv, used, items) {
  const box = $('resBoard');
  resultCtx = won ? { lv, used, design: G.design.snapshot(), items } : null;
  box.hidden = !lb.available || !won;
  if (box.hidden) return;
  paintResultBoard();
  if (!items && lb.canSubmit() && lb.nickname) uploadScore(lb.nickname);
}
function paintResultBoard() {
  if (!resultCtx) return;
  const { lv } = resultCtx;
  const rows = lb.ranking(lv.key);
  const list = $('resBoardList'); list.innerHTML = '';
  if (!lb.ready) list.textContent = t('lb.loading');
  else if (!rows.length) list.textContent = t('lb.emptyFirst');
  else list.appendChild(rowsHTML(rows, 5));
  const form = $('resBoardForm'), note = $('resBoardNote');
  form.hidden = true; note.textContent = '';
  if (resultCtx.items) note.textContent = t('lb.itemsNote');
  else if (!lb.uid) note.textContent = t('lb.login');
  else if (lb.readOnly) note.textContent = t('lb.readonly');
  else if (!lb.nickname) { form.hidden = false; }
  else if (resultCtx.status === 'done') {
    const mr = lb.myRank(resultCtx.lv.key);
    note.textContent = resultCtx.improved ? (mr ? t('lb.uploadedRank', mr) : t('lb.uploaded'))
      : (mr ? t('lb.myRank', mr) : t('lb.notBetter'));
  } else if (resultCtx.status) note.textContent = resultCtx.status;
}
async function uploadScore(name) {
  if (!resultCtx || resultCtx.items) return;
  const ctx = resultCtx;
  ctx.status = t('lb.uploading'); paintResultBoard();
  const r = await lb.submit(ctx.lv.key, ctx.used, name, ctx.design, G.earned);
  if (resultCtx !== ctx) return;
  if (r.ok) { ctx.status = 'done'; ctx.improved = r.improved; }
  else ctx.status = r.reason === 'readonly' ? '' : r.reason === 'full' ? t('lb.full') : t('lb.error');
  paintResultBoard();
}
function boardScreen(levelIdx) {
  const sel = $('boardLevel');
  const keep = sel.value;
  sel.innerHTML = '';   // rebuilt each time so it follows the language
  const c = document.createElement('option'); c.value = '__coins'; c.textContent = t('lb.coinBoard'); sel.appendChild(c);
  for (const lv of LEVELS) { const o = document.createElement('option'); o.value = lv.key; o.textContent = `${lv.id}　${lvt(lv, 'name')}`; sel.appendChild(o); }
  if (keep) sel.value = keep;
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
  if (!lb.ready) list.textContent = t('lb.loading');
  else if (!rows.length) list.textContent = t('lb.emptyLevel');
  else list.appendChild(rowsHTML(rows, 20, coinsBoard ? t('unit.coins') : t('unit.matches')));
  $('boardInfo').textContent = coinsBoard ? t('lb.coinInfo') : t('lb.levelInfo', { s: sh(lv.shindo) });
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
    if (PLACING[G.tool]) { if (placeTap(w, hitRadius(e))) return; }
    else if (G.tool === 'delete') {
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
    if (dr.pv && dr.pv.ok && (G.design.used() + 1) * MATCH_COST > G.coins) { dr.pv.ok = false; dr.pv.reason = t('why.broke'); dr.pv.code = null; }
    view.setGhost(dr.pv);
    const reason = dr.pv && !dr.pv.ok ? why(dr.pv) : '';
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
    if (dr.moved < 8 && G.state === 'build') {
      if (G.tool === 'strut' || G.tool === 'damper') toast(t('place.noJoint'), 1400);
      else if (G.tool === 'match') toast(t('toast.tap'), 1400);
    }
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
  on('btnShop', () => { audio.click(); shopScreen(); });
  on('btnCollect', () => { audio.click(); collectScreen(); });
  on('btnDaily', () => { audio.click(); onDaily(); });
  on('btnShopBack', () => { audio.click(); closeShop(); });
  on('btnColBack', () => { audio.click(); titleScreen(); });
  on('btnPlaceDone', () => { audio.click(); setTool('match'); });
  on('btnScanClose', () => { audio.click(); hideScan(); });
  for (const b of document.querySelectorAll('#ovShop .tab')) b.addEventListener('click', () => { audio.click(); G.shopTab = b.dataset.tab; G.peek = null; applyLook(); paintShop(); });
  on('btnLevelsBack', () => { audio.click(); titleScreen(); });
  on('btnBoard', () => { audio.click(); boardScreen(); });
  on('btnRevealGo', () => { audio.click(); closeReveal(); });
  on('btnSkipCoach', () => { audio.click(); coach.stop(); G.guide = false; store.set('mq_guide_off', true); if (G.state === 'build') { $('itemTray').hidden = false; paintTray(); } });
  on('btnBoardBack', () => { audio.click(); titleScreen(); });
  $('boardLevel').addEventListener('change', paintBoard);
  $('resBoardForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('nickInput').value.trim();
    if (!name) { $('nickInput').focus(); return; }
    audio.click(); uploadScore(name);
  });
  on('btnIntroGo', () => { audio.click(); beginBuild(); });
  on('btnMenu', () => { audio.click(); if (G.state === 'sim' || G.state === 'result') stopQuake(); setTool('match'); hideScan(); levelsScreen(); });
  on('btnHelp', () => { audio.click(); if (G.state === 'build') { setTool('match'); G.state = 'intro'; show('ovIntro'); } });
  on('toolMatch', () => { if (G.state === 'build') { audio.click(); setTool('match'); } });
  on('toolDelete', () => { if (G.state === 'build') { audio.click(); setTool(G.tool === 'delete' ? 'match' : 'delete'); if (G.tool === 'delete') toast(t('toast.erase'), 1300); } });
  on('btnUndo', () => { if (G.state === 'build' && G.undo.length) { audio.remove(); G.design.restore(G.undo.pop()); refresh(); } });
  on('btnClear', () => {
    if (G.state !== 'build' || !G.design.used()) return;
    const b = $('btnClear');
    if (!b.classList.contains('confirm')) { b.classList.add('confirm'); $('clearLabel').textContent = t('clear.confirm'); setTimeout(() => { b.classList.remove('confirm'); $('clearLabel').textContent = t('tool.clear'); }, 2200); return; }
    b.classList.remove('confirm'); $('clearLabel').textContent = t('tool.clear');
    pushUndo(); G.design.clear(); audio.remove(); refresh();
  });
  on('btnPlay', () => { if (G.state === 'build') startQuake(); else if (G.state === 'sim') stopQuake(); });
  const sync = () => {
    $('btnSound').classList.toggle('off', audio.muted);
    $('btnSoundT').textContent = t(audio.muted ? 'snd.off' : 'snd.on');
    $('btnMusicT').textContent = t(audio.musicOn ? 'mus.on' : 'mus.off');
  };
  on('btnSound', () => { audio.setMuted(!audio.muted); sync(); });
  on('btnSoundT', () => { audio.setMuted(!audio.muted); sync(); });
  on('btnMusicT', () => { audio.setMusic(!audio.musicOn); sync(); });
  on('btnLang', () => { audio.click(); setLang(LANG === 'en' ? 'zh' : 'en'); $('btnLang').lang = LANG === 'en' ? 'zh-Hant' : 'en'; sync(); });
  sync();
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
  if (hint && hint.on && G.design) hint.update(G.state, G.design, view);
  if (scan && scan.on) scan.update(G.state, view);
  if (coach && coach.active && G.design) {
    if (coach.update(G.state, G.design, view, !!(G.drag && G.drag.start), G.state === 'build' && canStart().ok)) audio.cheer();
  }
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
  applyStatic();
  try {
    const models = await loadModels();
    view = new View($('gl'), models);
    coach = new Coach($('coach'), $('coachTip'));
    hint = new HintLayer($('hintLayer'));
    scan = new ScanLayer($('scanLayer'));
    buildTray();
    view.setSkin(shop.skin); view.setScene(shop.scene);
    bindUI();
    setCoins(G.coins);
    window.__mq = { G, LEVELS, REFERENCE, lb, get view() { return view; }, get turntable() { return turntable; }, shop, loadRef(id) { G.design.clear(); REFERENCE[id](G.design); refresh(); },
      setCoins, itemsChanged, setTool, runScan, slotTap, ads,
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
    fatal(t('err.3d', { m: err && err.message ? err.message : err }));
  }
}
window.addEventListener('error', e => { if (!view) fatal(t('err.load', { m: e.message })); });
