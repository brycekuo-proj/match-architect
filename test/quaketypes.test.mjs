// 地震類型: ground motion shape of each type, the phase events the UI listens for, the building's own sway
// (long-period) and the 阻尼球 calming it, aftershock fatigue
import { LEVELS, Design, Sim, PARAMS, QTYPES, QT, SHINDO, QUAKE_TIME, groundMotion, quakeGain } from '../src/sim.js';
import { REFERENCE } from '../src/designs.js';
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const q = SHINDO['6弱'];
const peak = (type, a = 0, b = QUAKE_TIME, axis = 0) => { let m = 0; for (let t = a; t <= b; t += 0.005) m = Math.max(m, Math.abs(groundMotion(type, q, t)[axis])); return m; };

check(LEVELS.filter(l => l.id <= 4).every(l => l.quake.type === 'sway') && LEVELS.every(l => l.quake.type === (l.qtype ? (Array.isArray(l.qtype) ? 'mix' : l.qtype) : 'sway')), 'the first jobs are a plain sway; every job gets the quake type it asks for');
// the plain sway is exactly the original formula
{
  const w = 2 * Math.PI * q.f; let same = true;
  for (let t = 0; t <= QUAKE_TIME; t += 0.37) {
    const sm = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
    const env = sm(t / 0.8) * sm((QUAKE_TIME - t) / 0.8);
    const x = q.A * env * (Math.sin(w * t) + 0.25 * Math.sin(w * 1.62 * t + 1.3)), y = q.A * 0.1 * env * Math.sin(w * 1.31 * t + 0.4);
    const [gx, gy] = groundMotion('sway', q, t);
    if (Math.abs(gx - x) > 1e-12 || Math.abs(gy - y) > 1e-12) same = false;
  }
  check(same, 'sway: unchanged from the original quake');
}
for (const type of QTYPES) {
  const [x0, y0] = groundMotion(type, q, 0), [x1, y1] = groundMotion(type, q, QUAKE_TIME);
  check(Math.hypot(x0, y0) < 1e-3 && Math.hypot(x1, y1) < 1e-3, `${type}: starts and ends at rest`);
  let lvlMid = 0; for (let t = 1; t < 9; t += 0.1) lvlMid = Math.max(lvlMid, quakeGain(type, t));
  check(lvlMid > 0.3, `${type}: the HUD / rumble level rises during the quake (${lvlMid.toFixed(2)})`);
}
check(peak('jolt', 0, 10, 1) > 3 * peak('sway', 0, 10, 1) && peak('jolt', 0, 10, 0) < peak('sway', 0, 10, 0), 'jolt: much more up-and-down, less side-to-side');
check(peak('long') > 3 * peak('sway'), `long: a much wider sway (${peak('long').toFixed(2)} m vs ${peak('sway').toFixed(2)} m)`);
check(peak('after', QT.after.mainEnd + 0.7, QT.after.start - 0.05) < 0.002 && peak('after', QT.after.start + 0.5, 9) > 0.5 * peak('sway'), 'after: a calm, then the aftershock');
check(peak('ps', 0, QT.ps.sAt - 0.1, 0) < 0.3 * peak('sway') && peak('ps', 0, QT.ps.sAt, 1) > peak('sway', 0, 10, 1), 'ps: a light vertical rattle before the S wave');
check(peak('ps', QT.ps.sAt + 0.5, 9) > peak('sway', 3, 9), 'ps: the S wave is stronger than the plain sway');
check(peak('pulse', QT.pulse.pulses[0][0], QT.pulse.pulses[0][0] + 1) > 4 * peak('sway'), 'pulse: one big shove of the ground');

// phase events the game turns into banners
const lv3 = LEVELS.find(l => l.id === 3);
const phases = type => {
  const lv = { ...lv3, quake: { ...lv3.quake, type } }, d = new Design(lv); REFERENCE[3](d);
  const sim = new Sim(lv, d, PARAMS), seen = [];
  while (sim.state === 'running' && sim.t < QUAKE_TIME + 0.2) { sim.step(1 / 60); for (const e of sim.events.splice(0)) if (e.type === 'phase') seen.push(e.phase); }
  return { seen, sim };
};
{ const { seen, sim } = phases('after'); check(seen.join() === 'calm,aftershock' && sim.state === 'won', `after: calm → aftershock (${seen.join()}), two floors survive`); }
{ const { seen } = phases('ps'); check(seen.join() === 'pwave,swave', `ps: P wave → S wave (${seen.join()})`); }
{ const { seen } = phases('pulse'); check(seen.join() === 'pulse,pulse', `pulse: two shoves (${seen.join()})`); }
{ const { seen } = phases('sway'); check(seen.length === 0, 'sway: no phase events'); }

// long-period: tall buildings resonate, short ones don't; a damper calms the sway
const run = (id, type, opts = {}) => {
  const l = LEVELS.find(x => x.id === id), lv = { ...l, quake: { ...l.quake, type } }, d = new Design(lv); REFERENCE[id](d);
  if (opts.damperTop) { const ns = d.nodes.filter(n => n.kind !== 'anchor').sort((a, b) => b.y - a.y); opts = { damper: ns[Math.floor(d.nodes.length * 0.25)].id }; }
  const sim = new Sim(lv, d, PARAMS, opts); const r = sim.runHeadless(); return { r, sim };
};
{
  const short = run(3, 'long'), tall = run(10, 'long'), tallSway = run(10, 'sway'), damped = run(10, 'long', { damperTop: true });
  check(short.sim.flex.fn > 1.5 && tall.sim.flex.fn < 0.7, `long: natural frequency from the height (two floors ${short.sim.flex.fn.toFixed(2)} Hz, Taipei 101 ${tall.sim.flex.fn.toFixed(2)} Hz)`);
  check(short.r.maxStress < 0.15, `long: two floors barely notice (${short.r.maxStress})`);
  check(tall.r.maxStress > 1.5 * tallSway.r.maxStress, `long: Taipei 101 works much harder than in the sway (${tall.r.maxStress} vs ${tallSway.r.maxStress})`);
  check(damped.r.maxStress < 0.6 * tall.r.maxStress && damped.sim.flex.peak < tall.sim.flex.peak, `long: a mass damper calms it (${damped.r.maxStress})`);
  check(!tallSway.sim.flex, 'sway: no building-sway model');
}
// aftershock fatigue: joints strained in the main shock come out weaker
{
  const { sim } = run(9, 'after');
  const weak = sim.joints.filter(J => J.weak !== undefined && J.weak < 1);
  check(weak.length > 0 && weak.every(J => J.weak >= 1 - QT.after.fatigue - 1e-9), `after: ${weak.length} strained joints weakened (down to ${Math.min(...weak.map(J => J.weak)).toFixed(2)})`);
}
console.log(fails ? `${fails} FAILED` : 'quake types OK');
process.exit(fails ? 1 : 0);
