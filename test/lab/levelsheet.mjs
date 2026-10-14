// Dump every job (ids from-to) with its reference build and a quick physics result, for levelsheet.py to draw.
// node --import ./test/use-private.mjs test/lab/levelsheet.mjs 11-20 > /tmp/x.json
import { LEVELS, Design, Sim, PARAMS, L, levelTerrain, LOADS } from '../../src/sim.js';
import { REFERENCE } from '../../src/designs.js';
const [lo, hi] = (process.argv[2] || '1-100').split('-').map(Number);
const out = [];
for (const lv of LEVELS) {
  if (lv.id < lo || lv.id > (hi || lo)) continue;
  const d = new Design(lv); let items = {};
  try { items = (REFERENCE[lv.id] && REFERENCE[lv.id](d)) || {}; } catch (e) { items = { error: String(e) }; }
  let r = { state: 'none' };
  if (REFERENCE[lv.id] && !items.error) r = new Sim(lv, d, PARAMS, items).runHeadless();
  out.push({
    id: lv.id, key: lv.key, name: lv.name, en: lv.en && lv.en.name, shindo: lv.shindo, qt: lv.quake.type === 'mix' ? lv.quake.mix.join('+') : lv.quake.type, par: lv.par,
    terrain: levelTerrain(lv), anchors: lv.anchors.map(([x, y]) => [x * L, y * L]), stars: lv.stars.map(([x, y]) => [x * L, y * L]),
    loads: (lv.loads || []).map(ld => ({ ...ld, ...LOADS[ld.kind] })), soft: (lv.soft || []).map(([a, b]) => [a * L, b * L]), supply: lv.supply || null,
    segs: d.sticks.map(s => d.ends(s)), used: d.used(), items: Object.keys(items), damper: items.damper !== undefined ? d.node(items.damper) : null,
    state: r.state, t: r.t, stress: r.maxStress, view: lv.view.map(v => v * L),
  });
}
console.log(JSON.stringify(out));
