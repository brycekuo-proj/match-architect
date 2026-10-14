// New level mechanics: lattice art → reference build, stepped ground, heavy stars (屋頂載重), soft ground (軟地基),
// mixed quakes (混合)
import { Design, Sim, PARAMS, SHINDO, QT, groundMotion, quakeTimeline, flexShareAt, QUAKE_TIME } from '../src/sim.js';
import { art, steps, row, chapter } from '../src/leveltools.js';
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const FLAT = [[-40, 0], [50, 0], [50, -2], [-40, -2]];
const mk = (a, o) => {
  const lv = { terrain: [FLAT], ...a.level, par: a.par, ...o };
  lv.budget = lv.par * 2;
  lv.quake = { ...SHINDO[o.shindo || '5弱'], type: Array.isArray(o.qtype) ? 'mix' : (o.qtype || 'sway'), ...(Array.isArray(o.qtype) ? { mix: o.qtype } : {}) };
  return lv;
};
const run = (lv, a, opts) => { const d = new Design(lv); const items = a.build(d) || {}; const sim = new Sim(lv, d, PARAMS, opts || items); return { d, sim, r: sim.runHeadless() }; };

// lattice art
const tower = art(`
  |   *
  |  o o
  | o o o
  |A A A A
`);
check(tower.par === 12 && tower.level.anchors.length === 4 && tower.level.stars.length === 1 && tower.level.stars[0][1] === row(3), `art: pyramid of 6 joints = 12 matches, 4 anchors, star on row 3 (par ${tower.par})`);
let threw = ''; try { art(`\n  |o\n  |A A\n`); } catch (e) { threw = e.message; }
check(/off the lattice/.test(threw), 'art: a joint off the triangle lattice is refused');
threw = ''; try { art(`\n  | o     o\n  |A A\n`); } catch (e) { threw = e.message; }
check(/cannot be braced/.test(threw), 'art: a joint with nothing to brace it is refused');
{
  const lv = mk(tower, { shindo: '5弱' }), { d, r } = run(lv, tower);
  check(d.used() === tower.par && r.state === 'won' && d.canStart().ok, `art build: ${d.used()} matches, survives 5弱 (${r.state})`);
  check(lv.sils.length === 1 && lv.sils[0].length >= 6, 'art: an outline guide for the shape');
}
// cantilever brace from the side, and a joint hanging below
const arm = art(`
  |  o o o *
  | o o o o
  |A A
`);
{ const lv = mk(arm, { shindo: '3' }), { d, r } = run(lv, arm); check(d.used() === arm.par && d.canStart().ok, `art: side-braced arm builds (${d.used()} matches, ${r.state})`); }

// a spring damper in place of a match (open bay): the reference leaves the match out and needs its springs
{
  const bay = art(`
  |  *
  | o o
  |A A A
`, { open: [[2, 0, 1.5, 1]], struts: [[2, 0, 1.5, 1]] });
  const lv = mk(bay, { shindo: '6強' }), d = new Design(lv), it = bay.build(d);
  const withS = new Sim(lv, d, PARAMS, it).runHeadless(), without = new Sim(lv, d, PARAMS, {}).runHeadless();
  check(bay.par === 5 && d.used() === 5 && withS.state === 'won' && without.state === 'lost', `open: one match left out for a spring (par ${bay.par}); springs ${withS.state}, without ${without.state}`);
}

// stepped ground: anchors on two levels
const hill = art(`
  |   *
  |  o o
  | o o A
  |A A
`);
{
  const lv = mk(hill, { shindo: '4', terrain: [steps(0, [1.75, 1])] });
  const { d, r } = run(lv, hill);
  let through = false;
  for (const s of d.sticks) { const [x1, y1, x2, y2] = d.ends(s); for (let k = 1; k < 20; k++) if (d.insideTerrain(x1 + (x2 - x1) * k / 20, y1 + (y2 - y1) * k / 20)) through = true; }
  check(lv.anchors.some(a => a[1] > 0) && !through && r.state === 'won', `steps: an anchor up on the step, no match through the ground, survives (${r.state})`);
}

// heavy stars
const post = art(`
  |  *
  | o o
  |A A A
`, { loads: [{ x: 1, r: 2, kg: 2, kind: 'tank' }] });
{
  const light = run(mk(post, { shindo: '5強', loads: [] }), post), heavy = run(mk(post, { shindo: '5強', loads: post.level.loads }), post);
  check(heavy.sim.loads.length === 1 && heavy.r.maxStress > light.r.maxStress * 1.5, `load: a 2 kg tank on top works the frame harder (${light.r.maxStress} → ${heavy.r.maxStress})`);
  const crush = run(mk(post, { shindo: '5強', loads: [{ star: 0, kg: 40, kind: 'tank' }] }), post);
  check(crush.r.state === 'lost', `load: 40 kg is too much for it (${crush.r.state})`);
}

// soft ground
const wide = art(`
  |   *
  |  o o
  | o o o
  |A A A A
`);
{
  const firm = run(mk(wide, { shindo: '5強' }), wide);
  const mud = run(mk(wide, { shindo: '5強', soft: [[2.5, 3.5]], softCap: 12 }), wide);
  const sinks = mud.sim.sinks.map((f, i) => mud.sim.anchorSink(i));
  check(firm.sim.sinks.every(s => !s), 'soft: no footings on firm ground');
  check(mud.sim.sinks.filter(Boolean).length === 1 && Math.min(...sinks) < -0.05, `soft: the anchor in the mud sinks (${Math.min(...sinks).toFixed(2)} m)`);
  const strong = run(mk(wide, { shindo: '5強', soft: [[2.5, 3.5]], softCap: 500 }), wide);
  check(Math.min(...strong.sim.sinks.map((f, i) => strong.sim.anchorSink(i))) > -0.02, 'soft: firm enough mud holds');
}

// mixed quakes
{
  const q = { ...SHINDO['6弱'], type: 'mix', mix: ['jolt', 'long'] };
  const tl = quakeTimeline(q);
  check(tl.some(e => e.phase === 'next' && e.quake === 'long' && Math.abs(e.t - 5.05) < 1e-6), 'mix: "next" banner when the second quake starts');
  check(flexShareAt(q, 2) === 0 && flexShareAt(q, 7) === QT.long.flex, 'mix: building sway only in the long-period half');
  let jump = 0, prev = groundMotion('mix', q, 0);
  for (let t = 0.01; t < QUAKE_TIME; t += 0.01) { const g = groundMotion('mix', q, t); jump = Math.max(jump, Math.hypot(g[0] - prev[0], g[1] - prev[1])); prev = g; }
  check(jump < 0.05, `mix: the ground never jumps (max step ${jump.toFixed(3)} m per 10 ms)`);
  const q3 = { ...SHINDO['6弱'], type: 'mix', mix: ['ps', 'after', 'pulse'] }, tl3 = quakeTimeline(q3).map(e => e.phase);
  check(['pwave', 'swave', 'next', 'calm', 'aftershock', 'pulse'].every(p => tl3.includes(p)), `mix: every part keeps its own moments (${tl3.join(',')})`);
  const lv = mk(wide, { shindo: '5弱', qtype: ['jolt', 'long'] }), { r } = run(lv, wide);
  check(lv.quake.type === 'mix' && r.state === 'won', `mix: a pyramid survives a mixed 5弱 (${r.state})`);
  // the game hears it: a 'phase' event naming the next quake type
  const d = new Design(lv); wide.build(d); const sim = new Sim(lv, d, PARAMS, {}), heard = [];
  while (sim.state === 'running' && sim.t < 6) { sim.step(1 / 60); for (const e of sim.events.splice(0)) if (e.type === 'phase') heard.push(e.phase + ':' + (e.quake || '')); }
  check(heard.includes('next:long'), `mix: the run sends the "next" phase event (${heard.join(',')})`);
}

// chapter helper
{
  const c = chapter([[11, tower, { key: 'tent', name: '帳篷', shindo: '4' }], [91, tower, { key: 'sphinx2', model: 'sphinx', name: '獅身', shindo: '7' }]]);
  const lvs = c.levels();
  check(c.keys.join() === 'tent' && lvs[0].par === 12 && lvs[0].anchors.length === 4 && typeof c.designs()[91] === 'function', 'chapter: keys (a reused model adds none), levels and builds');
}
console.log(fails ? `${fails} FAILED` : 'mechanics OK');
process.exit(fails ? 1 : 0);
