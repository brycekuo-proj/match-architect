// 每日簽到: one check-in per calendar day (the player's own time zone), and the days must be in a row. Missed days
// can be made up for coins (補簽) — up to MAKEUP_MAX of them — or the streak starts again from day 1.
// Every 5th day also gives a small item and day 30 a big one; then a new 30-day round starts.
export const ROUND = 30;
export const DAILY_COINS = 10;
export const MAKEUP_COST = 30;   // coins per missed day: making up keeps the streak, it doesn't pay
export const MAKEUP_MAX = 7;     // miss more days than this and the streak can only restart
// day → reward item ({ id, n }); day 30 alternates between the two big items round by round
const SMALL = { 5: { id: 'hint', n: 1 }, 10: { id: 'steel', n: 1 }, 15: { id: 'cfrp', n: 5 }, 20: { id: 'spring', n: 1 }, 25: { id: 'scanner', n: 1 } };
const BIG = ['damper', 'iso'];
const KEY = 'mq2_checkin';
export const localDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };

export class CheckIn {
  constructor(store) {
    this.store = store;
    this.s = { count: 0, round: 0, last: '', made: [], ...(store.get(KEY, {}) || {}) };
    if (!Array.isArray(this.s.made)) this.s.made = [];
  }
  save() { this.store.set(KEY, this.s); }
  get today() { return localDay(); }
  get doneToday() { return this.s.last === this.today; }
  get count() { return this.s.count; }      // days in a row this round (30 = round finished)
  get round() { return this.s.round; }
  get made() { return this.s.made; }        // days of this round that were made up
  // the device date went backwards since the last check-in: don't allow one
  get clockBack() { return !!this.s.last && dayNum(this.today) < dayNum(this.s.last); }
  // days missed since the last check-in (only matters inside an unfinished round)
  get missed() {
    if (!this.s.last || this.s.count === 0 || this.s.count >= ROUND || this.doneToday || this.clockBack) return 0;
    return Math.max(0, dayNum(this.today) - dayNum(this.s.last) - 1);
  }
  // how many missed days a make-up would fill (never past day 29: today is still to be checked in)
  get makeUpDays() { return Math.min(this.missed, ROUND - 1 - this.s.count); }
  get canMakeUp() { return this.missed > 0 && this.missed <= MAKEUP_MAX && this.makeUpDays > 0; }
  get makeUpCost() { return this.makeUpDays * MAKEUP_COST; }
  reward(day, round = this.s.round) {
    if (day === ROUND) return { id: BIG[round % BIG.length], n: 1, big: true };
    return SMALL[day] || null;
  }
  // the next day with an item, counted in check-ins from the coming one
  nextMilestone() {
    const startNew = this.s.count >= ROUND, round = startNew ? this.s.round + 1 : this.s.round, from = startNew ? 0 : this.s.count;
    for (let d = from + 1; d <= ROUND; d++) { const r = this.reward(d, round); if (r) return { day: d, in: d - from, ...r }; }
    return null;
  }
  // 補簽: fill the missed days (the caller takes the coins); returns { days: [..], items: [..] }
  makeUp() {
    if (!this.canMakeUp) return null;
    const n = this.makeUpDays, days = [], items = [];
    for (let k = 0; k < n; k++) {
      this.s.count++; days.push(this.s.count); this.s.made.push(this.s.count);
      const r = this.reward(this.s.count); if (r) items.push(r);
    }
    this.s.last = localDay(-1);   // the streak now reaches yesterday
    this.save();
    return { days, items };
  }
  // give up the streak: today will be day 1 again
  restart() { this.s.count = 0; this.s.made = []; this.s.last = localDay(-1); this.save(); }
  // returns { day, coins, item, roundDone } or null (already done today, missed days to settle first, or clock rolled back)
  checkIn() {
    if (this.doneToday || this.clockBack || this.missed > 0) return null;
    if (this.s.count >= ROUND) { this.s.count = 0; this.s.round++; this.s.made = []; }
    this.s.count++; this.s.last = this.today;
    const day = this.s.count, item = this.reward(day);
    this.save();
    return { day, coins: DAILY_COINS, item, roundDone: day === ROUND };
  }
}
