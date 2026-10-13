"""English UI with the real fonts (local copies): title, jobs, work order, build, check-in, shop, result. argv: tag"""
import sys, time
from playwright.sync_api import sync_playwright
TAG = sys.argv[1] if len(sys.argv) > 1 else 'x'
OUT = '/home/claude/mq/test/shots_bold'
F = 'file:///home/claude/mq/test/fonts/'
FONT_CSS = f"""
@font-face {{ font-family: 'Bungee'; src: url('{F}Bungee-Regular.ttf'); }}
@font-face {{ font-family: 'Huninn'; src: url('{F}Huninn-Regular.ttf'); }}
@font-face {{ font-family: 'Fredoka'; font-weight: 600; src: url('{F}Fredoka-600.woff2'); }}
@font-face {{ font-family: 'Nunito'; font-weight: 800; src: url('{F}Nunito-800.woff2'); }}
@font-face {{ font-family: 'Noto Sans TC'; font-weight: 500; src: local('Noto Sans CJK TC Medium'), local('Noto Sans CJK TC'); }}
@font-face {{ font-family: 'Noto Sans TC'; font-weight: 700 900; src: local('Noto Sans CJK TC Bold'), local('Noto Sans CJK TC Black'); }}
"""
INIT = "if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 13, stars: {1:3,2:3,3:3,4:3,5:2,6:3}, best: {1:3,2:5,3:9}})); localStorage.setItem('mq2_coins', '248'); localStorage.setItem('mq_lang', 'en'); localStorage.setItem('mq_guide_off', 'true'); localStorage.setItem('mq2_shop', JSON.stringify({inv: {damper: 1, iso: 1, spring: 2, cfrp: 5, steel: 1, scanner: 1, hint: 1}})); sessionStorage.setItem('init', '1'); }"
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='en-US')
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=FONT_CSS))
    page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    page.add_init_script(INIT)
    page.goto('file:///home/claude/mq/dist/itch/index.html'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(2)
    page.evaluate('document.fonts.ready'); time.sleep(0.4)
    shot = lambda n: page.screenshot(path=f'{OUT}/{TAG}_{n}.png')
    print(TAG, 'fonts:', page.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).join(', ')"))
    shot('1_title')
    page.click('#btnDaily'); page.wait_for_selector('#ciWrap:not([hidden])'); time.sleep(0.4); shot('2_checkin'); page.click('#ciBtns .ghost'); time.sleep(0.3)
    page.click('#btnShop'); time.sleep(0.5); shot('3_shop'); page.click('#btnShopBack'); time.sleep(0.3)
    page.click('#btnLevels'); page.wait_for_selector('#ovLevels:not([hidden])'); time.sleep(0.4); shot('4_jobs')
    page.click('#levelGrid .lvcard:nth-child(7)'); page.wait_for_selector('#ovIntro:not([hidden])'); time.sleep(0.4); shot('5_order')
    page.click('#btnIntroGo'); time.sleep(0.8); page.evaluate('__mq.loadRef(7)'); time.sleep(0.6); shot('6_build')
    page.evaluate('__mq.G.turbo = 30'); page.click('#btnPlay')
    page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=120000); time.sleep(0.4)
    page.evaluate("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])'); time.sleep(0.6); shot('7_result')
    # overflow check: any text wider than its box on the visible screens
    print('errors', errs[:3])
    b.close()
