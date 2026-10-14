// The first versions of the Burj Khalifa (80 matches) and Sagrada Família (108 matches) jobs, kept as fixed test
// fixtures for the item and collapse tests (the game's own jobs 99 and 100 are bigger and live in private/).
import { SHINDO } from '../src/sim.js';
const T = Math.sqrt(3) / 2, row = n => n * T;
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push([i, 0]); return r; };
const FLAT = [[-40, 0], [50, 0], [50, -2], [-40, -2]];
const job = o => ({ terrain: [FLAT], ...o, budget: o.par * 2, quake: { ...SHINDO[o.shindo], type: 'sway' },
  view: [-0.55, Math.max(...o.anchors.map(a => a[0])) + 0.55, -0.3, Math.max(...o.stars.map(s => s[1])) + 0.4] });
export const OLD_BURJ = job({ id: 12, key: 'burj_test', name: '杜拜塔', shindo: '7', par: 80, anchors: range(0, 8), stars: [[4, row(10)]] });
export const OLD_SAGRADA = job({ id: 13, key: 'sagrada_test', name: '聖家堂', shindo: '7', par: 108, anchors: range(0, 10),
  stars: [[5, row(10)], [3.5, row(7)], [6.5, row(7)], [2.5, row(5)], [7.5, row(5)]] });
export const sagradaRef = LatticeBuilder => d => {
  const b = new LatticeBuilder(d); b.pyramid(0, 10, 6);
  b.node(3.5, 7, [3, 6], [4, 6]); b.node(6.5, 7, [6, 6], [7, 6]);
  b.column([4, 6], [5, 6], 5, 10);
};
