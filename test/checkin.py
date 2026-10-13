"""每日簽到 (web build): check in, day-5 item, 補簽 for coins, a gap too long to make up (restart), day 30, clock rolled back."""
import sys, time
from playwright.sync_api import sync_playwright
LOC = sys.argv[1] if len(sys.argv) > 1 else 'zh-TW'
OUT = '/home/claude/mq/test/shots_ads'
fails = []
def check(ok, msg): print(('PASS ' if ok else 'FAIL ') + msg); ok or fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale=LOC)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and errs.append(m.text))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.add_init_script("if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('mq2_coins', '200'); localStorage.setItem('mq_guide_off', 'true'); sessionStorage.setItem('i', 1); }")
    ev = lambda js: page.evaluate(js)
    sh = lambda n: page.screenshot(path=f'{OUT}/{LOC}_ci_{n}.png')
    coins = lambda: ev('__mq.G.coins')
    URL = 'file:///home/claude/mq/dist/itch/index.html'
    page.goto(URL); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(0.6)
    # local date k days from today, like the game computes it
    DAY = "(k => { const d = new Date(); d.setDate(d.getDate() + k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })"
    def state(count, last_k, made=None, rnd=0):
        ev(f"localStorage.setItem('mq2_checkin', JSON.stringify({{ count: {count}, round: {rnd}, last: {DAY}({last_k}), made: {made or []} }}))")
        page.reload(); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(0.5)
    def open_ci():
        page.locator('#btnDaily').tap(); page.wait_for_selector('#ciWrap:not([hidden])'); time.sleep(0.3)
    # plain check-in
    open_ci(); sh('1_fresh')
    check(page.locator('#ciGrid .ci-cell').count() == 30 and page.is_hidden('#ciWarn'), '30-day sheet, nothing missed')
    c0 = coins(); page.locator('#ciBtns .primary').tap(); time.sleep(0.6)
    check(coins() == c0 + 10 and page.locator('#ciGrid .ci-cell.done').count() == 1, f'check-in +10, day 1 stamped ({c0} -> {coins()})')
    check(page.locator('#ciBtns .primary').count() == 0, 'once a day'); sh('2_checked')
    # day 5 item
    state(4, -1); open_ci(); print('  next:', page.inner_text('#ciNext'))
    h0 = ev("__mq.shop.count('hint')"); page.locator('#ciBtns .primary').tap(); time.sleep(0.6)
    check(ev("__mq.shop.count('hint')") == h0 + 1, 'day 5 gives a hint ticket'); print('  toast:', page.inner_text('#toast'))
    # missed 2 days: make up for coins
    state(6, -3); open_ci(); sh('3_missed')
    print('  warn:', page.inner_text('#ciWarn'), '|', page.inner_text('#ciBtns').replace('\n', ' / '))
    check(page.is_visible('#ciWarn') and page.locator('#ciGrid .ci-cell.missed').count() == 2, 'two missed days shown')
    c0 = coins(); page.locator('#ciBtns .primary').tap(); time.sleep(0.6)
    check(coins() == c0 - 60 and page.locator('#ciGrid .ci-cell.made').count() == 2, f'make-up: −60 coins, days 7–8 stamped 補 ({c0} -> {coins()})')
    c1 = coins(); page.locator('#ciBtns .primary').tap(); time.sleep(0.6)
    check(coins() == c1 + 10 and page.locator('#ciGrid .ci-cell.done').count() == 9, 'then today is day 9 (+10)'); sh('4_made_up')
    # not enough coins for the make-up
    state(6, -3); ev('__mq.setCoins(20)'); open_ci(); page.locator('#ciBtns .primary').tap(); time.sleep(0.4)
    check(coins() == 20 and ev('__mq.checkin.missed') == 2, 'make-up refused without enough coins'); print('  toast:', page.inner_text('#toast'))
    page.locator('#ciBtns .ghost').last.tap(); time.sleep(0.2); ev('__mq.setCoins(200)')
    # a gap too long: restart only
    state(12, -10); open_ci(); sh('5_too_long'); print('  warn:', page.inner_text('#ciWarn'))
    check(page.locator('#ciBtns .btn').count() == 2, 'only "start again" and close')
    page.locator('#ciBtns .primary').tap(); time.sleep(0.3); check(page.is_visible('#ask'), 'asks before dropping the streak')
    page.locator('#askBtns .primary').tap(); time.sleep(0.5)
    check(ev('__mq.checkin.count') == 0 and page.is_visible('#ciWrap'), 'streak restarted, sheet back')
    page.locator('#ciBtns .primary').tap(); time.sleep(0.5)
    check(ev('__mq.checkin.count') == 1, 'today is day 1 again')
    # day 30: the big prize
    state(29, -1); open_ci(); d0 = ev("__mq.shop.count('damper')"); page.locator('#ciBtns .primary').tap(); time.sleep(0.6)
    check(ev("__mq.shop.count('damper')") == d0 + 1, 'day 30 gives a mass damper'); print('  next:', page.inner_text('#ciNext')); sh('6_day30')
    # clock rolled back
    state(5, 2); open_ci(); print('  warn:', page.inner_text('#ciWarn'))
    check(page.locator('#ciBtns .btn').count() == 1, 'clock set back: no check-in button')
    check(not errs, f'no errors {errs[:3]}')
    b.close()
print('ALL PASS' if not fails else f'{len(fails)} FAILED')
