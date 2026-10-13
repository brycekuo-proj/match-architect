// 火柴雜貨店: what can be bought with coins, what the player owns and has equipped (saved in localStorage).
export const SKINS = [
  { id: 'classic', price: 0 },
  { id: 'bamboo', price: 300 },
  { id: 'candy', price: 400 },
  { id: 'glow', price: 600 },
  { id: 'gold', price: 1000 },
];
export const SCENES = [
  { id: 'auto', price: 0 },
  { id: 'desert', price: 200 },
  { id: 'snow', price: 400 },
  { id: 'night', price: 600 },
];
// 防震道具, based on real seismic engineering. All of them are one-use: used up when the quake starts (handed back if
// the quake is stopped early), so using one again means buying it again. `n` = how many one purchase gives.
export const ITEMS = [
  { id: 'damper', price: 1200, n: 1 },   // 阻尼球 (tuned mass damper): hung at one joint
  { id: 'iso', price: 1000, n: 1 },      // 鉛心橡膠隔震墊 (lead-rubber bearings): the whole base slides on rubber
  { id: 'spring', price: 300, n: 1 },    // 彈簧避震器: spring-damper brace between two joints, one per brace
  { id: 'cfrp', price: 200, n: 5 },      // 碳纖維包覆: 5 wraps (40 each), one per match
  { id: 'steel', price: 150, n: 1 },     // 高韌性鋼骨: every joint bends before it snaps
  { id: 'scanner', price: 500, n: 1 },   // 結構檢測儀: one test run of the quake (used when the scan runs)
  { id: 'hint', price: 100, n: 1 },      // 工頭示範券: shows a job's reference build, that job stays unlocked
];
// the items that change the physics (and so keep a run off the leaderboard)
export const PHYSICS_ITEMS = ['steel', 'iso', 'cfrp', 'spring', 'damper'];
const KEY = 'mq2_shop';

export class Shop {
  constructor(store) {
    this.store = store;
    const s = store.get(KEY, {}) || {};
    this.s = { skins: ['classic'], scenes: ['auto'], skin: 'classic', scene: 'auto', hinted: {}, noAds: false, inv: {}, ...s };
    if (!this.s.skins.includes('classic')) this.s.skins.push('classic');
    if (!this.s.scenes.includes('auto')) this.s.scenes.push('auto');
    if (this.s.tickets) { this.s.inv.hint = (this.s.inv.hint || 0) + this.s.tickets; delete this.s.tickets; this.save(); }   // old saves
  }
  save() { this.store.set(KEY, this.s); }
  get skin() { return this.s.skin; }
  get scene() { return this.s.scene; }
  get tickets() { return this.count('hint'); }
  get noAds() { return !!this.s.noAds; }
  setNoAds(v) { this.s.noAds = !!v; this.save(); }
  owns(kind, id) { return (kind === 'skin' ? this.s.skins : this.s.scenes).includes(id); }
  count(id) { return this.s.inv[id] || 0; }   // items in stock
  equip(kind, id) {
    if (!this.owns(kind, id)) return false;
    this.s[kind] = id; this.save(); return true;
  }
  static list(kind) { return { skin: SKINS, scene: SCENES, item: ITEMS }[kind] || []; }
  // returns the price paid (0 = already owned), or a negative number = how many coins short
  buy(kind, id, coins) {
    const it = Shop.list(kind).find(x => x.id === id);
    if (!it) return null;
    if (kind !== 'item' && this.owns(kind, id)) return 0;
    if (coins < it.price) return coins - it.price;
    if (kind === 'item') this.s.inv[id] = this.count(id) + it.n;
    else { (kind === 'skin' ? this.s.skins : this.s.scenes).push(id); this.s[kind] = id; }
    this.save();
    return it.price;
  }
  // take n out of stock (false if there aren't enough), or put some back (refunds, rewards)
  take(id, n = 1) {
    if (n <= 0) return true;
    if (this.count(id) < n) return false;
    this.s.inv[id] = this.count(id) - n; this.save(); return true;
  }
  give(id, n = 1) { if (n > 0) { this.s.inv[id] = this.count(id) + n; this.save(); } }
  // 工頭示範: once a ticket is spent on a job, that job's hint stays unlocked
  hinted(levelId) { return !!this.s.hinted[levelId]; }
  useTicket(levelId) {
    if (this.hinted(levelId)) return true;
    if (!this.take('hint', 1)) return false;
    this.s.hinted[levelId] = true; this.save(); return true;
  }
  addTickets(n) { this.give('hint', n); }
  unlockHint(levelId) { this.s.hinted[levelId] = true; this.save(); }
}
