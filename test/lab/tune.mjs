// quick tuning: node tune.mjs <type> <levels> key=value ...   (sets QT[type][key])
import { LEVELS, Design, Sim, PARAMS, QT, SHINDO } from '../../src/sim.js';
import { REFERENCE } from '../../src/designs.js';
const [type, lvs, ...kv] = process.argv.slice(2);
for (const s of kv) { const [k, v] = s.split('='); QT[type][k] = +v; }
const withDamper = process.env.DAMPER;
for (const id of lvs.split(',').map(Number)) {
  const lv0 = LEVELS.find(l => l.id === id), shindo = process.env.SHINDO || lv0.shindo;
  const lv = { ...lv0, quake: { ...SHINDO[shindo], type } };
  const d = new Design(lv); REFERENCE[id](d);
  let opts = {};
  if (withDamper) { const top = d.nodes.filter(n => n.kind !== 'anchor').sort((a, b) => b.y - a.y)[Math.floor(d.nodes.length * 0.25)]; opts = { damper: top.id }; }
  const sim = new Sim(lv, d, PARAMS, opts);
  const r = sim.runHeadless();
  console.log(`L${id} ${lv.key.padEnd(10)} ${shindo} ${type} ${kv.join(' ')} -> ${r.state} t=${r.t} maxStress=${r.maxStress} ${sim.flex ? `fn=${sim.flex.fn.toFixed(2)} u=${sim.flex.peak.toFixed(2)}` : ''} H=${sim.height.toFixed(1)}`);
}
