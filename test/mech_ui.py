"""Full edition, new mechanics on screen: chapter headers in the job list, heavy stars, soft ground sinking, supplied items,
mixed-quake banner. Jobs are patched at runtime (job 11 / 15 / 18), so this runs with any chapter content.
python3 test/mech_ui.py [path/to/dist/app/index.html]"""
import sys, time
from playwright.sync_api import sync_playwright
APP = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/mq/dist/app/index.html'
OUT = '/home/claude/mq/test/shots_mech'
fails = []
def check(ok, msg): print(('PASS ' if ok else 'FAIL ') + msg, flush=True); ok or fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='zh-TW')
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and errs.append(m.text))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.add_init_script("if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('mq2_coins', '500'); localStorage.setItem('mq_guide_off', 'true'); localStorage.setItem('mq2_progress', JSON.stringify({unlocked: 100, stars: {}, best: {}})); sessionStorage.setItem('i', 1); }")
    ev = lambda js: page.evaluate(js)
    sh = lambda n: page.screenshot(path=f'{OUT}/{n}.png', timeout=120000)   # software rendering in CI is slow
    page.goto('file://' + APP); page.wait_for_selector('#ovTitle:not([hidden])', timeout=30000); time.sleep(0.6)
    n = ev('__mq.LEVELS.length'); print('jobs in this build:', n, ev("__mq.LEVELS.map(l => l.id).join(',')"))
    page.click('#btnLevels'); page.wait_for_selector('#ovLevels:not([hidden])'); time.sleep(0.6)
    heads = page.locator('#levelGrid .lvchap').all_inner_texts(); print('chapters:', heads)
    check(len(heads) >= 2 and '第 2 章' in heads[1], 'job list has chapter headers')
    sh('01_jobs')
    page.click('#btnLevelsBack'); time.sleep(0.3)
    idx = lambda jid: ev(f'__mq.LEVELS.findIndex(l => l.id === {jid})')
    def open_job(jid):
        page.evaluate("document.getElementById('btnMenu').click()") if page.is_visible('#hud') else page.click('#btnLevels')
        page.wait_for_selector('#ovLevels:not([hidden])')
        page.locator('#levelGrid .lvcard').nth(idx(jid)).click(); page.wait_for_selector('#ovIntro:not([hidden])'); time.sleep(0.3)
    # the quake is stepped by hand (frame-exact, no waiting on slow software rendering): physics in chunks, one drawn frame each
    def play(until=None):
        ev('__mq.G.manual = true'); page.click('#btnPlay')
        stop = f'__mq.G.sim.t >= {until}' if until else "__mq.G.sim.state !== 'running'"
        for _ in range(400):
            if ev(stop): break
            ev("(() => { const s = __mq.G.sim; for (let n = 0; n < 15 && s.state === 'running'; n++) s.step(1 / 60); })()"); ev('__mq.frame(1 / 30)')
        if until: return
        for _ in range(12):
            ev("(() => { const s = __mq.G.sim; for (let n = 0; n < 20; n++) s.step(1 / 60); })()"); ev('__mq.frame(1 / 30)')
        ev('__mq.G.manual = false'); time.sleep(0.3)
    # 1) heavy stars: tank on the tent, then bell / sign / hoop on the swing, garden / tank on the pavilion
    i11 = idx(11)
    ev(f"__mq.LEVELS[{i11}].loads = [{{ star: 0, kg: 2, kind: 'tank' }}]")
    open_job(11); print('order:', page.inner_text('#orderReq').replace('\n', ' | '))
    check('水塔' in page.inner_text('#orderReq'), 'work order lists the heavy water tank')
    page.click('#btnIntroGo'); time.sleep(0.5); ev('__mq.loadRef(11)'); time.sleep(0.4); sh('02_tank_build')
    play(); r = ev('[__mq.G.sim.state, __mq.G.sim.loads.length, __mq.G.sim.t]'); print('tank run', r)
    check(r[1] == 1, 'the tank is in the physics run'); time.sleep(0.5)
    ev("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()")
    i15, i18 = idx(15), idx(18)
    ev(f"__mq.LEVELS[{i15}].loads = [{{ star: 0, kg: 1, kind: 'bell' }}, {{ star: 1, kg: 1, kind: 'sign' }}, {{ star: 2, kg: 1, kind: 'hoop' }}]")
    open_job(15); page.click('#btnIntroGo'); time.sleep(0.6); ev('__mq.loadRef(15)'); time.sleep(0.5); sh('03_bell_sign_hoop')
    ev(f"__mq.LEVELS[{i18}].loads = [{{ star: 0, kg: 2, kind: 'garden' }}, {{ star: 2, kg: 1, kind: 'tank' }}]")
    open_job(18); page.click('#btnIntroGo'); time.sleep(0.6); ev('__mq.loadRef(18)'); time.sleep(0.5); sh('04_garden_tank')
    # 2) soft ground: the tent's right anchor in weak mud sinks
    ev(f"__mq.LEVELS[{i11}].loads = []; __mq.LEVELS[{i11}].soft = [[1.5, 2.5]]; __mq.LEVELS[{i11}].softCap = 4")
    open_job(11); check('軟地基' in page.inner_text('#orderReq'), 'work order explains the soft ground')
    page.click('#btnIntroGo'); time.sleep(0.5); ev('__mq.loadRef(11)'); time.sleep(0.4); sh('05_mud_build')
    play(until=2.2); time.sleep(0.2); sh('06_mud_sinking')
    sink = ev('__mq.G.sim.anchorSink(2)'); print('sink', sink)
    check(sink < -0.05, f'anchor in the mud sinks during the quake ({sink:.2f} m)')
    for _ in range(30):
        ev("(() => { const s = __mq.G.sim; for (let n = 0; n < 20; n++) s.step(1 / 60); })()"); ev('__mq.frame(1 / 30)')
    ev('__mq.G.manual = false'); time.sleep(0.3)
    ev("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()")
    # 3) supplied item: a free damper with no damper in stock
    ev(f"__mq.LEVELS[{i11}].soft = []; __mq.LEVELS[{i11}].supply = {{ damper: 1 }}")
    check(ev("__mq.shop.count('damper')") == 0, 'no damper in stock')
    open_job(11); print('order:', page.inner_text('#orderReq').replace('\n', ' | '))
    check('業主提供' in page.inner_text('#orderReq'), 'work order says the client supplies a damper')
    page.click('#btnIntroGo'); time.sleep(0.5); ev('__mq.loadRef(11)'); time.sleep(0.3)
    slot = page.locator('#itemTray .islot[data-id="damper"]')
    check('gift' in slot.get_attribute('class') and slot.locator('.cnt').inner_text() == '1', f'tray shows the free damper ({slot.get_attribute("class")}, {slot.locator(".cnt").inner_text()})')
    ev("(() => { const n = __mq.G.design.nodes.find(n => n.kind !== 'anchor'); __mq.G.load.damper = n.id; __mq.itemsChanged(); })()"); time.sleep(0.3); sh('07_supply_damper')
    play(); print('after run: stock', ev("__mq.shop.count('damper')"), 'bought', ev('__mq.G.boughtItems'), 'used', ev('__mq.G.runItems'))
    check(ev("__mq.shop.count('damper')") == 0 and ev('__mq.G.boughtItems.length') == 0 and 'damper' in ev('__mq.G.runItems'), 'the supplied damper was used without touching the stock')
    time.sleep(0.4); ev("document.getElementById('ovReveal').hidden || document.getElementById('btnRevealGo').click()")
    # 4) mixed quake: banner for the second part
    ev(f"__mq.LEVELS[{i11}].supply = null; __mq.LEVELS[{i11}].quake = {{ ...__mq.LEVELS[{i11}].quake, type: 'mix', mix: ['jolt', 'long'] }}")
    open_job(11); print('quake type line:', page.inner_text('#introQType'))
    check('混合' in page.inner_text('#introQType'), 'work order names the mixed quake')
    page.click('#btnIntroGo'); time.sleep(0.5); ev('__mq.loadRef(11)')
    ev("window.__banners = []; new MutationObserver(() => { const b = document.getElementById('qBanner'); if (!b.hidden) window.__banners.push(b.textContent); }).observe(document.getElementById('qBanner'), { attributes: true, childList: true })")
    play(); print('banners', ev('window.__banners'), 'HUD', page.inner_text('#qShindo'))
    check(any('長週期' in x for x in ev('window.__banners')), 'banner announces the long-period part')
    check(not errs, f'no errors {errs[:3]}')
    b.close()
print('ALL PASS' if not fails else f'{len(fails)} FAILED')
