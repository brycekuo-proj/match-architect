// Build: (1) artifact page using CDN libs via import map, (2) fully self-contained itch.io index.html (both the web /
// game-jam edition, jobs 1–10), (3) the full editions for Google Play, App Store, Steam and the author's preview
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { FULL_KEYS } from './src/levels_full.js';

const glb = n => fs.readFileSync(`assets/${n}.glb`).toString('base64');
// Q-version landmark models from blender/make_landmarks.py (assets/landmarks/<level key>.glb), shown after a clear
const lmDir = process.env.LM_DIR || 'assets/landmarks';
const lms = fs.existsSync(lmDir) ? fs.readdirSync(lmDir).filter(f => f.endsWith('.glb')).sort() : [];
// 完整版 content (jobs 11–100 except 40) stays on this Mac only, in private/ (git-ignored): levels_private.js and landmarks/*.glb
const PRIV = 'private', privLm = `${PRIV}/landmarks`, hasPrivate = fs.existsSync(`${PRIV}/levels_private.js`);
const plms = fs.existsSync(privLm) ? fs.readdirSync(privLm).filter(f => f.endsWith('.glb')).sort() : [];
const lmJs = [...lms.map(f => [lmDir, f]), ...plms.map(f => [privLm, f])]
  .map(([d, f]) => `  ${JSON.stringify(f.replace(/\.glb$/, ''))}: "${fs.readFileSync(`${d}/${f}`).toString('base64')}",`).join('\n');
fs.writeFileSync('src/assets.js', `export const MATCH_GLB = "${glb('match')}";\nexport const LANDMARKS = {\n${lmJs}\n};\n`);
// the web edition (artifact, itch.io, GitHub Pages) carries jobs 1–10 only: no full-edition levels, designs or models
const webJs = lms.filter(f => !FULL_KEYS.includes(f.replace(/\.glb$/, ''))).map(f => `  ${JSON.stringify(f.replace(/\.glb$/, ''))}: "${fs.readFileSync(`${lmDir}/${f}`).toString('base64')}",`).join('\n');
fs.writeFileSync('src/assets_web.js', `export const MATCH_GLB = "${glb('match')}";\nexport const LANDMARKS = {\n${webJs}\n};\n`);
const webEdition = { name: 'web-edition', setup(b) {
  b.onResolve({ filter: /\/levels_full\.js$/ }, () => ({ path: path.resolve('src/levels_web.js') }));
  b.onResolve({ filter: /\/assets\.js$/ }, () => ({ path: path.resolve('src/assets_web.js') }));
} };
console.log('landmarks', lms.length, (lms.reduce((n, f) => n + fs.statSync(`${lmDir}/${f}`).size, 0) / 1024).toFixed(0) + ' KB', '| private:', hasPrivate ? 'yes' : 'none', plms.length ? `+${plms.length} models` : '');

const tpl = fs.readFileSync('src/template.html', 'utf8');
const esc = s => s.replace(/<\/script/gi, '<\\/script');
fs.mkdirSync('dist/itch', { recursive: true });

// 1) artifact build
const a = await build({
  entryPoints: ['src/entry.js'], bundle: true, format: 'esm', minify: true, write: false, target: 'es2020',
  external: ['three', 'three/addons/*', 'planck'], plugins: [webEdition], define: { __MQ_EDITION__: '"web"' },
});
const importmap = `<script type="importmap">${JSON.stringify({ imports: {
  three: 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
  'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/',
  planck: 'https://cdn.jsdelivr.net/npm/planck@1.4.2/dist/planck.mjs',
} })}</script>`;
const art = tpl.replace('<!--IMPORTMAP-->', () => importmap).replace('<!--APP-->', () => `<script type="module">${esc(a.outputFiles[0].text)}</script>`);
fs.writeFileSync('dist/match-architect.html', art);

// 2) itch build (offline, single file)
const b = await build({ entryPoints: ['src/entry.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', plugins: [webEdition], define: { __MQ_EDITION__: '"web"' } });
const head = `<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n`;
const body = tpl.replace('<!--IMPORTMAP-->', '').replace('<!--APP-->', () => `<script>${esc(b.outputFiles[0].text)}</script>`);
const [pre, post] = body.split('<div id="app">');
fs.writeFileSync('dist/itch/index.html', `${head}${pre}</head>\n<body>\n<div id="app">${post}</body>\n</html>\n`);
fs.copyFileSync('dist/itch/index.html', 'play.html');   // the game page on GitHub Pages (index.html is the homepage)

// 3) full editions (jobs 1–100 with every model, including private/). Not published on the web; dist/app, dist/steam and
// dist/ios are git-ignored. One build per store: EDITION decides ads (src/ads.js) and a few labels (src/edition.js).
//   android → the Google Play App (android/build.sh copies dist/app/index.html into the APK): free, AdMob, remove-ads purchase
//   ios     → the App Store App (WKWebView, same rules as android)
//   steam   → the Steam desktop build (steam/, Electron): bought once, no ads or purchases
//   preview → for the author: every job open and plenty of coins, to try any job
const privateEdition = { name: 'private-edition', setup(b) {
  if (hasPrivate) b.onResolve({ filter: /\/levels_private\.js$/ }, () => ({ path: path.resolve(`${PRIV}/levels_private.js`) }));
} };
const appPage = js => `${head}${pre}</head>\n<body>\n<div id="app">${tpl.replace('<!--IMPORTMAP-->', '').replace('<!--APP-->', () => `<script>${esc(js)}</script>`).split('<div id="app">')[1]}</body>\n</html>\n`;
const FULL = [['android', 'dist/app/index.html'], ['preview', 'dist/app/preview.html'], ['steam', 'dist/steam/index.html'], ['ios', 'dist/ios/index.html']];
for (const [ed, out] of FULL) {
  const r = await build({ entryPoints: ['src/entry.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', plugins: [privateEdition], define: { __MQ_EDITION__: JSON.stringify(ed) } });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, appPage(r.outputFiles[0].text));
}
for (const f of ['dist/match-architect.html', 'dist/itch/index.html', ...FULL.map(([, out]) => out)]) console.log(f, (fs.statSync(f).size / 1024).toFixed(0) + ' KB');
