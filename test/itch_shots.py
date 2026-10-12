"""itch.io page images with the real fonts: English screenshots (desktop 1280x720 + phone) and the cover."""
import time, pathlib
from playwright.sync_api import sync_playwright
OUT = '/home/claude/mq/test/itch'
F = 'file:///home/claude/mq/test/fonts/'
FONT_CSS = f"""
@font-face {{ font-family: 'Bungee'; src: url('{F}Bungee-Regular.ttf'); }}
@font-face {{ font-family: 'Huninn'; src: url('{F}Huninn-Regular.ttf'); }}
@font-face {{ font-family: 'Noto Sans TC'; font-weight: 500; src: local('Noto Sans CJK TC Medium'), local('Noto Sans CJK TC'); }}
@font-face {{ font-family: 'Noto Sans TC'; font-weight: 700 900; src: local('Noto Sans CJK TC Bold'), local('Noto Sans CJK TC Black'); }}
"""
def fonts(page):
    page.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=FONT_CSS))
    page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
URL = 'file:///home/claude/mq/dist/itch/index.html'
INIT = "if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 13, stars: {1:3,2:3,3:3,4:3,5:2,6:3}, best: {1:3,2:5,3:9}})); localStorage.setItem('mq2_coins', '248'); localStorage.setItem('mq_lang', 'en'); sessionStorage.setItem('init', '1'); }"
def open_level(page, n):
    page.evaluate("document.getElementById('btnMenu').click()") if page.is_visible('#hud') else page.click('#btnLevels')
    page.wait_for_selector('#ovLevels:not([hidden])'); page.click(f'#levelGrid .lvcard:nth-child({n})'); page.wait_for_selector('#ovIntro:not([hidden])')

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for vw in ['desk', 'phone']:
        ctx = (b.new_context(viewport={'width': 1280, 'height': 720}, locale='en-US') if vw == 'desk'
               else b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='en-US'))
        page = ctx.new_page(); fonts(page); page.add_init_script(INIT)
        page.goto(URL); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(2.5)
        page.evaluate('document.fonts.ready'); time.sleep(0.5)
        shot = lambda n: page.screenshot(path=f'{OUT}/{vw}_{n}.png')
        shot('1_title')
        open_level(page, 7); time.sleep(0.5); shot('2_order')
        page.click('#btnIntroGo'); time.sleep(0.8); page.evaluate('__mq.loadRef(7)'); time.sleep(1); shot('3_build')
        # Sagrada under a level 7 quake, stress colours on
        open_level(page, 13); page.click('#btnIntroGo'); time.sleep(0.8); page.evaluate('__mq.loadRef(13)'); time.sleep(0.5)
        page.click('#btnPlay'); page.wait_for_function('__mq.G.sim && __mq.G.sim.t > 3.4', timeout=90000, polling=16); shot('4_quake')
        page.evaluate("document.getElementById('btnPlay').click()"); time.sleep(0.5)
        # Tokyo Tower overloaded: it catches fire and comes down
        open_level(page, 8); page.click('#btnIntroGo'); time.sleep(0.8)
        page.evaluate('__mq.loadRef(8); __mq.LEVELS[7].quake = { A: 0.6, f: 1.6 }'); time.sleep(0.3)
        page.click('#btnPlay'); page.wait_for_function('__mq.G.sim && __mq.G.sim.state === "lost"', timeout=60000)
        page.wait_for_function('__mq.G.sim.t >= __mq.G.sim.fireT + 0.55', timeout=60000, polling=16); shot('5_fire')
        page.wait_for_selector('#ovResult:not([hidden])', timeout=60000); time.sleep(0.4)
        # finished model
        page.evaluate('__mq.reveal(13)'); time.sleep(2.5); shot('6_model')
        page.evaluate('__mq.reveal(10)'); time.sleep(2.5); shot('7_model101')
        ctx.close()
    # cover: Blender render + the game's matchbox-label logo
    page = b.new_page(viewport={'width': 630, 'height': 500}, device_scale_factor=2); fonts(page)
    bg = pathlib.Path('/home/claude/mq/assets/cover_1260x1000.png').as_uri()
    page.set_content(f"""<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/x"><style>
      html,body {{ margin:0; width:630px; height:500px; overflow:hidden; }}
      body {{ background: url('{bg}') center/cover; position: relative; font-family: 'Huninn', sans-serif; }}
      .plate {{ position:absolute; left:28px; top:30px; background:#d9392b; border:4px solid #2a1a12; border-radius:22px;
        box-shadow: 0 9px 0 #2a1a12, inset 0 0 0 6px #f7c548; padding:18px 26px 14px; transform: rotate(-3deg); }}
      .plate h1 {{ margin:0; font: 400 58px/0.98 'Huninn'; color:#fff7e8; letter-spacing:.03em; text-shadow: 0 4px 0 #2a1a12; }}
      .plate span {{ display:block; margin-top:8px; font: 400 21px/1 'Huninn'; color:#f7c548; letter-spacing:.3em; text-shadow: 0 2px 0 #2a1a12; }}
      .tag {{ position:absolute; right:22px; bottom:26px; background:#f7c548; border:3px solid #2a1a12; border-radius:14px; padding:8px 14px;
        box-shadow: 0 5px 0 #2a1a12; transform: rotate(2deg); font: 400 19px/1.25 'Huninn'; color:#2a1a12; text-align:center; }}
      .tag b {{ font: 400 15px/1 'Bungee'; display:block; color:#a8241a; margin-bottom:3px; letter-spacing:.04em; }}
    </style></head><body>
      <div class="plate"><h1>Match<br>Architect</h1><span>火柴建築師</span></div>
      <div class="tag"><b>SURVIVE THE QUAKE</b>Build landmarks from matches</div>
    </body></html>""")
    page.evaluate('document.fonts.ready'); time.sleep(1)
    page.screenshot(path=f'{OUT}/cover_1260x1000.png')
    b.close()
print('done')
