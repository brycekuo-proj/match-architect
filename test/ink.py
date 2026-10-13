"""卡通描邊 screenshots: title, a build with items, a tall tower, the quake, the shop and the turntable model."""
import sys, time
from playwright.sync_api import sync_playwright
OUT = '/home/claude/mq/test/shots_ink'
LOC = sys.argv[1] if len(sys.argv) > 1 else 'zh-TW'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale=LOC)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and errs.append(m.text))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.add_init_script("""if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('mq2_coins', '5000'); localStorage.setItem('mq_guide_off', 'true');
      localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 13, stars: {1: 3, 8: 3}, best: {}}));
      localStorage.setItem('mq2_shop', JSON.stringify({inv: {damper: 3, iso: 3, spring: 4, cfrp: 20, steel: 3, scanner: 2, hint: 1}}));
      sessionStorage.setItem('i', 1); }""")
    ev = page.evaluate
    sh = lambda n: page.screenshot(path=f'{OUT}/{LOC}_{n}.png')
    page.goto('file:///home/claude/mq/dist/itch/index.html'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(2); sh('01_title')
    def job(i):
        ev("document.getElementById('btnLevels').click()"); time.sleep(0.3)
        ev(f"document.querySelectorAll('#levelGrid .lvcard')[{i}].click()"); time.sleep(0.3)
        ev("document.getElementById('btnIntroGo').click()"); time.sleep(1.2)
    job(1)
    ev("""(() => { const m = __mq, d = m.G.design; d.clear(); const L = 2;
      d.addSegment(0,0,L,0); d.addSegment(0,0,0,L); d.addSegment(L,0,L,L); d.addSegment(0,L,L,L);
      const n = (x,y) => d.nodes.find(q => Math.abs(q.x-x)<1e-6 && Math.abs(q.y-y)<1e-6).id;
      Object.assign(m.G.load, { steel: true, iso: true, wraps: [d.sticks[1].id], struts: [{a: n(0,0), b: n(L,L)}], damper: n(0,L) });
      m.itemsChanged(); })()"""); time.sleep(1.5); sh('02_build_items')
    ev("document.getElementById('btnPlay').click()"); time.sleep(4); sh('03_quake_items')
    ev("document.getElementById('btnPlay').click()"); time.sleep(0.5)
    ev("document.getElementById('btnMenu').click()"); time.sleep(0.3); ev("document.getElementById('btnLevelsBack').click()"); time.sleep(0.3)
    job(7); ev('__mq.loadRef(8)'); time.sleep(1.5); sh('04_tokyo_build')
    ev("__mq.G.turbo = 4; document.getElementById('btnPlay').click()"); time.sleep(5); sh('05_tokyo_quake')
    ev("__mq.G.turbo = 0; document.getElementById('btnPlay').click()"); time.sleep(0.5)
    ev("__mq.reveal(8)"); time.sleep(3); sh('06_reveal')
    print('errors', errs[:5])
    b.close()
