"""Shop check: preview / buy / equip skins and scenes, hint tickets from inside a job, the model cabinet."""
import sys, time
from playwright.sync_api import sync_playwright
LOC = sys.argv[1] if len(sys.argv) > 1 else 'zh-TW'
OUT = '/home/claude/mq/test/shots_shop'
fails = []
def check(ok, msg): print(('PASS ' if ok else 'FAIL ') + msg); ok or fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale=LOC)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and errs.append(m.text))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.add_init_script("if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('mq2_coins', '4000'); localStorage.setItem('mq_guide_off', 'true'); localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 13, stars: {1: 3, 4: 2, 7: 3, 10: 1, 13: 2}, best: {}})); sessionStorage.setItem('i', 1); }")
    page.goto('file:///home/claude/mq/dist/itch/index.html'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(1)
    sh = lambda n: page.screenshot(path=f'{OUT}/{LOC}_{n}.png')
    coins = lambda: int(page.inner_text('#coinShop'))
    page.locator('#btnShop').tap(); page.wait_for_selector('#ovShop:not([hidden])'); time.sleep(0.6); sh('00_shop_gear')
    check(page.evaluate("document.querySelector('#ovShop .tab.on').dataset.tab") == 'item', 'shop opens on the items tab')
    check(len(page.query_selector_all('#shopGrid .sitem')) == 7, '7 one-use items listed')
    c0 = coins(); page.locator('#shopGrid .sitem').nth(6).locator('.sbuy').tap(); time.sleep(0.4)
    check(coins() == c0 - 100 and page.evaluate('__mq.shop.tickets') == 1, 'a hint ticket costs 100')
    page.locator('#ovShop .tab[data-tab=skin]').tap(); time.sleep(0.4); sh('01_shop_skins')
    check(len(page.query_selector_all('#shopGrid .sitem')) == 5, '5 match skins listed')
    # preview gold (tap card), then buy it
    page.locator('#shopGrid .sitem').nth(4).tap(); time.sleep(1.2)
    check(page.evaluate('__mq.view.skinId') == 'gold', 'tapping a card previews the skin behind')
    sh('02_preview_gold')
    c0 = coins(); page.locator('#shopGrid .sitem').nth(4).locator('.sbuy').tap(); time.sleep(0.6)
    check(coins() == c0 - 1000, f'gold costs 1000 ({c0} -> {coins()})')
    check('using' in page.get_attribute('#shopGrid .sitem:nth-child(5) .sbuy', 'class'), 'gold now in use')
    for i in (1, 2, 3): page.locator('#shopGrid .sitem').nth(i).locator('.sbuy').tap(); time.sleep(0.4)
    check(coins() == c0 - 1000 - 300 - 400 - 600, 'bamboo, candy, glow bought')
    # scenes
    page.locator('#ovShop .tab[data-tab=scene]').tap(); time.sleep(0.4); sh('03_shop_scenes')
    for i in (1, 2, 3): page.locator('#shopGrid .sitem').nth(i).locator('.sbuy').tap(); time.sleep(1.4)
    check(page.evaluate('__mq.view.sceneId') == 'night', 'night bought and in use')
    sh('04_night_bought')
    # back to title: night + glow look
    page.locator('#ovShop .tab[data-tab=skin]').tap(); time.sleep(0.3)
    page.locator('#shopGrid .sitem').nth(1).locator('.sbuy').tap(); time.sleep(0.4)   # use bamboo, then glow again
    check(page.evaluate('__mq.shop.skin') == 'bamboo', 'switch to an owned skin')
    page.locator('#shopGrid .sitem').nth(3).locator('.sbuy').tap(); time.sleep(0.6)
    page.locator('#btnShopBack').tap(); page.wait_for_selector('#ovTitle:not([hidden])'); time.sleep(1.2); sh('05_title_night_glow')
    check(page.evaluate('__mq.view.skinId') == 'glow' and page.evaluate('__mq.view.sceneId') == 'night', 'equipped look kept on the title')
    # previews in other scenes for the record
    for scene, skin, tag in [('snow', 'candy', '06_snow_candy'), ('desert', 'bamboo', '07_desert_bamboo')]:
        page.locator('#btnShop').tap(); page.wait_for_selector('#ovShop:not([hidden])')
        page.evaluate(f"__mq.shop.equip('scene', '{scene}'); __mq.shop.equip('skin', '{skin}')")
        page.locator('#btnShopBack').tap(); page.wait_for_selector('#ovTitle:not([hidden])'); time.sleep(1.5); sh(tag)
    # a job with the hint ticket bought on the title screen: use it from the tray
    page.evaluate("__mq.shop.equip('scene', 'night'); __mq.shop.equip('skin', 'gold')")
    page.locator('#btnLevels').tap(); page.wait_for_selector('#ovLevels:not([hidden])'); page.locator('#levelGrid .lvcard').nth(6).tap()
    page.wait_for_selector('#ovIntro:not([hidden])'); page.locator('#btnIntroGo').tap(); time.sleep(1)
    check(page.locator('#itemTray .islot[data-id=hint]').inner_text() == '1', 'hint slot shows 1 ticket'); sh('08_tray')
    page.locator('#itemTray .islot[data-id=hint]').tap(); time.sleep(0.3)
    page.locator('#askBtns .primary').tap(); time.sleep(1.2)
    check(page.is_visible('#hintLayer') and page.evaluate("document.querySelectorAll('#hintLayer .h-line').length") == 20, 'hint shows the 20 reference matches of the Eiffel Tower')
    check(page.evaluate('__mq.shop.tickets') == 0 and page.evaluate('__mq.shop.hinted(7)'), 'ticket spent, job 7 hint unlocked')
    sh('09_hint_eiffel_night_gold')
    page.evaluate('__mq.loadRef(7)'); time.sleep(0.8); sh('10_hint_built')
    check(page.evaluate("document.querySelectorAll('#hintLayer .h-line.built').length") == 20, 'built parts of the hint turn solid')
    # cabinet
    page.evaluate("document.getElementById('btnMenu').click()"); page.wait_for_selector('#ovLevels:not([hidden])'); page.locator('#btnLevelsBack').tap()
    page.wait_for_selector('#ovTitle:not([hidden])'); page.locator('#btnCollect').tap(); page.wait_for_selector('#ovCollect:not([hidden])')
    page.wait_for_function("[...document.querySelectorAll('#colGrid img')].every(i => i.src.startsWith('data:'))", timeout=60000); time.sleep(0.4)
    check(len(page.query_selector_all('#colGrid .colitem:not(.locked)')) == 4, '4 cleared jobs in the cabinet (web edition: 10 jobs)')
    print('count:', page.inner_text('#colCount')); sh('11_cabinet')
    page.locator('#colGrid .colitem:not(.locked)').nth(3).tap(); page.wait_for_selector('#ovReveal:not([hidden])'); time.sleep(1.8); sh('12_cabinet_view')
    print('button:', page.inner_text('#btnRevealGo'))
    page.locator('#btnRevealGo').tap(); time.sleep(0.4)
    check(page.is_visible('#ovCollect'), 'back to the cabinet')
    check(not errs, f'no errors {errs[:3]}')
    b.close()
print('ALL PASS' if not fails else f'{len(fails)} FAILED')
