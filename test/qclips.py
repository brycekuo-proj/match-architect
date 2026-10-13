"""Frame-exact clips of one building under each quake type (the page clock is driven by hand, 30 fps),
then ffmpeg joins them into one comparison video. argv: level id (default 10), types (comma list)"""
import sys, time, os, subprocess, shutil
from playwright.sync_api import sync_playwright
LV = int(sys.argv[1]) if len(sys.argv) > 1 else 10
TYPES = (sys.argv[2] if len(sys.argv) > 2 else 'sway,jolt,long,after,ps,pulse').split(',')
OUT = '/home/claude/mq/test/clips'
F = 'file:///home/claude/mq/test/fonts/'
FONT_CSS = f"""
@font-face {{ font-family: 'Bungee'; src: url('{F}Bungee-Regular.ttf'); }}
@font-face {{ font-family: 'Huninn'; src: url('{F}Huninn-Regular.ttf'); }}
@font-face {{ font-family: 'Noto Sans TC'; font-weight: 500; src: local('Noto Sans CJK TC Medium'), local('Noto Sans CJK TC'); }}
@font-face {{ font-family: 'Noto Sans TC'; font-weight: 700 900; src: local('Noto Sans CJK TC Bold'), local('Noto Sans CJK TC Black'); }}
"""
FPS, SECS = 30, float(os.environ.get("SECS", "11"))
os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for qt in TYPES:
        fr = f'{OUT}/frames_{qt}'; shutil.rmtree(fr, ignore_errors=True); os.makedirs(fr)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True, locale='zh-TW')
        page = ctx.new_page()
        page.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=FONT_CSS))
        page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
        page.add_init_script("localStorage.clear(); localStorage.setItem('mq2_coins', '500'); localStorage.setItem('mq_guide_off', 'true'); localStorage.setItem('mq_muted', '1'); localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 10, stars: {1: 3}, best: {}}));")
        page.goto(f'file:///home/claude/mq/dist/itch/index.html?quake={qt}'); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000)
        page.evaluate('document.fonts.ready'); time.sleep(0.5)
        page.click('#btnLevels'); page.wait_for_selector('#ovLevels:not([hidden])'); page.click(f'#levelGrid .lvcard:nth-child({LV})'); page.wait_for_selector('#ovIntro:not([hidden])')
        page.click('#btnIntroGo'); time.sleep(0.8); page.evaluate(f'__mq.loadRef({LV})'); time.sleep(0.8)
        # from here on the game only moves when we say so: one __mq.frame per video frame
        page.evaluate('__mq.G.manual = true')
        for _ in range(8): page.evaluate(f'__mq.frame({1 / FPS})')
        page.evaluate("document.getElementById('btnPlay').click()")
        n = int(FPS * SECS)
        for i in range(n):
            page.evaluate(f'__mq.frame({1 / FPS})')
            page.screenshot(path=f'{fr}/{i:04d}.jpg', type='jpeg', quality=88)
        print(qt, 'frames', n, 'state', page.evaluate('__mq.G.sim ? __mq.G.sim.state : "-"'), 't', round(page.evaluate('__mq.G.sim ? __mq.G.sim.t : 0'), 2), flush=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{fr}/%04d.jpg', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', f'{OUT}/{qt}.mp4'], check=True)
        ctx.close()
    b.close()
