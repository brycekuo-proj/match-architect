"""玩法示範 replay: after job 1 is cleared (and the tutorial skipped), its work order offers 「玩法示範」, which starts the
hands-on tutorial again on an empty site; jobs without a tutorial don't show it. python3 test/demo_replay.py"""
import time
from playwright.sync_api import sync_playwright
OUT = '/home/claude/mq/test/shots_demo'; import os; os.makedirs(OUT, exist_ok=True)
fails = []
def check(ok, msg): print(('PASS ' if ok else 'FAIL ') + msg, flush=True); ok or fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True, locale='zh-TW').new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.add_init_script("if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('mq2_coins', '100'); localStorage.setItem('mq_guide_off', 'true'); localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 7, stars: {1: 3, 2: 3}, best: {1: 3, 2: 5}})); sessionStorage.setItem('i', '1'); }")
    ev = lambda js: page.evaluate(js)
    page.goto('file:///home/claude/mq/dist/itch/index.html'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=60000); time.sleep(0.5)
    def open_job(k):
        if not page.is_visible('#ovLevels'): page.click('#btnLevels')
        page.wait_for_selector('#ovLevels:not([hidden])'); page.locator('#levelGrid .lvcard').nth(k).click(); page.wait_for_selector('#ovIntro:not([hidden])'); time.sleep(0.3)
    open_job(0)
    check(page.is_visible('#btnIntroTutorial') and page.inner_text('#btnIntroGo') == '接下委託', 'cleared job 1: "玩法示範" next to "接下委託"')
    page.screenshot(path=f'{OUT}/replay_order.png', timeout=120000)
    page.click('#btnIntroTutorial'); time.sleep(1.5)
    check(ev("__mq.G.guide") and ev("__mq.G.design.used()") == 0 and page.is_hidden('#itemTray'), 'the tutorial starts on an empty site, item tray hidden')
    page.wait_for_selector('#coachTip:not([hidden])', timeout=60000)
    check(page.is_visible('#coachTip'), f'coach tip shows: {page.inner_text("#coachTip .ctext")}')
    page.screenshot(path=f'{OUT}/replay_coach.png', timeout=120000)
    page.evaluate("document.getElementById('btnMenu').click()"); page.wait_for_selector('#ovLevels:not([hidden])'); time.sleep(0.3)
    open_job(2)
    check(page.is_hidden('#btnIntroTutorial'), 'job 3 (no tutorial): no replay button')
    print('errors', errs)
    print('ALL PASS' if not fails and not errs else f'{len(fails)} FAILED')
