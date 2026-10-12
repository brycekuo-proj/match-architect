"""Visual check of the collapse + fire: force a failure with an oversized quake and grab frames."""
import sys, time, os
from playwright.sync_api import sync_playwright
URL = 'file:///home/claude/mq/dist/itch/index.html'
OUT = '/home/claude/mq/test/shots_burn'; os.makedirs(OUT, exist_ok=True)
LV = int(sys.argv[1]) if len(sys.argv) > 1 else 8
A = float(sys.argv[2]) if len(sys.argv) > 2 else 0.6
VW = sys.argv[3] if len(sys.argv) > 3 else 'phone'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True) if VW == 'phone' else b.new_context(viewport={'width': 1280, 'height': 760})
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.add_init_script("localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 13, stars: {}, best: {}})); localStorage.setItem('mq2_coins', '900');")
    page.goto(URL); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(1)
    page.click('#btnLevels'); page.wait_for_selector('#ovLevels:not([hidden])')
    page.click(f'#levelGrid .lvcard:nth-child({LV})'); page.wait_for_selector('#ovIntro:not([hidden])'); page.click('#btnIntroGo'); time.sleep(0.8)
    page.evaluate(f'__mq.loadRef({LV}); __mq.LEVELS[{LV - 1}].quake = {{ A: {A}, f: 1.6 }}')
    page.click('#btnPlay')
    page.wait_for_function('__mq.G.sim && __mq.G.sim.state === "lost"', timeout=20000)
    for k, at in enumerate([0.15, 0.6, 1.2, 1.9, 2.6, 3.1]):
        page.wait_for_function(f'__mq.G.sim.t >= __mq.G.sim.fireT + {at}', timeout=60000, polling=16)
        page.screenshot(path=f'{OUT}/{VW}_L{LV}_{k}.png')
        print(f'+{at}s burning={page.evaluate("__mq.G.sim.burning()")} onfire={page.evaluate("__mq.G.sim.burn.size")}/{page.evaluate("__mq.G.sim.bodies.size")} fronts={page.evaluate("__mq.view.fireCount")} smoke={page.evaluate("__mq.view.smokeP.length")} sparks={page.evaluate("__mq.view.emberP.length")}')
    page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=10000); page.evaluate("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])', timeout=5000); time.sleep(0.6)
    page.screenshot(path=f'{OUT}/{VW}_L{LV}_result.png')
    print('result', page.inner_text('#resTitle'), '|', page.inner_text('#resReason'), '| fps-ish', page.evaluate('__mq.view.time'))
    print('errors', errs)
    b.close()
