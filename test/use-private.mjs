// node --import ./test/use-private.mjs test/levels.test.mjs
// Runs the tests with the Mac-only full-edition levels (private/levels_private.js) instead of the empty placeholder.
import { register } from 'node:module';
register('./private-resolve.mjs', import.meta.url);
