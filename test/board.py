import sys
"""Leaderboard flow with a mocked window.claude (db + user): win L1, enter nickname, upload, see rank."""
import time, json, pathlib, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
MOCK = r"""
(() => {
  const store = new Map(); const subs = [];
  const snapOf = (path) => { const docs = [...store.entries()].filter(([p]) => p.startsWith(path + '/') && p.split('/').length === path.split('/').length + 1).map(([p, v]) => ({ id: p.split('/').pop(), exists: true, data: () => v, metadata: {} })); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; };
  const notify = () => subs.forEach(([p, f]) => setTimeout(() => f(snapOf(p)), 10));
  const docRef = (path) => ({ id: path.split('/').pop(), path,
    get: async () => store.has(path) ? { id: path.split('/').pop(), exists: true, data: () => store.get(path) } : { exists: false, data: () => undefined },
    set: async (d) => { store.set(path, JSON.parse(JSON.stringify(d))); notify(); },
    update: async (d) => { store.set(path, { ...store.get(path), ...d }); notify(); }, delete: async () => { store.delete(path); notify(); } });
  const db = { doc: docRef, collection: (path) => ({ path, doc: (id) => docRef(path + '/' + id), onSnapshot: (f) => { subs.push([path, f]); setTimeout(() => f(snapOf(path)), 30); return () => {}; } }) };
  // two rival players already on the board
  store.set('board/u_rival1', { name: '火柴大師', best: { triangle: { n: 3, t: 1 } } });
  store.set('board/u_rival2', { name: '阿明', best: { triangle: { n: 3, t: 5 }, square: { n: 5, t: 9 } } });
  const user = { id: async () => 'u_me', can: async () => true, isOwner: async () => true };
  window.claude = { use: async (n) => n === 'db' ? db : n === 'user' ? user : null };
  window.__mockStore = store;
})();
"""
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script(MOCK)
    page = ctx.new_page(); logs = []
    page.on('pageerror', lambda e: logs.append(str(e)))
    def route(r):
        path = r.request.url.split('cdn.jsdelivr.net/npm/')[1]; pkg, rest = path.split('/', 1)
        f = pathlib.Path(ROOT + '/node_modules/' + pkg.rsplit('@', 1)[0] + '/' + rest)
        r.fulfill(path=str(f), content_type='application/javascript') if f.exists() else r.abort()
    page.route('**/cdn.jsdelivr.net/**', route); page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.goto(sys.argv[1] if len(sys.argv) > 1 else 'file://' + ROOT + '/test/artifact_wrapped.html')
    page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(1.5)
    print('board button visible:', page.is_visible('#btnBoard'))
    page.locator('#btnBoard').tap(); time.sleep(0.5)
    page.screenshot(path=ROOT + '/test/shots/b_board.png')
    print('board rows:', page.inner_text('#boardList').replace('\n', ' | '))
    page.locator('#btnBoardBack').tap(); page.locator('#btnLevels').tap(); time.sleep(0.4)
    print('card1:', page.locator('.lvcard').nth(0).inner_text().replace('\n', ' '))
    page.locator('.lvcard').nth(0).tap(); page.locator('#btnIntroGo').tap(); time.sleep(1)
    page.evaluate("(()=>{const m=__mq; m.G.design.clear(); m.REFERENCE[1](m.G.design); m.view.syncDesign(m.G.design); m.G.turbo=12;})()")
    page.locator('#btnPlay').tap()
    page.wait_for_selector('#ovResult:not([hidden])', timeout=120000); time.sleep(0.6)
    print('form visible:', page.is_visible('#resBoardForm'))
    page.fill('#nickInput', 'Bryce'); page.locator('#resBoardForm .btn').tap(); time.sleep(1.2)
    print('note:', page.inner_text('#resBoardNote'))
    print('result rows:', page.inner_text('#resBoardList').replace('\n', ' | '))
    page.screenshot(path=ROOT + '/test/shots/b_result.png')
    print('stored:', page.evaluate("JSON.stringify([...__mockStore.keys()])"))
    print('errors:', logs)
    b.close()
