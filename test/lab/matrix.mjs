// Every reference build under every quake type at its own 震度 (and one step stronger): who survives, peak joint load
import { LEVELS, Design, Sim, PARAMS, QTYPES, SHINDO } from '../../src/sim.js';
import { REFERENCE } from '../../src/designs.js';
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const types = process.argv[3] ? process.argv[3].split(',') : QTYPES;
const order = ['3', '4', '5弱', '5強', '6弱', '6強', '7'];
const run = (lv, type, shindo, opts) => {
  const lvq = { ...lv, quake: { ...SHINDO[shindo], type } };
  const d = new Design(lvq); REFERENCE[lv.id](d);
  const sim = new Sim(lvq, d, PARAMS, opts);
  const r = sim.runHeadless();
  return { ...r, flex: sim.flex ? +sim.flex.peak.toFixed(2) : null, fn: sim.flex ? +sim.flex.fn.toFixed(2) : null };
};
const cell = r => (r.state === 'won' ? `ok ${r.maxStress.toFixed(2)}` : `X@${r.t}s`).padEnd(9);
console.log('lv  key         震度 | ' + types.map(t => t.padEnd(9)).join(' ') + ' | max 震度 per type');
for (const lv of LEVELS) {
  if (only && !only.includes(lv.id)) continue;
  const row = [], maxs = [];
  for (const type of types) {
    row.push(cell(run(lv, type, lv.shindo)));
    let best = '-'; for (const k of order) { if (run(lv, type, k).state !== 'won') break; best = k; } maxs.push(best);
  }
  console.log(`L${String(lv.id).padStart(2)} ${lv.key.padEnd(11)} ${lv.shindo.padEnd(3)} | ${row.join(' ')} | ${maxs.join(' ')}`);
}
