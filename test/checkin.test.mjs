// 每日簽到 logic: days in a row, 補簽 (make-up) for coins or restart, items on days 5/10/15/20/25, a big item on
// day 30 (alternating each round), then a new round
import { CheckIn, ROUND, MAKEUP_COST, MAKEUP_MAX } from '../src/checkin.js';
let mem = {};
const store = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const RealDate = Date; let dayOffset = 0;
globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + dayOffset * 864e5); } static now() { return RealDate.now() + dayOffset * 864e5; } };
const next = (n = 1) => { dayOffset += n; };

let c = new CheckIn(store);
check(!c.doneToday && c.count === 0 && c.missed === 0, 'fresh: nothing checked in, nothing missed');
const r1 = c.checkIn();
check(r1 && r1.day === 1 && r1.coins === 10 && !r1.item, 'day 1: 10 coins, no item');
check(c.checkIn() === null && c.doneToday, 'only once a day');
c = new CheckIn(store); check(c.doneToday && c.count === 1, 'saved across reloads');
const got = [];
for (let d = 2; d <= ROUND; d++) { next(); const r = c.checkIn(); if (r.item) got.push(`${r.day}:${r.item.id}x${r.item.n}`); }
check(got.join(' ') === '5:hintx1 10:steelx1 15:cfrpx5 20:springx1 25:scannerx1 30:damperx1', 'round 1 items: ' + got.join(' '));
next(5);   // a finished round has nothing to make up
check(c.missed === 0, 'gap after a finished round costs nothing');
const n1 = c.checkIn();
check(n1.day === 1 && c.round === 1, 'next check-in starts round 2 at day 1');

// streak with a gap: 補簽
next(); c.checkIn(); next(); c.checkIn(); next(); c.checkIn();   // days 2,3,4
next(3);   // missed 2 days
check(c.missed === 2 && c.canMakeUp && c.makeUpCost === 2 * MAKEUP_COST, `missed 2 days: make-up costs ${c.makeUpCost}`);
check(c.checkIn() === null, 'cannot check in before settling the missed days');
const mu = c.makeUp();
check(mu.days.join(',') === '5,6' && mu.items.length === 1 && mu.items[0].id === 'hint', 'make-up fills days 5–6 and pays the day-5 item');
check(c.missed === 0 && c.made.join(',') === '5,6', 'streak kept, made-up days marked');
const r7 = c.checkIn();
check(r7.day === 7, 'today is day 7');

// too long a gap: restart only
next(MAKEUP_MAX + 2);
check(c.missed === MAKEUP_MAX + 1 && !c.canMakeUp, `missed ${c.missed} days: too many to make up`);
c.restart();
check(c.count === 0 && c.missed === 0 && c.made.length === 0, 'restart clears the streak');
check(c.checkIn().day === 1, 'after a restart today is day 1');

// make-up never fills day 30 (today has to be checked in)
for (let d = 2; d <= 28; d++) { next(); c.checkIn(); }
next(4);   // missed 3 days with 28 done
check(c.makeUpDays === 1 && c.makeUpCost === MAKEUP_COST, 'near the end only day 29 needs making up');
c.makeUp(); const r30 = c.checkIn();
check(r30.day === 30 && r30.item.id === 'iso' && r30.roundDone, 'round 2 day 30: bearings (alternates with the damper)');

// device clock rolled back
next(-3);
check(c.clockBack && c.checkIn() === null && c.missed === 0, 'clock set back: no check-in');
console.log(fails ? `${fails} FAILED` : 'checkin OK');
process.exit(fails ? 1 : 0);
