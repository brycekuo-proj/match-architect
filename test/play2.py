"""Touch play-through of the landmark version: tutorials by finger, Eiffel by finger, Sagrada via the reference build."""
import sys, time, math, json, os
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; MODE = sys.argv[2] if len(sys.argv) > 2 else 'touch'
OUT = '/home/claude/mq/test/shots2'; os.makedirs(OUT, exist_ok=True)
L = 2.0; T = math.sqrt(3) / 2

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        if MODE == 'touch':
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        else:
            ctx = b.new_context(viewport={'width': 1280, 'height': 760})
        page = ctx.new_page(); logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        if len(sys.argv) > 3:
            import pathlib
            def route(r):
                path = r.request.url.split('cdn.jsdelivr.net/npm/')[1]; pkg, rest = path.split('/', 1)
                f = pathlib.Path('/home/claude/mq/node_modules/' + pkg.rsplit('@', 1)[0] + '/' + rest)
                r.fulfill(path=str(f), content_type='application/javascript') if f.exists() else r.abort()
            page.route('**/cdn.jsdelivr.net/**', route)
        page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        page.goto(URL)
        page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(2.5)
        shot(page, '01_title')
        tap(page, '#btnStart'); page.wait_for_selector('#ovIntro:not([hidden])'); time.sleep(0.4)
        shot(page, '02_intro_L1')
        tap(page, '#btnIntroGo'); time.sleep(1.2)
        page.evaluate('__mq.G.turbo = 12')
        cdp = ctx.new_cdp_session(page)
        drag(page, cdp, (0, 0), (L, 0)); drag(page, cdp, (0, 0), (L / 2, T * L)); drag(page, cdp, (L, 0), (L / 2, T * L * 1.05))
        print('L1 sticks', ev(page, '__mq.G.design.used()'), 'canStart', ev(page, 'JSON.stringify(__mq.G.design.canStart())'))
        tap(page, '#btnPlay'); time.sleep(2); shot(page, '03_L1_quake')
        page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=120000); page.evaluate("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])', timeout=5000); time.sleep(0.5)
        print('L1:', page.inner_text('#resTitle'), '|', page.inner_text('#resReason')); shot(page, '04_L1_result')
        # L2 braced square via fingers
        tap(page, '#resBtns .primary'); page.wait_for_selector('#ovIntro:not([hidden])'); tap(page, '#btnIntroGo'); time.sleep(1)
        page.evaluate('__mq.G.turbo = 12')
        for a, c in [((0, 0), (L, 0)), ((0, 0), (0, L)), ((L, 0), (L, L)), ((0, L), (L, L))]: drag(page, cdp, a, c)
        bx = math.sqrt(L * L - (0.75 * L) ** 2); drag(page, cdp, (0, 0.25 * L), (bx, L))
        print('L2 sticks', ev(page, '__mq.G.design.used()'))
        tap(page, '#btnPlay'); page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=120000); page.evaluate("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])', timeout=5000)
        print('L2:', page.inner_text('#resTitle'), '|', page.inner_text('#resReason'))
        # level select with everything unlocked
        page.evaluate('__mq.G.progress.unlocked = 13')
        tap(page, '#resBtns .ghost'); time.sleep(0.4); tap(page, '#btnMenu')
        page.wait_for_selector('#ovLevels:not([hidden])'); time.sleep(0.4); shot(page, '05_levels')
        # Eiffel (L7) built by finger
        card(page, 6); page.wait_for_selector('#ovIntro:not([hidden])'); time.sleep(0.3); shot(page, '06_intro_L7')
        tap(page, '#btnIntroGo'); time.sleep(1.2); page.evaluate('__mq.G.turbo = 12')
        P = lambda x, r: (x * L, r * T * L)
        nodes = [((0.5, 1), (0, 0), (1, 0)), ((3.5, 1), (3, 0), (4, 0)), ((1.5, 1), (1, 0), (0.5, 1)), ((2.5, 1), (3, 0), (3.5, 1)),
                 ((1, 2), (0.5, 1), (1.5, 1)), ((2, 2), (1.5, 1), (2.5, 1)), ((3, 2), (2.5, 1), (3.5, 1)),
                 ((1.5, 3), (1, 2), (2, 2)), ((2.5, 3), (2, 2), (3, 2)), ((2, 4), (1.5, 3), (2.5, 3))]
        for n, a, c in nodes:
            drag(page, cdp, P(*a), P(*n)); drag(page, cdp, P(*c), P(*n))
        print('L7 sticks', ev(page, '__mq.G.design.used()'), 'canStart', ev(page, 'JSON.stringify(__mq.G.design.canStart())'))
        time.sleep(0.5); shot(page, '07_L7_built')
        tap(page, '#btnPlay'); time.sleep(3); shot(page, '08_L7_quake')
        page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=180000); page.evaluate("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])', timeout=5000); time.sleep(0.5)
        print('L7:', page.inner_text('#resTitle'), '|', page.inner_text('#resReason'), '|', page.inner_text('#resStats')); shot(page, '09_L7_result')
        # Sagrada (L13): load the reference build through the page, then quake
        tap(page, '#resBtns .ghost'); time.sleep(0.3); tap(page, '#btnMenu'); page.wait_for_selector('#ovLevels:not([hidden])')
        card(page, 12); page.wait_for_selector('#ovIntro:not([hidden])'); tap(page, '#btnIntroGo'); time.sleep(1)
        page.evaluate("(()=>{const m=__mq; m.G.design.clear(); m.REFERENCE[13](m.G.design); m.view.syncDesign(m.G.design); })()")
        time.sleep(0.8); shot(page, '10_L13_built')
        print('L13 sticks', ev(page, '__mq.G.design.used()'), 'canStart', ev(page, 'JSON.stringify(__mq.G.design.canStart())'))
        page.evaluate('__mq.G.turbo = 6')
        tap(page, '#btnPlay'); time.sleep(4); shot(page, '11_L13_quake')
        page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=400000); page.evaluate("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])', timeout=5000); time.sleep(0.5)
        print('L13:', page.inner_text('#resTitle'), '|', page.inner_text('#resReason')); shot(page, '12_L13_result')
        errs = [l for l in logs if 'error' in l.lower() and 'ERR_FAILED' not in l]
        print('console errors:', json.dumps(errs[:10], ensure_ascii=False))
        b.close()

def ev(page, js): return page.evaluate(js)
def shot(page, n): page.screenshot(path=f'{OUT}/{MODE}_{n}.png')
def tap(page, sel): page.locator(sel).tap() if MODE == 'touch' else page.locator(sel).click()
def card(page, i):
    loc = page.locator('.lvcard').nth(i); loc.scroll_into_view_if_needed(); loc.tap() if MODE == 'touch' else loc.click()
def scr(page, w): return page.evaluate(f'__mq.view.worldToScreen({w[0]}, {w[1]})')
def touch(cdp, typ, x, y):
    pts = [] if typ == 'touchEnd' else [{'x': x, 'y': y, 'id': 1, 'radiusX': 8, 'radiusY': 8, 'force': 1}]
    cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': pts})
def drag(page, cdp, a, c):
    s, e = scr(page, a), scr(page, c)
    if MODE == 'touch':
        touch(cdp, 'touchStart', s['x'], s['y'])
        for k in range(1, 7): touch(cdp, 'touchMove', s['x'] + (e['x'] - s['x']) * k / 6, s['y'] + (e['y'] - s['y']) * k / 6); time.sleep(0.02)
        touch(cdp, 'touchEnd', e['x'], e['y'])
    else:
        page.mouse.move(s['x'], s['y']); page.mouse.down()
        for k in range(1, 7): page.mouse.move(s['x'] + (e['x'] - s['x']) * k / 6, s['y'] + (e['y'] - s['y']) * k / 6); time.sleep(0.02)
        page.mouse.up()
    time.sleep(0.12)
main()
