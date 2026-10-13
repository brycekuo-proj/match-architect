"""防震道具 check: buy one-use items in the shop (title screen only), use them from the tray in a job (spring damper,
carbon wrap, mass damper, steel, bearings, scanner), start/stop refunds, consumption, the shortage dialog, pruning, results."""
import sys, time
from playwright.sync_api import sync_playwright
LOC = sys.argv[1] if len(sys.argv) > 1 else 'zh-TW'
OUT = '/home/claude/mq/test/shots_items'
L = 2.0
fails = []
def check(ok, msg): print(('PASS ' if ok else 'FAIL ') + msg); ok or fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale=LOC)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and errs.append(m.text))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.add_init_script("if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('mq2_coins', '5000'); localStorage.setItem('mq_guide_off', 'true'); localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 13, stars: {1: 3}, best: {}})); sessionStorage.setItem('i', 1); }")
    page.goto('file:///home/claude/mq/dist/itch/index.html'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(1)
    sh = lambda n: page.screenshot(path=f'{OUT}/{LOC}_{n}.png')
    coins = lambda: int(page.inner_text('#coinShop'))
    ev = lambda js: page.evaluate(js)
    cdp = ctx.new_cdp_session(page)
    def scr(w): return ev(f'__mq.view.worldToScreen({w[0]}, {w[1]})')
    def touch(t, x, y): cdp.send('Input.dispatchTouchEvent', {'type': t, 'touchPoints': [] if t == 'touchEnd' else [{'x': x, 'y': y, 'id': 1}]})
    def tap(w):
        s = scr(w); touch('touchStart', s['x'], s['y']); time.sleep(0.03); touch('touchEnd', s['x'], s['y']); time.sleep(0.15)
    def drag(a, c):
        s, e = scr(a), scr(c); touch('touchStart', s['x'], s['y'])
        for k in range(1, 7): touch('touchMove', s['x'] + (e['x'] - s['x']) * k / 6, s['y'] + (e['y'] - s['y']) * k / 6); time.sleep(0.02)
        touch('touchEnd', e['x'], e['y']); time.sleep(0.12)

    # ---- shop (title screen only): every item is one-use stock
    page.locator('#btnShop').tap(); page.wait_for_selector('#ovShop:not([hidden])'); time.sleep(0.5)
    check(page.evaluate("document.querySelector('#ovShop .tab.on').dataset.tab") == 'item', 'shop opens on the items tab')
    card = lambda i: page.locator('#shopGrid .sitem').nth(i)
    c0 = coins()
    for i in (0, 1, 2, 2, 3, 3, 4, 5): card(i).locator('.sbuy').tap(); time.sleep(0.25)
    check(coins() == c0 - 1200 - 1000 - 600 - 400 - 150 - 500, f'damper 1200, bearings 1000, 2 springs 600, 10 wraps 400, steel 150, scanner 500 ({c0} -> {coins()})')
    stock = lambda: ev("Object.fromEntries(['damper','iso','spring','cfrp','steel','scanner','hint'].map(k => [k, __mq.shop.count(k)]))")
    check(stock() == {'damper': 1, 'iso': 1, 'spring': 2, 'cfrp': 10, 'steel': 1, 'scanner': 1, 'hint': 0}, f'stock {stock()}')
    check(not card(0).locator('.sbuy').is_disabled(), 'damper can be bought again (one-use)')
    sh('01_shop_items')
    page.locator('#btnShopBack').tap(); page.wait_for_selector('#ovTitle:not([hidden])')

    # ---- job 2: an unbraced square (it falls on its own)
    page.locator('#btnLevels').tap(); page.wait_for_selector('#ovLevels:not([hidden])'); page.locator('#levelGrid .lvcard').nth(1).tap()
    page.wait_for_selector('#ovIntro:not([hidden])'); page.locator('#btnIntroGo').tap(); time.sleep(1)
    check(page.is_visible('#itemTray') and page.locator('#itemTray .islot').count() == 7, 'item tray with 7 slots beside the build')
    slot = lambda id: page.locator(f'#itemTray .islot[data-id={id}]')
    ev("__mq.G.design.clear(); __mq.itemsChanged()")
    drag((0, 0), (L, 0)); drag((0, 0), (0, L)); drag((L, 0), (L, L)); drag((0, L), (L, L))
    check(ev('__mq.G.design.used()') == 4, 'square built')
    sh('02_tray')
    # spring damper across the square
    slot('spring').tap(); time.sleep(0.3)
    check(page.is_visible('#placeBar') and ev('__mq.G.tool') == 'strut', 'placing mode for spring dampers')
    tap((0, 0)); tap((L, 0)); time.sleep(0.2)
    check(ev('__mq.G.load.struts.length') == 0, 'refuses a damper along an existing match')
    check(ev('__mq.G.strutA') is not None, 'first joint stays picked after a refused second one')
    sh('03_strut_pick'); tap((L, L)); time.sleep(0.3)
    check(ev('__mq.G.load.struts.length') == 1, 'spring damper fitted between two joints')
    page.locator('#btnPlaceDone').tap(); time.sleep(0.2)
    # carbon wrap on the posts
    slot('cfrp').tap(); time.sleep(0.2)
    tap((0, L / 2)); tap((L, L / 2))
    check(ev('__mq.G.load.wraps.length') == 2, 'two posts wrapped in carbon')
    tap((L, L / 2))
    check(ev('__mq.G.load.wraps.length') == 1, 'tap again unwraps')
    # mass damper at the top-left joint (switching slots leaves the old mode)
    slot('damper').tap(); time.sleep(0.2)
    check(ev('__mq.G.tool') == 'damper', 'damper slot switches the placing mode')
    tap((0, 0)); check(ev('__mq.G.load.damper') is None, 'damper can not hang on an anchor')
    tap((0, L)); check(ev('__mq.G.load.damper') is not None, 'damper hung on a joint')
    slot('damper').tap(); time.sleep(0.2)
    check(ev('__mq.G.tool') == 'match', 'tapping the lit slot again ends placing')
    # steel and bearings are toggles
    slot('iso').tap(); time.sleep(0.2); slot('steel').tap(); time.sleep(0.6)
    check(ev('__mq.G.load.iso && __mq.G.load.steel'), 'bearings and steel switched on')
    check(page.locator('#itemTray .islot.on').count() == 5, f"5 slots lit ({page.locator('#itemTray .islot.on').count()})")
    sh('04_build_with_items')
    # scanner: one per scan
    slot('scanner').tap()
    page.wait_for_selector('#btnScanClose:not([hidden])', timeout=90000); time.sleep(0.4)
    print('scan:', page.inner_text('#scanText'))
    check('good' in page.get_attribute('#scanBar', 'class'), 'scan forecasts the braced square survives')
    check(ev("__mq.shop.count('scanner')") == 0, 'the scan used the scanner')
    check(ev("document.querySelectorAll('#scanLayer .sc-dot').length") >= 4, 'joints marked by load')
    sh('05_scan')
    # start, then stop: everything comes back
    page.locator('#btnPlay').tap(); time.sleep(0.5)
    check(stock() == {'damper': 0, 'iso': 0, 'spring': 1, 'cfrp': 9, 'steel': 0, 'scanner': 0, 'hint': 0}, f'quake start uses each fitted item ({stock()})')
    check(page.is_hidden('#scanLayer'), 'scan markers cleared when the quake starts')
    check('dim' in page.get_attribute('#itemTray', 'class'), 'tray locked during the quake')
    time.sleep(1.5); sh('06_quake_items')
    page.locator('#btnPlay').tap(); time.sleep(0.4)
    check(stock() == {'damper': 1, 'iso': 1, 'spring': 2, 'cfrp': 10, 'steel': 1, 'scanner': 0, 'hint': 0}, 'stopping early returns them')
    # full run
    ev('__mq.G.turbo = 30'); page.locator('#btnPlay').tap()
    page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=240000); time.sleep(0.4)
    ev("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])', timeout=5000)
    time.sleep(0.5)
    print('result:', page.inner_text('#resTitle'), '|', page.inner_text('#resStats').replace('\n', ' '))
    check(ev("__mq.G.sim && __mq.G.sim.state") == 'won', 'braced square with items passes')
    check(page.is_visible('#resStats .resitems'), 'result lists the items (not ranked)')
    check(stock() == {'damper': 0, 'iso': 0, 'spring': 1, 'cfrp': 9, 'steel': 0, 'scanner': 0, 'hint': 0}, 'used up after a full quake')
    sh('07_result')
    page.locator('#resBtns .ghost').tap(); time.sleep(0.8); ev('__mq.G.turbo = 0')
    check(page.locator('#itemTray .islot.short').count() == 3, 'damper, bearings and steel still fitted but out of stock')
    sh('08_tray_short')
    # retry with nothing restocked: the start asks, with no way to shop from here
    page.locator('#btnPlay').tap(); time.sleep(0.4)
    check(page.is_visible('#ask'), 'out of stock -> asks before starting'); sh('09_short')
    print('ask:', page.inner_text('#askText'), '|', page.inner_text('#askBtns').replace('\n', ' / '))
    check(page.locator('#askBtns .btn').count() == 2, 'only "remove and start" or cancel')
    page.locator('#askBtns .primary').tap(); time.sleep(0.6)
    check(ev('__mq.G.state') == 'sim' and not ev('__mq.G.load.steel') and not ev('__mq.G.load.iso') and ev('__mq.G.load.damper') is None and ev('__mq.G.load.struts.length') == 1,
          'drops what is out of stock, keeps the spring damper and wrap')
    page.locator('#btnPlay').tap(); time.sleep(0.5)
    # an empty slot can't be bought from inside the job
    slot('steel').tap(); time.sleep(0.3)
    print('toast:', page.inner_text('#toast'))
    check(ev('__mq.G.state') == 'build' and not ev('__mq.G.load.steel'), 'empty slot just says it is used up (no shop inside a job)')
    # deleting a wrapped match drops its wrap
    page.locator('#toolDelete').tap(); time.sleep(0.2); tap((0, L / 2)); time.sleep(0.3)
    check(ev('__mq.G.load.wraps.length') == 0, 'wrap pruned with its match')
    page.locator('#toolMatch').tap()
    # loadout is kept per job
    page.evaluate("document.getElementById('btnMenu').click()"); page.wait_for_selector('#ovLevels:not([hidden])')
    page.locator('#levelGrid .lvcard').nth(1).tap(); page.wait_for_selector('#ovIntro:not([hidden])'); page.locator('#btnIntroGo').tap(); time.sleep(0.8)
    check(ev('__mq.G.load.struts.length') == 1, 'items remembered for the job')
    check(not errs, f'no errors {errs[:3]}')
    b.close()
print('ALL PASS' if not fails else f'{len(fails)} FAILED')
