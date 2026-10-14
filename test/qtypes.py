"""Quake types in the game: work order line, HUD label, phase banners, a full run of each type without errors."""
import sys, time
from playwright.sync_api import sync_playwright
LOC = sys.argv[1] if len(sys.argv) > 1 else 'zh-TW'
OUT = '/home/claude/mq/test/shots_qtypes'
fails = []
def check(ok, msg): print(('PASS ' if ok else 'FAIL ') + msg); ok or fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale=LOC)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and errs.append(m.text))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.add_init_script("if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('mq2_coins', '500'); localStorage.setItem('mq_guide_off', 'true'); localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 10, stars: {1: 3}, best: {}})); sessionStorage.setItem('i', 1); }")
    ev = lambda js: page.evaluate(js)
    page.goto('file:///home/claude/mq/dist/itch/index.html'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(0.6)
    check(ev("__mq.LEVELS.filter(l => l.id <= 4).every(l => l.quake.type === 'sway') && __mq.LEVELS.find(l => l.id === 10).quake.type === 'long'"), 'the first jobs are a plain sway; Taipei 101 is long-period')
    for qt in ['sway', 'jolt', 'long', 'after', 'ps', 'pulse']:
        ev(f"__mq.setQuakeType('{qt}')")
        page.evaluate("document.getElementById('btnMenu').click()") if page.is_visible('#hud') else page.click('#btnLevels')
        page.wait_for_selector('#ovLevels:not([hidden])'); page.click('#levelGrid .lvcard:nth-child(7)'); page.wait_for_selector('#ovIntro:not([hidden])'); time.sleep(0.3)
        name = page.inner_text('#introQType'); req = page.inner_text('#orderReq')
        print(qt, '|', name, '|', page.inner_text('#introQDesc'), '|', req.split('\n')[1])
        page.screenshot(path=f'{OUT}/{LOC}_{qt}_order.png')
        page.click('#btnIntroGo'); time.sleep(0.5)
        ev('__mq.loadRef(7)'); page.click('#btnPlay'); time.sleep(0.2)
        check(page.inner_text('#qShindo').endswith(name) or qt == 'sway', f'{qt}: HUD shows the type ({page.inner_text("#qShindo")})')
        # record every banner the game shows (a MutationObserver), and run the quake fast
        ev("window.__banners = []; new MutationObserver(() => { const b = document.getElementById('qBanner'); if (!b.hidden) window.__banners.push(b.textContent); }).observe(document.getElementById('qBanner'), { attributes: true, childList: true })")
        ev('__mq.G.turbo = 4')
        page.wait_for_function("!__mq.G.sim || __mq.G.sim.state !== 'running'", timeout=240000, polling=200)
        ev('__mq.G.turbo = 0')
        seen = list(dict.fromkeys(ev('window.__banners')))
        res = ev("__mq.G.sim.state")
        print('  banners:', seen, '| result', res, '| t', round(ev('__mq.G.sim.t'), 1))
        want = {'ps': 2, 'after': 2, 'pulse': 1}.get(qt, 0)
        check(len(seen) >= want, f'{qt}: {want}+ banners')
        page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=60000)
        ev("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])')
    check(not errs, f'no errors {errs[:3]}')
    b.close()
print('ALL PASS' if not fails else f'{len(fails)} FAILED')
