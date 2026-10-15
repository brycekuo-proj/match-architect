// Which version of the game this build is. build.mjs sets __MQ_EDITION__ with esbuild's define; tests and plain
// imports get 'web'.
//   web      GitHub Pages, itch.io, AI Browser Game Jam 5, the Claude link: chapter 1 (jobs 1–10), free, no ads
//   android  Google Play: all 100 jobs, free with AdMob ads (and a remove-ads purchase)
//   ios      App Store: the same as android
//   steam    Steam (desktop): all 100 jobs, bought once: no ads, no purchases
//   preview  the author's own full-edition file: every job open, plenty of coins
/* global __MQ_EDITION__ */
export const EDITION = typeof __MQ_EDITION__ !== 'undefined' ? __MQ_EDITION__ : 'web';
export const ADS_EDITION = EDITION === 'android' || EDITION === 'ios';   // the only builds that may show real ads
