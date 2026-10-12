// Build: (1) artifact page using CDN libs via import map, (2) fully self-contained itch.io index.html
import { build } from 'esbuild';
import fs from 'fs';

const glb = n => fs.readFileSync(`assets/${n}.glb`).toString('base64');
// Q-version landmark models from blender/make_landmarks.py (assets/landmarks/<level key>.glb), shown after a clear
const lmDir = process.env.LM_DIR || 'assets/landmarks';
const lms = fs.existsSync(lmDir) ? fs.readdirSync(lmDir).filter(f => f.endsWith('.glb')).sort() : [];
const lmJs = lms.map(f => `  ${JSON.stringify(f.replace(/\.glb$/, ''))}: "${fs.readFileSync(`${lmDir}/${f}`).toString('base64')}",`).join('\n');
fs.writeFileSync('src/assets.js', `export const MATCH_GLB = "${glb('match')}";\nexport const LANDMARKS = {\n${lmJs}\n};\n`);
console.log('landmarks', lms.length, (lms.reduce((n, f) => n + fs.statSync(`${lmDir}/${f}`).size, 0) / 1024).toFixed(0) + ' KB');

const tpl = fs.readFileSync('src/template.html', 'utf8');
const esc = s => s.replace(/<\/script/gi, '<\\/script');
fs.mkdirSync('dist/itch', { recursive: true });

// 1) artifact build
const a = await build({
  entryPoints: ['src/entry.js'], bundle: true, format: 'esm', minify: true, write: false, target: 'es2020',
  external: ['three', 'three/addons/*', 'planck'],
});
const importmap = `<script type="importmap">${JSON.stringify({ imports: {
  three: 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
  'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/',
  planck: 'https://cdn.jsdelivr.net/npm/planck@1.4.2/dist/planck.mjs',
} })}</script>`;
const art = tpl.replace('<!--IMPORTMAP-->', () => importmap).replace('<!--APP-->', () => `<script type="module">${esc(a.outputFiles[0].text)}</script>`);
fs.writeFileSync('dist/match-architect.html', art);

// 2) itch build (offline, single file)
const b = await build({ entryPoints: ['src/entry.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' });
const head = `<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n`;
const body = tpl.replace('<!--IMPORTMAP-->', '').replace('<!--APP-->', () => `<script>${esc(b.outputFiles[0].text)}</script>`);
const [pre, post] = body.split('<div id="app">');
fs.writeFileSync('dist/itch/index.html', `${head}${pre}</head>\n<body>\n<div id="app">${post}</body>\n</html>\n`);
fs.copyFileSync('dist/itch/index.html', 'play.html');   // the game page on GitHub Pages (index.html is the homepage)
for (const f of ['dist/match-architect.html', 'dist/itch/index.html']) console.log(f, (fs.statSync(f).size / 1024).toFixed(0) + ' KB');
