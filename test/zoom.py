"""Zoom check: + / − / fit buttons, two-finger pinch (iPhone touch emulation), pinch→pan hand-off,
a pinch that starts on an anchor must not place a match, placing still works after zooming, wheel + keys on desktop."""
import sys, time, os
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'file:///home/claude/mq/dist/itch/index.html'
OUT = '/home/claude/mq/test/shots_zoom'; os.makedirs(OUT, exist_ok=True)
L = 2.0
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)

def ev(page, js): return page.evaluate(js)
def zoom(page): return round(ev(page, '__mq.view.zoom'), 4)
def touches(cdp, typ, pts):
    cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i, 'radiusX': 4, 'radiusY': 4, 'force': 1} for i, (x, y) in pts]})
def pinch(cdp, cx, cy, d0, d1, steps=12, lift_one_then=None):
    p = lambda d: [(0, (cx - d / 2, cy)), (1, (cx + d / 2, cy))]
    touches(cdp, 'touchStart', p(d0))
    for k in range(1, steps + 1):
        touches(cdp, 'touchMove', p(d0 + (d1 - d0) * k / steps)); time.sleep(0.016)
    if lift_one_then:
        # lift finger 1, keep finger 0 down and drag it
        touches(cdp, 'touchEnd', [(0, (cx - d1 / 2, cy))]) if False else cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [{'x': cx - d1 / 2, 'y': cy, 'id': 0}]})
        x0 = cx - d1 / 2
        for k in range(1, 9):
            touches(cdp, 'touchMove', [(0, (x0 + lift_one_then[0] * k / 8, cy + lift_one_then[1] * k / 8))]); time.sleep(0.016)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    else:
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    time.sleep(0.15)
def scr(page, w): return ev(page, f'__mq.view.worldToScreen({w[0]}, {w[1]})')
def drag1(cdp, s, e):
    touches(cdp, 'touchStart', [(0, (s['x'], s['y']))])
    for k in range(1, 8): touches(cdp, 'touchMove', [(0, (s['x'] + (e['x'] - s['x']) * k / 7, s['y'] + (e['y'] - s['y']) * k / 7))]); time.sleep(0.02)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); time.sleep(0.15)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    # ---------------- phone
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and errs.append(m.text))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.goto(URL); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(1.5)
    page.evaluate("localStorage.clear()")
    page.locator('#btnStart').tap(); page.wait_for_selector('#ovIntro:not([hidden])')
    check(ev(page, "document.getElementById('zoomCtl').hidden"), 'zoom buttons hidden on the work order')
    page.locator('#btnIntroGo').tap(); time.sleep(1.2)
    check(not ev(page, "document.getElementById('zoomCtl').hidden"), 'zoom buttons shown while building')
    bx = page.locator('#zoomCtl').bounding_box(); print('zoomCtl box', bx)
    check(bx['x'] + bx['width'] <= 390 and bx['y'] > 120 and bx['y'] + bx['height'] < 844 - 150, 'zoom buttons sit on the right, clear of HUD and toolbar')
    check(zoom(page) == 1 and ev(page, "document.getElementById('zoomFit').classList.contains('dim')"), 'starts at fitted view, fit button dimmed')
    page.screenshot(path=f'{OUT}/phone_0_build.png')

    page.locator('#zoomIn').tap(); time.sleep(0.8)
    z1 = zoom(page); check(abs(z1 - 1 / 1.3) < 0.01, f'+ zooms in (zoom {z1})')
    check(not ev(page, "document.getElementById('zoomFit').classList.contains('dim')"), 'fit button lights up after zooming')
    page.screenshot(path=f'{OUT}/phone_1_plus.png')
    page.locator('#zoomOut').tap(); page.locator('#zoomOut').tap(); time.sleep(0.8)
    z2 = zoom(page); check(z2 > 1.0, f'− zooms out (zoom {z2})')
    for _ in range(6):
        if ev(page, "document.getElementById('zoomOut').disabled"): break
        page.locator('#zoomOut').tap()
    check(zoom(page) == 1.4 and ev(page, "document.getElementById('zoomOut').disabled"), '− stops at the limit and greys out')
    page.locator('#zoomFit').tap(); time.sleep(0.8)
    check(zoom(page) == 1 and abs(ev(page, '__mq.view.pan.x')) < 1e-6, 'fit button returns to the whole building')

    cdp = ctx.new_cdp_session(page)
    # pinch open in the empty sky
    cx, cy = 235, 330   # right of the item tray on the left
    w_before = ev(page, f'__mq.view.screenToWorld({cx}, {cy})')
    pinch(cdp, cx, cy, 80, 240)
    z3 = zoom(page); check(z3 < 0.45, f'pinch open zooms in (zoom {z3}, expected ~1/3)')
    w_after = ev(page, f'__mq.view.screenToWorld({cx}, {cy})')
    drift = ((w_after['x'] - w_before['x']) ** 2 + (w_after['y'] - w_before['y']) ** 2) ** 0.5
    check(drift < 0.35, f'point between the fingers stays put (drift {drift:.3f} m)')
    page.screenshot(path=f'{OUT}/phone_2_pinch_in.png')
    pinch(cdp, cx, cy, 240, 80)
    z4 = zoom(page); check(0.9 < z4 < 1.1, f'pinch close zooms back out (zoom {z4})')
    check(ev(page, '__mq.G.design.used()') == 0, 'pinching placed no matches')

    # pinch where the first finger lands right on an anchor
    page.locator('#zoomFit').tap(); time.sleep(0.8)
    a = scr(page, (0, 0)); print('anchor screen', a)
    touches(cdp, 'touchStart', [(0, (a['x'], a['y']))])
    touches(cdp, 'touchMove', [(0, (a['x'] + 20, a['y'] - 30))]); time.sleep(0.05)
    touches(cdp, 'touchStart', [(0, (a['x'] + 20, a['y'] - 30)), (1, (a['x'] + 140, a['y'] - 200))])
    for k in range(1, 10):
        touches(cdp, 'touchMove', [(0, (a['x'] + 20 - 8 * k, a['y'] - 30 + 8 * k)), (1, (a['x'] + 140 + 8 * k, a['y'] - 200 - 8 * k))]); time.sleep(0.016)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); time.sleep(0.2)
    check(ev(page, '__mq.G.design.used()') == 0, 'pinch that starts on an anchor places nothing')
    check(ev(page, '__mq.view.ghost == null || !__mq.view.ghost.visible') in (True, None), 'no leftover ghost match')

    # pinch, lift one finger, keep dragging with the other → pans
    page.locator('#zoomFit').tap(); time.sleep(0.8)
    pinch(cdp, cx, cy, 100, 220)
    px0 = ev(page, '__mq.view.pan.x')
    pinch(cdp, cx, cy, 220, 220, steps=2, lift_one_then=(120, 0))
    px1 = ev(page, '__mq.view.pan.x')
    check(px1 < px0 - 0.2, f'after lifting one finger the other keeps panning (pan.x {px0:.2f} → {px1:.2f})')
    check(ev(page, '__mq.G.design.used()') == 0, 'still no matches placed')

    # placing a match still lands on the right spot when zoomed in
    page.locator('#zoomFit').tap(); time.sleep(0.6)
    page.locator('#zoomIn').tap(); page.locator('#zoomIn').tap(); time.sleep(1.2)
    drag1(cdp, scr(page, (0, 0)), scr(page, (L, 0)))
    used = ev(page, '__mq.G.design.used()')
    st = ev(page, 'JSON.stringify(__mq.G.design.sticks.map(s => [__mq.G.design.nodes.find(n=>n.id===s.a), __mq.G.design.nodes.find(n=>n.id===s.b)].map(n => [+n.x.toFixed(2), +n.y.toFixed(2)])))')
    check(used == 1, f'drag from anchor while zoomed in places one match {st}')
    page.screenshot(path=f'{OUT}/phone_3_zoomed_place.png')
    # one-finger pan from empty space
    page.locator('#zoomFit').tap(); time.sleep(0.6)
    page.locator('#zoomIn').tap(); time.sleep(0.6)
    pyb = ev(page, '__mq.view.pan.y')
    drag1(cdp, {'x': 120, 'y': 260}, {'x': 120, 'y': 380})
    check(abs(ev(page, '__mq.view.pan.y') - pyb) > 0.1, 'one finger on empty space pans')
    check(ev(page, '__mq.G.design.used()') == 1, 'panning placed nothing')

    # quake: zoom buttons stay usable
    page.locator('#zoomFit').tap(); time.sleep(0.4)
    ev(page, '__mq.loadRef(1)')
    page.locator('#btnPlay').tap(); time.sleep(1.0)
    check(ev(page, '__mq.G.state') == 'sim' and not ev(page, "document.getElementById('zoomCtl').hidden"), 'zoom buttons available during the quake')
    page.locator('#zoomIn').tap(); time.sleep(0.6)
    check(zoom(page) < 0.9, 'zoom works during the quake')
    page.screenshot(path=f'{OUT}/phone_4_quake_zoom.png')
    ev(page, '__mq.G.turbo = 12')
    page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=60000); page.evaluate("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])', timeout=5000)
    check(ev(page, "document.getElementById('zoomCtl').hidden"), 'zoom buttons hide under the result slip')
    check(not errs, f'no page errors {errs[:3]}')
    ctx.close()

    # ---------------- phone landscape
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page(); page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.goto(URL); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(1)
    page.locator('#btnStart').tap(); page.wait_for_selector('#ovIntro:not([hidden])'); page.locator('#btnIntroGo').tap(); time.sleep(1)
    bx = page.locator('#zoomCtl').bounding_box(); hud = page.locator('#hud').bounding_box(); tb = page.locator('#toolbar .tools').bounding_box()
    print('landscape zoomCtl', bx, 'hud bottom', hud['y'] + hud['height'], 'tools top', tb['y'])
    check(bx['y'] >= hud['y'] + hud['height'] - 2 and bx['y'] + bx['height'] <= tb['y'] + 2, 'landscape: zoom buttons fit between HUD and toolbar')
    page.screenshot(path=f'{OUT}/landscape.png')
    ctx.close()

    # ---------------- desktop: wheel, trackpad pinch (ctrl+wheel), keys
    ctx = b.new_context(viewport={'width': 1280, 'height': 760})
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.goto(URL); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(1)
    page.click('#btnStart'); page.wait_for_selector('#ovIntro:not([hidden])'); page.click('#btnIntroGo'); time.sleep(1)
    page.mouse.move(640, 380); page.mouse.wheel(0, -100); time.sleep(0.2)
    zw = zoom(page); check(0.8 < zw < 0.9, f'one wheel notch zooms in a little (zoom {zw})')
    page.keyboard.down('Control')
    for _ in range(10): page.mouse.wheel(0, -4); time.sleep(0.01)
    page.keyboard.up('Control')
    zt = zoom(page); check(zt < zw - 0.15, f'trackpad pinch (ctrl+wheel) zooms in smoothly (zoom {zt})')
    page.keyboard.press('0'); time.sleep(0.2); check(zoom(page) == 1, 'key 0 fits the building')
    page.keyboard.press('='); time.sleep(0.2); check(zoom(page) < 1, 'key + zooms in')
    page.keyboard.press('-'); page.keyboard.press('-'); time.sleep(0.2); check(zoom(page) > 1, 'key − zooms out')
    page.click('#zoomFit'); time.sleep(0.8)
    page.screenshot(path=f'{OUT}/desktop.png')
    check(not errs, f'no desktop page errors {errs[:3]}')
    b.close()
print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED')
