// Shared "fewest matches" leaderboard, stored in the artifact's own db (claude.ai link only).
// board/<viewerId>  = { name, best: { <levelKey>: { n, t } }, coins, updated }   readable by everyone
// proofs/<viewerId>/levels/<levelKey> = { n, design, t }                   readable only by the owner (for checking)
// Swappable: anything with the same methods (e.g. a Supabase adapter) can replace it.
const NICK_KEY = 'mq_nick';

export class Leaderboard {
  constructor() {
    this.available = false; this.ready = false; this.readOnly = false;
    this.docs = new Map(); this.uid = null; this.listeners = new Set();
  }
  async init() {
    const c = window.claude;
    if (!c || typeof c.use !== 'function') return false;
    let db = null, user = null;
    try { [db, user] = await Promise.all([c.use('db'), c.use('user')]); } catch (e) { return false; }
    if (!db) return false;
    this.db = db;
    try { this.uid = user ? await user.id() : null; } catch (e) { this.uid = null; }
    try { const w = user ? await user.can('data.write') : null; this.canWriteShared = w; } catch (e) {}
    this.available = true;
    this._subscribe();
    return true;
  }
  _subscribe() {
    this.unsub = this.db.collection('board').onSnapshot(snap => {
      const m = new Map();
      for (const d of snap.docs) if (d.exists) m.set(d.id, d.data());
      this.docs = m; this.ready = true; this._emit();
    }, err => { this.error = err && err.code; this._emit(); if (err && err.code === 'unavailable') setTimeout(() => this._subscribe(), 3000); });
  }
  onChange(fn) { this.listeners.add(fn); }
  _emit() { for (const f of this.listeners) { try { f(); } catch (e) { console.error(e); } } }

  get myDoc() { return this.uid ? this.docs.get(this.uid) || null : null; }
  get nickname() {
    const n = this.myDoc && typeof this.myDoc.name === 'string' ? this.myDoc.name : '';
    if (n) return n;
    try { return localStorage.getItem(NICK_KEY) || ''; } catch (e) { return ''; }
  }
  canSubmit() { return this.available && !!this.uid && !this.readOnly; }

  ranking(levelKey) {
    const rows = [];
    for (const [id, d] of this.docs) {
      const b = d && d.best && d.best[levelKey];
      if (!b || typeof b.n !== 'number' || !(b.n > 0) || b.n > 999) continue;
      rows.push({ id, name: (typeof d.name === 'string' ? d.name : '').slice(0, 12) || '無名火柴人', n: b.n, t: +b.t || 0, me: id === this.uid });
    }
    rows.sort((a, b) => a.n - b.n || a.t - b.t);
    return rows;
  }
  coinRanking() {
    const rows = [];
    for (const [id, d] of this.docs) {
      if (!d || typeof d.coins !== 'number' || !(d.coins >= 0) || d.coins > 1e7) continue;
      rows.push({ id, name: (typeof d.name === 'string' ? d.name : '').slice(0, 12) || '無名火柴人', n: Math.round(d.coins), t: +d.updated || 0, me: id === this.uid });
    }
    rows.sort((a, b) => b.n - a.n || a.t - b.t);
    return rows;
  }
  // keep the coin total on the board in step with the wallet (one write, only when it changed)
  async syncCoins(coins, name) {
    if (!this.canSubmit()) return;
    const ref = this.db.doc('board/' + this.uid);
    try {
      const snap = await ref.get();
      const cur = snap.exists ? snap.data() : {};
      if (cur.coins === coins) return;
      await ref.set({ ...cur, name: cur.name || String(name || '').slice(0, 12), best: cur.best || {}, coins, updated: Date.now() });
    } catch (e) { if (e && e.code === 'invalid_argument') this.readOnly = true; }
  }
  worldBest(levelKey) { return this.ranking(levelKey)[0] || null; }
  myRank(levelKey) { const r = this.ranking(levelKey); const i = r.findIndex(x => x.me); return i < 0 ? null : { rank: i + 1, of: r.length, n: r[i].n }; }

  // Upload a cleared build. Only writes when it beats the player's own best (or the name changed).
  async submit(levelKey, sticks, name, designSnapshot, coins) {
    if (!this.canSubmit()) return { ok: false, reason: 'unavailable' };
    const nm = String(name || '').trim().slice(0, 12);
    try { if (nm) localStorage.setItem(NICK_KEY, nm); } catch (e) {}
    const ref = this.db.doc('board/' + this.uid);
    try {
      const snap = await ref.get();
      const cur = snap.exists ? snap.data() : {};
      const best = { ...(cur.best || {}) };
      const prev = best[levelKey];
      const improved = !prev || sticks < prev.n;
      if (improved) best[levelKey] = { n: sticks, t: Date.now() };
      const finalName = nm || cur.name || '';
      const coinVal = typeof coins === 'number' ? coins : cur.coins;
      if (!improved && finalName === cur.name && coinVal === cur.coins) return { ok: true, improved: false };
      await ref.set({ name: finalName, best, coins: coinVal ?? 0, updated: Date.now() });
      if (improved && designSnapshot) {
        try { await this.db.doc(`proofs/${this.uid}/levels/${levelKey}`).set({ n: sticks, design: designSnapshot, t: Date.now() }); } catch (e) {}
      }
      return { ok: true, improved };
    } catch (e) {
      if (e && (e.code === 'invalid_argument' || e.code === 'not_granted')) { this.readOnly = true; return { ok: false, reason: 'readonly' }; }
      if (e && e.code === 'quota_exceeded') return { ok: false, reason: 'full' };
      return { ok: false, reason: 'error' };
    }
  }
}
