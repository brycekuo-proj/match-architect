"""Ads check (mock mode, ?ads=mock) and the daily check-in: rewarded ads in the shop and on the result slip, interstitial pacing
on "Next Job", the remove-ads purchase; and the plain web build shows none of it."""
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
    page.add_init_script("if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('mq2_coins', '100'); localStorage.setItem('mq_guide_off', 'true'); localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 13, stars: {1: 3}, best: {}})); sessionStorage.setItem('i', 1); }")
    ev = lambda js: page.evaluate(js)
    sh = lambda n: page.screenshot(path=f'{OUT}/{LOC}_{n}.png')
    coins = lambda: ev('__mq.G.coins')
    def watch(timeout=12):   # let the mock ad run to the end, then close it
        page.wait_for_selector('.mockad', timeout=5000); time.sleep(0.3)
        page.wait_for_function("parseFloat(document.querySelector('.mockad .mockad-bar i').style.width) >= 100", timeout=timeout * 1000)
        page.locator('.mockad .mockad-x').tap(); time.sleep(0.4)

    # plain web build: no ads anywhere
    page.goto('file:///home/claude/mq/dist/itch/index.html'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(0.8)
    check(page.is_visible('#btnDaily') and ev('__mq.ads.mode') == 'off', 'web build: ads off, daily check-in on the title')
    c0 = coins(); page.locator('#btnDaily').tap(); page.wait_for_selector('#ciWrap:not([hidden])'); time.sleep(0.4); sh('00_web_checkin')
    check(page.locator('#ciGrid .ci-cell').count() == 30 and page.locator('#ciBtns .adbtn').count() == 0, 'web: 30-day sheet, no ad button')
    page.locator('#ciBtns .primary').tap(); time.sleep(0.6)
    check(coins() == c0 + 10 and page.locator('#ciGrid .ci-cell.done').count() == 1, f'web check-in: +10 and day 1 stamped ({c0} -> {coins()})')
    check(page.locator('#ciBtns .primary').count() == 0, 'web check-in only once a day')
    sh('00b_web_checked'); page.locator('#ciBtns .ghost').tap(); time.sleep(0.3)
    check('done' in page.get_attribute('#btnDaily', 'class'), 'title button marked done for today')
    # day 5: a small item
    ev("localStorage.setItem('mq2_checkin', JSON.stringify({ count: 4, round: 0, last: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })() }))"); page.reload(); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(0.6)
    page.locator('#btnDaily').tap(); page.wait_for_selector('#ciWrap:not([hidden])'); time.sleep(0.3)
    print('next:', page.inner_text('#ciNext'))
    h0 = ev("__mq.shop.count('hint')"); page.locator('#ciBtns .primary').tap()
    page.wait_for_function("document.querySelectorAll('#ciGrid .ci-cell.done').length >= 5", timeout=5000); time.sleep(0.3)
    check(ev("__mq.shop.count('hint')") == h0 + 1 and page.locator('#ciGrid .ci-cell.done').count() == 5, 'day 5 gives a hint ticket')
    print('toast:', page.inner_text('#toast')); sh('00c_day5')
    # day 30: the big prize
    ev("localStorage.setItem('mq2_checkin', JSON.stringify({ count: 29, round: 0, last: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })() }))"); page.reload(); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(0.6)
    page.locator('#btnDaily').tap(); page.wait_for_selector('#ciWrap:not([hidden])'); time.sleep(0.3)
    d0 = ev("__mq.shop.count('damper')"); page.locator('#ciBtns .primary').tap(); time.sleep(0.6)
    check(ev("__mq.shop.count('damper')") == d0 + 1, 'day 30 gives a mass damper'); print('next:', page.inner_text('#ciNext')); sh('00d_day30')
    page.locator('#ciBtns .ghost').tap(); time.sleep(0.2)
    ev("localStorage.removeItem('mq2_checkin')")
    page.locator('#btnShop').tap(); time.sleep(0.4)
    check(page.locator('#shopGrid .adcard').count() == 0, 'web build: no ad offers in the shop')
    page.locator('#btnShopBack').tap(); time.sleep(0.3)

    # mock mode
    page.goto('file:///home/claude/mq/dist/itch/index.html?ads=mock'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(0.8)
    check(ev('__mq.ads.mode') == 'mock' and page.is_visible('#btnDaily'), 'mock mode: daily check-in on the title')
    sh('01_title')
    c0 = coins(); page.locator('#btnDaily').tap(); page.wait_for_selector('#ciWrap:not([hidden])'); time.sleep(0.3); sh('02_checkin_ad')
    page.locator('#ciBtns .adbtn').tap(); time.sleep(1.5); sh('03_mock_rewarded'); watch()
    check(coins() == c0 + 20, f'check-in with an ad: double coins +20 ({c0} -> {coins()})')
    check(page.locator('#ciBtns .primary').count() == 0, 'check-in only once a day')
    page.locator('#ciBtns .ghost').tap(); time.sleep(0.3)
    # shop: ad offers and remove-ads
    page.locator('#btnShop').tap(); time.sleep(0.5)
    check(page.locator('#shopGrid .adcard').count() == 2, 'shop: coins and hint for an ad'); sh('04_shop_ads')
    c0 = coins(); page.locator('#shopGrid .adcard').nth(0).locator('.sbuy').tap(); watch()
    check(coins() == c0 + 20, 'coin ad: +20')
    h0 = ev("__mq.shop.count('hint')")
    page.locator('#shopGrid .adcard').nth(1).locator('.sbuy').tap()
    page.wait_for_selector('.mockad'); time.sleep(1); ev("document.querySelector('.mockad .mockad-x').click()"); time.sleep(0.4)   # JS click: a slow tap could outlast the ad
    check(ev("__mq.shop.count('hint')") == h0, 'closing an ad early gives nothing')
    page.locator('#shopGrid .adcard').nth(1).locator('.sbuy').tap(); watch()
    check(ev("__mq.shop.count('hint')") == h0 + 1, 'hint ad: +1 ticket')
    page.locator('#btnShopBack').tap(); time.sleep(0.3)
    # result: double the pay
    page.locator('#btnLevels').tap(); page.wait_for_selector('#ovLevels:not([hidden])'); page.locator('#levelGrid .lvcard').nth(0).tap()
    page.wait_for_selector('#ovIntro:not([hidden])'); page.locator('#btnIntroGo').tap(); time.sleep(0.8)
    ev('__mq.loadRef(1); __mq.G.turbo = 30'); page.locator('#btnPlay').tap()
    page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=240000); time.sleep(0.4)
    ev("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])'); time.sleep(0.4)
    check(page.is_visible('#resAd .adbtn'), 'result: offer to double the pay'); sh('05_result_double')
    c0 = coins(); page.locator('#resAd .adbtn').tap(); watch()
    reward = (ev('__mq.LEVELS[0].budget') - 3) * 2
    check(coins() == c0 + reward, f'double pay: +{reward}')
    # interstitial: job 1 is too early; job 4 after 3 clears and no recent ads
    page.locator('#resBtns .primary').tap(); time.sleep(0.6)
    check(page.locator('.mockad').count() == 0, 'no interstitial after the first jobs')
    page.evaluate("document.getElementById('btnMenu').click()"); page.wait_for_selector('#ovLevels:not([hidden])'); page.locator('#levelGrid .lvcard').nth(3).tap()
    page.wait_for_selector('#ovIntro:not([hidden])'); page.locator('#btnIntroGo').tap(); time.sleep(0.8)
    ev("__mq.ads.s.clears = 2; __mq.ads.s.lastInter = 0; __mq.ads.s.lastRewarded = Date.now()")
    ev('__mq.loadRef(4); __mq.G.turbo = 30'); page.locator('#btnPlay').tap()
    page.wait_for_selector('#ovReveal:not([hidden]), #ovResult:not([hidden])', timeout=240000); time.sleep(0.4)
    ev("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()"); page.wait_for_selector('#ovResult:not([hidden])'); time.sleep(0.4)
    check(ev('__mq.ads.interstitialDue(4, false)') is False, 'no interstitial right after a rewarded ad')
    ev("__mq.ads.s.lastRewarded = 0")
    check(ev('__mq.ads.interstitialDue(4, false)') is True, 'due after 3 clears and 3 quiet minutes')
    page.locator('#resBtns .primary').tap(); page.wait_for_selector('.mockad', timeout=5000); time.sleep(0.5); sh('06_interstitial'); watch(8)
    check(ev('__mq.G.state') == 'intro' and ev('__mq.G.idx') == 4, 'after the interstitial the next job opens')
    check(ev('__mq.ads.interstitialDue(5, false)') is False, 'counter reset after an interstitial')
    # remove ads
    page.evaluate("document.getElementById('btnMenu').click()"); page.wait_for_selector('#ovLevels:not([hidden])'); page.locator('#btnLevelsBack').tap()
    page.locator('#btnShop').tap(); time.sleep(0.4)
    ev("__mq.setCoins(100)")
    last = page.locator('#shopGrid .sitem').last
    last.locator('.sbuy').tap(); page.wait_for_selector('.mockad'); time.sleep(0.3); sh('07_remove_ads'); page.locator('.mockad .primary').tap(); time.sleep(0.5)
    check(ev('__mq.shop.noAds') and last.locator('.sbuy').is_disabled(), 'remove-ads bought (mock)')
    ev("__mq.ads.s.clears = 9; __mq.ads.s.lastInter = 0; __mq.ads.s.lastRewarded = 0")
    check(ev('__mq.ads.interstitialDue(6, __mq.shop.noAds)') is False, 'no interstitials after remove-ads')
    check(page.locator('#shopGrid .adcard').count() == 2, 'rewarded offers still there after remove-ads')
    check(not errs, f'no errors {errs[:3]}')
    b.close()
print('ALL PASS' if not fails else f'{len(fails)} FAILED')
