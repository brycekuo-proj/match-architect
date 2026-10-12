"""English UI pass: every screen on a phone (en-US browser), plus the language switch."""
import time, sys
from playwright.sync_api import sync_playwright
OUT = '/home/claude/mq/test/shots_en'
VW = sys.argv[1] if len(sys.argv) > 1 else 'phone'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = (b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='en-US') if VW == 'phone'
           else b.new_context(viewport={'width': 1280, 'height': 760}, locale='en-US'))
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and errs.append(m.text))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.add_init_script("if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 13, stars: {1: 3, 2: 2}, best: {1: 3, 2: 6}})); localStorage.setItem('mq2_coins', '300'); sessionStorage.setItem('init', '1'); }")
    page.goto('file:///home/claude/mq/dist/itch/index.html'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(1.5)
    shot = lambda n: page.screenshot(path=f'{OUT}/{VW}_{n}.png')
    print('lang', page.evaluate('document.documentElement.lang'), '| title', page.inner_text('#btnStart'), '|', page.inner_text('.logo'))
    shot('1_title')
    page.click('#btnLevels'); page.wait_for_selector('#ovLevels:not([hidden])'); time.sleep(0.4); shot('2_jobs')
    page.click('#levelGrid .lvcard:nth-child(7)'); page.wait_for_selector('#ovIntro:not([hidden])'); time.sleep(0.4); shot('3_order')
    page.click('#btnIntroGo'); time.sleep(0.8)
    page.evaluate('__mq.loadRef(7)'); time.sleep(0.6); shot('4_build')
    page.click('#btnPlay'); time.sleep(2.5); shot('5_quake')
    page.evaluate('__mq.G.turbo = 12')
    page.wait_for_selector('#ovReveal:not([hidden])', timeout=90000); time.sleep(2); shot('6_reveal')
    page.click('#btnRevealGo'); page.wait_for_selector('#ovResult:not([hidden])'); time.sleep(0.5); shot('7_report')
    # a failure: unbraced square
    page.evaluate('__mq.G.turbo = 0')
    page.evaluate("document.getElementById('btnMenu').click()"); page.wait_for_selector('#ovLevels:not([hidden])'); page.click('#levelGrid .lvcard:nth-child(2)'); page.wait_for_selector('#ovIntro:not([hidden])'); page.click('#btnIntroGo'); time.sleep(0.6)
    page.evaluate("""(() => { const d = __mq.G.design; d.clear(); const s = (a, b, c, e) => d.addSegment(a * 2, b * 2, c * 2, e * 2); s(0,0,1,0); s(0,0,0,1); s(1,0,1,1); s(0,1,1,1); s(1,1,2,1); })()""")
    page.evaluate('__mq.G.design && 0'); time.sleep(0.2)
    page.click('#btnPlay'); time.sleep(0.3)
    page.wait_for_function('__mq.G.sim && __mq.G.sim.state === "lost"', timeout=60000)
    page.wait_for_function('__mq.G.sim.t >= __mq.G.sim.fireT + 0.8', timeout=60000, polling=16); shot('8_burn')
    page.wait_for_selector('#ovResult:not([hidden])', timeout=60000); time.sleep(0.5); shot('9_rejected')
    print('fail text:', page.inner_text('#resTitle'), '|', page.inner_text('#resReason'), '|', page.inner_text('#resCoins').replace('\n', ' '))
    # switch to Chinese and back
    page.evaluate("document.getElementById('btnMenu').click()"); page.click('#btnLevelsBack'); page.wait_for_selector('#ovTitle:not([hidden])'); time.sleep(0.4)
    page.click('#btnLang'); time.sleep(0.4); zh = page.inner_text('#btnStart'); shot('10_title_zh')
    page.click('#btnLang'); time.sleep(0.3); en = page.inner_text('#btnStart')
    print('switch:', zh, '->', en, '| stored', page.evaluate("localStorage.getItem('mq_lang')"))
    # any CJK left on English screens?
    page.click('#btnLevels'); page.wait_for_selector('#ovLevels:not([hidden])')
    import re
    txt = page.evaluate('document.body.innerText')
    left = sorted(set(re.findall(r'[一-鿿]+', txt)))
    print('CJK visible on English jobs screen:', left)
    print('errors', errs)
    b.close()
