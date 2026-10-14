// 完整版 (full / App edition) content: jobs 11 to 100, their reference builds and landmark models.
// The web, itch.io and jam builds resolve this file to levels_web.js instead (see build.mjs), so none of this ships
// there; the web edition only shows these jobs as locked cards.
import { PRIVATE_KEYS, privateLevels, privateDesigns } from './levels_private.js';   // jobs 11–100 except 40 (Mac only)

export const WEB_EDITION = false;
export const FULL_KEYS = ['skytree', 'burj', 'sagrada', ...PRIVATE_KEYS];   // landmark models only the full edition carries
export const TEASERS = [];
export const fullLevels = h => [...publicJobs(h), ...privateLevels(h)];
// Tokyo Skytree (job 40, the end of chapter 4) is the one full-edition job kept in the public repo; every other job from 11
// to 100 — including the bigger Burj Khalifa (99) and Sagrada Família (100) — lives in private/ on the Mac.
const publicJobs = ({ range, row }) => [
  {
    id: 40, key: 'skytree', en: {"name": "Tokyo Skytree", "place": "Tokyo, Japan", "real": "634 m tall", "desc": "The world's tallest broadcasting tower: long and slim.", "hint": "Spread the bottom with many layers of triangles and narrow it as you go up."}, name: '東京晴空塔', place: '日本 · 東京', real: '高 634 公尺', shindo: '6強', par: 64, qtype: 'long',
    desc: '世界最高的電波塔，又細又長。',
    hint: '底部用很多層三角形撐開，越往上越窄。',
    anchors: range(0, 7), stars: [[3.5, row(9)]],
    sil: [[.1, 0], [.9, 0], [.6, .35], [.57, .6], [.64, .63], [.64, .67], [.56, .7], [.54, .82], [.58, .84], [.54, .86], [.51, 1], [.49, 1], [.46, .86], [.42, .84], [.46, .82], [.44, .7], [.36, .67], [.36, .63], [.43, .6], [.4, .35]],
  },
];
export const fullDesigns = LatticeBuilder => ({ ...publicDesigns(LatticeBuilder), ...privateDesigns(LatticeBuilder) });
const publicDesigns = LatticeBuilder => ({
  40: d => { const b = new LatticeBuilder(d); b.pyramid(0, 7, 6); b.column([3, 6], [4, 6], 3.5, 9); },
});
