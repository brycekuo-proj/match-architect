// Ads and the remove-ads purchase. Three modes:
//   'off'   web / itch / jam builds: no ads at all (the default)
//   'mock'  ?ads=mock in the URL (remembered): fake ads on screen, for trying the flow before the app exists
//   'admob' the Capacitor app with @capacitor-community/admob installed (see docs/APP_ADS.md)
// Rewarded ads are always the player's choice and pay out a reward. Interstitials only ever show after a result,
// when the player taps "Next Job", and follow the pacing rules in interstitialDue().
const KEY = 'mq2_ads';
// Google's public test ad units; swap in the real ones before release
const UNITS = {
  android: { rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' },
  ios: { rewarded: 'ca-app-pub-3940256099942544/1712485313', interstitial: 'ca-app-pub-3940256099942544/4411468910' },
};
export const REMOVE_ADS_PRICE = 'US$2.99';
export const IAP_REMOVE_ADS = 'remove_ads';
export const DAILY_LIMIT = { coins: 5, hint: 3 };   // rewarded ads per day for free coins / hint tickets
export const INTERSTITIAL = { firstJob: 4, every: 3, gapMs: 3 * 60 * 1000 };

const today = () => new Date().toISOString().slice(0, 10);

export class Ads {
  constructor(store) {
    this.store = store;
    this.s = { clears: 0, lastInter: 0, lastRewarded: 0, day: '', used: {}, ...(store.get(KEY, {}) || {}) };
    this.mode = 'off';
    try {
      const q = new URLSearchParams(location.search).get('ads');
      if (q === 'mock' || q === 'off') localStorage.setItem('mq_ads', q);
      if (localStorage.getItem('mq_ads') === 'mock') this.mode = 'mock';
    } catch (e) {}
    const cap = window.Capacitor;
    // the app's own bundle can hand the plugin over as window.MQ_ADMOB (import { AdMob } from '@capacitor-community/admob')
    this.admob = window.MQ_ADMOB || (cap && cap.Plugins && cap.Plugins.AdMob);
    if (this.admob) this.mode = 'admob';
    this.platform = cap && cap.getPlatform ? cap.getPlatform() : 'web';
    this.ready = this.mode === 'admob' ? this.admob.initialize({ initializeForTesting: true }).then(() => true, () => false) : Promise.resolve(this.mode !== 'off');
  }
  save() { this.store.set(KEY, this.s); }
  get enabled() { return this.mode !== 'off'; }
  // daily caps
  _day() { if (this.s.day !== today()) { this.s.day = today(); this.s.used = {}; } }
  left(kind) { this._day(); return Math.max(0, (DAILY_LIMIT[kind] || 99) - (this.s.used[kind] || 0)); }
  _use(kind) { this._day(); this.s.used[kind] = (this.s.used[kind] || 0) + 1; this.save(); }

  // a rewarded ad: resolves true when the player watched it to the end (and earns the reward)
  async rewarded(kind) {
    if (!this.enabled) return false;
    let ok = false;
    if (this.mode === 'mock') ok = await mockAd('rewarded');
    else {
      try {
        const id = (UNITS[this.platform] || UNITS.android).rewarded;
        await this.admob.prepareRewardVideoAd({ adId: id, isTesting: true });
        const r = await this.admob.showRewardVideoAd();
        ok = !!r;
      } catch (e) { ok = false; }
    }
    if (ok) { this.s.lastRewarded = Date.now(); if (kind) this._use(kind); else this.save(); }
    return ok;
  }
  // count a clear (for interstitial pacing)
  cleared() { this.s.clears = (this.s.clears || 0) + 1; this.save(); }
  // pacing: never in the first jobs, at most every 3 clears and 3 minutes, never right after a rewarded ad,
  // never for players who bought remove-ads
  interstitialDue(jobId, noAds) {
    if (!this.enabled || noAds || jobId < INTERSTITIAL.firstJob) return false;
    const now = Date.now();
    if (this.s.clears < INTERSTITIAL.every) return false;
    if (now - (this.s.lastInter || 0) < INTERSTITIAL.gapMs) return false;
    if (now - (this.s.lastRewarded || 0) < INTERSTITIAL.gapMs) return false;
    return true;
  }
  async interstitial() {
    this.s.clears = 0; this.s.lastInter = Date.now(); this.save();
    if (this.mode === 'mock') { await mockAd('interstitial'); return; }
    try {
      const id = (UNITS[this.platform] || UNITS.android).interstitial;
      await this.admob.prepareInterstitial({ adId: id, isTesting: true });
      await this.admob.showInterstitial();
    } catch (e) {}
  }
  // remove-ads (a one-time purchase that removes interstitials only). The app build sets window.MQ_IAP =
  // { buy(productId) → Promise<bool>, restore() → Promise<string[]> } on top of its store plugin.
  async buyRemoveAds() {
    if (this.mode === 'mock') return mockPurchase();
    const iap = window.MQ_IAP;
    if (!iap) return false;
    try { return !!(await iap.buy(IAP_REMOVE_ADS)); } catch (e) { return false; }
  }
  async restore() {
    if (this.mode === 'mock') return false;
    const iap = window.MQ_IAP;
    if (!iap || !iap.restore) return false;
    try { return (await iap.restore()).includes(IAP_REMOVE_ADS); } catch (e) { return false; }
  }
}

// ---------------------------------------------------------------- mock ads (a full-screen card with a countdown)
let T = k => k;
export function setAdText(fn) { T = fn; }
function mockAd(kind) {
  return new Promise(resolve => {
    const secs = kind === 'rewarded' ? 5 : 3;
    const wrap = document.createElement('div');
    wrap.className = 'mockad';
    wrap.innerHTML = `<div class="mockad-card"><span class="mockad-tag">${T('ad.mockTag')}</span><b>${T(kind === 'rewarded' ? 'ad.mockRewarded' : 'ad.mockInter')}</b>
      <div class="mockad-bar"><i></i></div><p class="mockad-left"></p><div class="btnrow"><button class="btn ghost mockad-x"></button></div></div>`;
    document.getElementById('app').appendChild(wrap);
    const bar = wrap.querySelector('.mockad-bar i'), left = wrap.querySelector('.mockad-left'), x = wrap.querySelector('.mockad-x');
    const t0 = performance.now();
    let done = false;
    const finish = ok => { if (done) return; done = true; wrap.remove(); resolve(ok); };
    const tick = () => {
      if (done) return;
      const u = Math.min(1, (performance.now() - t0) / 1000 / secs);
      bar.style.width = (u * 100).toFixed(1) + '%';
      const s = Math.ceil(secs * (1 - u));
      left.textContent = u < 1 ? T('ad.left', { s }) : T(kind === 'rewarded' ? 'ad.earned' : 'ad.over');
      x.textContent = T(u < 1 && kind === 'rewarded' ? 'ad.skip' : 'ad.close');
      if (u < 1) requestAnimationFrame(tick);
    };
    x.onclick = () => finish((performance.now() - t0) / 1000 >= secs);   // closing a rewarded ad early: no reward
    tick();
  });
}
function mockPurchase() {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'mockad';
    wrap.innerHTML = `<div class="mockad-card"><span class="mockad-tag">${T('ad.mockTag')}</span><b>${T('iap.mockTitle', { price: REMOVE_ADS_PRICE })}</b>
      <p>${T('iap.mockBody')}</p><div class="btnrow"><button class="btn primary">${T('iap.mockBuy')}</button><button class="btn ghost">${T('btn.cancel')}</button></div></div>`;
    document.getElementById('app').appendChild(wrap);
    const [buy, no] = wrap.querySelectorAll('button');
    buy.onclick = () => { wrap.remove(); resolve(true); };
    no.onclick = () => { wrap.remove(); resolve(false); };
  });
}
