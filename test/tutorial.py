"""Tutorial check: follow the coach through job 1 and job 2 by touch, put a match in the wrong place, skip."""
import sys, time, math
from playwright.sync_api import sync_playwright
LOC = sys.argv[1] if len(sys.argv) > 1 else 'zh-TW'
OUT = '/home/claude/mq/test/shots_tut'; L = 2.0; T = math.sqrt(3) / 2; BX = math.sqrt(1 - 0.75 ** 2)
fails = []
def check(ok, msg): print(('PASS ' if ok else 'FAIL ') + msg); ok or fails.append(msg)
def touches(cdp, typ, pts): cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in pts]})
def scr(page, w): return page.evaluate(f'__mq.view.worldToScreen({w[0] * L}, {w[1] * L})')
def drag(page, cdp, a, b):
    s, e = scr(page, a), scr(page, b)
    touches(cdp, 'touchStart', [(0, (s['x'], s['y']))])
    for k in range(1, 9): touches(cdp, 'touchMove', [(0, (s['x'] + (e['x'] - s['x']) * k / 8, s['y'] + (e['y'] - s['y']) * k / 8))]); time.sleep(0.02)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); time.sleep(0.25)
tip = lambda page: page.inner_text('#coachTip .ctext') if page.is_visible('#coachTip') else '(hidden)'
step = lambda page: page.inner_text('#coachTip .cstep') if page.is_visible('#coachTip') else ''
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale=LOC)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and errs.append(m.text))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.add_init_script("if (!sessionStorage.getItem('i')) { localStorage.clear(); sessionStorage.setItem('i', 1); }")
    page.goto('file:///home/claude/mq/dist/itch/index.html'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(1)
    cdp = ctx.new_cdp_session(page)
    sh = lambda n: page.screenshot(path=f'{OUT}/{LOC}_{n}.png')
    page.locator('#btnStart').tap(); page.wait_for_selector('#ovIntro:not([hidden])'); time.sleep(0.4); sh('00_order')
    check(not page.is_visible('#orderRewardBox') and not page.is_visible('#howto'), 'job 1 work order is short (no rewards box, no how-to)')
    print('order button:', page.inner_text('#btnIntroGo'))
    page.locator('#btnIntroGo').tap(); time.sleep(1.2)
    check(page.is_visible('#coachTip') and page.is_visible('#coach'), 'coach shows on job 1')
    print('step', step(page), '|', tip(page)); time.sleep(0.5); sh('01_step1a'); time.sleep(0.7); sh('01_step1b')
    # wrong match first: from the left dot straight up
    drag(page, cdp, (0, 0), (0, 1)); time.sleep(0.3)
    check(page.evaluate("document.getElementById('btnUndo').classList.contains('coach-pulse')"), 'off-plan match -> Undo pulses'); print('  tip:', tip(page)); sh('02_undo')
    page.locator('#btnUndo').tap(); time.sleep(0.4)
    check(page.evaluate('__mq.G.design.used()') == 0, 'undo removes it')
    drag(page, cdp, (0, 0), (1, 0)); time.sleep(0.15); print('after 1:', tip(page)); sh('03_nice')
    time.sleep(1.0); print('step', step(page), '|', tip(page)); sh('04_step2')
    drag(page, cdp, (0, 0), (0.5, T)); time.sleep(1.1); print('step', step(page), '|', tip(page)); sh('05_step3')
    drag(page, cdp, (1, 0), (0.5, T)); time.sleep(1.2); print('step', step(page), '|', tip(page)); sh('06_go')
    check(page.evaluate("document.getElementById('btnPlay').classList.contains('coach-pulse')"), 'Start Quake pulses when the triangle is done')
    page.locator('#btnPlay').tap(); time.sleep(1.5); print('quake:', tip(page)); sh('07_quake')
    page.evaluate('__mq.G.turbo = 10')
    page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=90000); time.sleep(0.5)
    check(not page.is_visible('#coachTip'), 'coach hides on the result'); 
    page.evaluate("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])')
    print('result:', page.inner_text('#resTitle'))
    # job 2
    page.evaluate('__mq.G.turbo = 0')
    page.locator('#resBtns .primary').tap(); page.wait_for_selector('#ovIntro:not([hidden])'); page.locator('#btnIntroGo').tap(); time.sleep(1.2)
    for a, c in [((0, 0), (1, 0)), ((0, 0), (0, 1)), ((1, 0), (1, 1)), ((0, 1), (1, 1))]:
        print('step', step(page), '|', tip(page)); drag(page, cdp, a, c); time.sleep(1.1)
    print('step', step(page), '|', tip(page)); time.sleep(0.6); sh('08_brace')
    drag(page, cdp, (0, 0.25), (BX, 1)); time.sleep(1.2); print('step', step(page), '|', tip(page)); sh('09_go2')
    check(page.evaluate('__mq.G.design.sticks.some(s => __mq.G.design.node(s.a).kind === "glue" || __mq.G.design.node(s.b).kind === "glue")'), 'brace glued on by following the guide')
    page.locator('#btnPlay').tap(); page.evaluate('__mq.G.turbo = 10')
    page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=90000)
    page.evaluate("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])')
    print('job 2 result:', page.inner_text('#resTitle'))
    check('過' in page.inner_text('#resTitle') or 'passed' in page.inner_text('#resTitle').lower(), 'job 2 passes with the guided build')
    # job 3: no guide
    page.evaluate('__mq.G.turbo = 0')
    page.locator('#resBtns .primary').tap(); page.wait_for_selector('#ovIntro:not([hidden])'); page.locator('#btnIntroGo').tap(); time.sleep(0.8)
    check(not page.is_visible('#coachTip'), 'no coach on job 3')
    # replay job 1 after clearing: no guide; then reset progress and test Skip
    page.evaluate("localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 1, stars: {}, best: {}})); location.reload()")
    page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(1)
    page.locator('#btnStart').tap(); page.wait_for_selector('#ovIntro:not([hidden])')
    page.evaluate("document.querySelector('#ovLevels') && 0"); page.locator('#btnIntroGo').tap(); time.sleep(1)
    page.locator('#btnSkipCoach').tap(); time.sleep(0.4)
    check(not page.is_visible('#coachTip'), 'Skip hides the coach'); 
    check(page.evaluate("localStorage.getItem('mq_guide_off')") == 'true', 'skip is remembered')
    check(not errs, f'no errors {errs[:3]}')
    b.close()
print('ALL PASS' if not fails else f'{len(fails)} FAILED')
