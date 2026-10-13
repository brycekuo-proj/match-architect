// Free vibration of each reference build: a small ground nudge, then measure how the top sways (dominant frequency)
import { LEVELS, Design, Sim, PARAMS } from '../../src/sim.js';
import { REFERENCE } from '../../src/designs.js';
const dt = 1 / 120;
for (const lv of LEVELS) {
  const d = new Design(lv); REFERENCE[lv.id](d);
  const sim = new Sim(lv, d, PARAMS);
  // nudge: 0.04 m smooth step to the side over 0.15 s at t = 0.5 s, then still
  sim._quakeTarget = t => { const u = Math.max(0, Math.min(1, (t - 0.5) / 0.15)); return [0.04 * u * u * (3 - 2 * u), 0]; };
  const st = sim.stars.reduce((a, s) => (!a || s.home.y > a.home.y ? s : a), null);
  const xs = [];
  while (sim.t < 8.5 && sim.state === 'running') {
    sim.step(dt);
    if (sim.t > 0.9) { const p = st.body.getWorldPoint(st.local); xs.push(p.x - sim.ground.getPosition().x - st.home.x); }
  }
  // remove mean, find dominant frequency by a direct DFT scan 0.2–8 Hz
  const m = xs.reduce((a, b) => a + b, 0) / xs.length, ys = xs.map(v => v - m);
  let best = [0, 0];
  for (let f = 0.2; f <= 8; f += 0.02) {
    let re = 0, im = 0; ys.forEach((y, i) => { const a = 2 * Math.PI * f * i * dt; re += y * Math.cos(a); im += y * Math.sin(a); });
    const p = re * re + im * im; if (p > best[1]) best = [f, p];
  }
  const amp = Math.max(...ys.map(Math.abs));
  console.log(`L${String(lv.id).padStart(2)} ${lv.key.padEnd(11)} h=${(st.home.y).toFixed(1)}m sticks=${d.used()} f≈${best[0].toFixed(2)}Hz amp=${(amp * 1000).toFixed(1)}mm ${sim.state}`);
}
