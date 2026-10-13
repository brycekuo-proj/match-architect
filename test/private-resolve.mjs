// module hook for use-private.mjs: src/levels_private.js → private/levels_private.js when that file exists
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const priv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../private/levels_private.js');
export async function resolve(spec, ctx, next) {
  if (/(^|\/)levels_private\.js$/.test(spec) && !(ctx.parentURL || '').includes('/private/') && fs.existsSync(priv)) return { url: pathToFileURL(priv).href, shortCircuit: true };
  return next(spec, ctx);
}
