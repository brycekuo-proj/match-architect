// little drawings for the 防震道具 (shop cards and the item sheet), 30×30
const S = (body, extra = '') => `<svg viewBox="0 0 30 30" fill="none" stroke="#2a1a12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
// a coil along the diagonal from (6,24) to (24,6)
const coil = (() => {
  const pts = [[6, 24], [8.5, 21.5]];
  for (let i = 1; i <= 7; i++) {
    const u = 0.14 + (i - 0.5) / 7 * 0.72, cx = 6 + 18 * u, cy = 24 - 18 * u, s = i % 2 ? 3.4 : -3.4;
    pts.push([cx + s * 0.707, cy + s * 0.707]);
  }
  pts.push([21.5, 8.5], [24, 6]);
  return 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join(' L');
})();
export const ICONS = {
  damper: S('<path d="M5 5h20" stroke-width="2.6"/><path d="M11 5l2.6 8M19 5l-2.6 8"/><circle cx="15" cy="19" r="7" fill="#e3a93a"/><path d="M11.5 17a4 4 0 0 1 3-2.6" stroke="#fff3c4" stroke-width="1.6"/>'),
  iso: S('<rect x="6" y="3.5" width="18" height="11" rx="1.5" fill="#fff7e8"/><path d="M10 7.5v3M15 7.5v3M20 7.5v3" stroke-width="1.6"/><rect x="4" y="15" width="22" height="3.2" rx="1" fill="#d6cfc2"/><rect x="7" y="19" width="6" height="5" rx="1" fill="#202328"/><rect x="17" y="19" width="6" height="5" rx="1" fill="#202328"/><path d="M10 19v5M20 19v5" stroke="#9aa3ad" stroke-width="1.8"/><path d="M2.5 26h25"/>'),
  scanner: S('<rect x="3.5" y="4" width="23" height="16" rx="2.5" fill="#dff6ff"/><path d="M6.5 14.5l3.5-4 3 3.5 3-7 3 8.5 2.5-3 2 2" stroke="#d9392b"/><path d="M11 25.5h8M15 20v5.5"/>'),
  spring: S(`<path d="${coil}" stroke="#2a1a12" stroke-width="4.2"/><path d="${coil}" stroke="#f2c230" stroke-width="2.2"/><circle cx="6" cy="24" r="2.6" fill="#d5dce2"/><circle cx="24" cy="6" r="2.6" fill="#d5dce2"/>`),
  steel: S('<path d="M7 5.5h16v4.2h-5.6v10.6H23v4.2H7v-4.2h5.6V9.7H7z" fill="#9eabb8"/><path d="M9 7.5h5" stroke="#e8eef4" stroke-width="1.4"/>'),
  cfrp: S('<path d="M5 25L25 5" stroke="#2a1a12" stroke-width="7.5"/><path d="M5 25L25 5" stroke="#e9c48b" stroke-width="4.5"/><path d="M9.5 20.5L20.5 9.5" stroke="#2a1a12" stroke-width="9"/><path d="M9.5 20.5L20.5 9.5" stroke="#4a5262" stroke-width="6.6"/><path d="M11 17l2 2M13.5 14.5l2 2M16 12l2 2M12.5 21l-1.8-1.8" stroke="#8d9ab0" stroke-width="1.2"/><circle cx="25" cy="5" r="3.2" fill="#d9392b"/>'),
  noads: S('<rect x="3.5" y="7" width="23" height="16" rx="3" fill="#fff"/><text x="15" y="19.3" text-anchor="middle" font-family="Bungee, sans-serif" font-size="8.5" fill="#2a1a12" stroke="none">AD</text><path d="M5 26L25 4" stroke="#d9392b" stroke-width="3"/>'),
  hint: S('<path d="M15 4a8 8 0 0 0-5 14.2V21h10v-2.8A8 8 0 0 0 15 4z" fill="#ffe28a"/><path d="M11.5 24.5h7M13 27.5h4"/>'),
};
