// UI language: 繁體中文 for Chinese browsers, English for everyone else; the title screen has a switch (saved).
const KEY = 'mq_lang';
function detect() {
  try { const s = localStorage.getItem(KEY); if (s === 'zh' || s === 'en') return s; } catch (e) {}
  const l = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
  return /^zh/i.test(l) ? 'zh' : 'en';
}
export let LANG = detect();
export function setLang(l) { LANG = l === 'zh' ? 'zh' : 'en'; try { localStorage.setItem(KEY, LANG); } catch (e) {} applyStatic(); }

// 震度 5弱 → "5−", 6強 → "6+" in English
export const sh = s => LANG === 'en' ? String(s).replace('弱', '−').replace('強', '+') : String(s);
// level text: English lives in lv.en
export const lvt = (lv, f) => (LANG === 'en' && lv.en && lv.en[f] !== undefined) ? lv.en[f] : lv[f];

const zh = {
  'app.canvas': '火柴建築師遊戲畫面',
  'hud.menu': '委託清單', 'hud.tray': '火柴數量、星星與金幣', 'hud.help': '看委託單', 'hud.sound': '音效開關',
  'tool.matchA': '放火柴', 'tool.match': '火柴', 'tool.deleteA': '刪除火柴', 'tool.delete': '刪除', 'tool.undo': '復原', 'tool.clear': '清空', 'clear.confirm': '確定？',
  'play.start': '開始地震', 'play.stop': '停止',
  'zoom.group': '縮放畫面', 'zoom.in': '放大', 'zoom.inT': '放大（+）', 'zoom.out': '縮小', 'zoom.outT': '縮小（−）', 'zoom.fit': '看整棟建築', 'zoom.fitT': '看整棟建築（0）',
  'loading': '正在搬火柴…',
  'title.logo': '火柴建築師', 'title.sub': 'MATCH ARCHITECT',
  'title.tagline': '接下世界各地的委託，用最少的火柴搭出建築骨架，撐過 10 秒大地震',
  'title.start': '開始工作', 'title.levels': '委託清單', 'title.board': '排行榜：誰用的火柴最少', 'title.coins': '金幣',
  'snd.on': '音效：開', 'snd.off': '音效：關', 'mus.on': '音樂：開', 'mus.off': '音樂：關', 'lang.other': 'English',
  'title.jam': 'AI Browser Game Jam 5 · 程式、關卡與模型都和 Claude 一起做 · 模型用 Blender 製作',
  'levels.title': '委託清單', 'btn.back': '回標題',
  'order.no': '委託單', 'order.name': '工程名稱', 'order.place': '委託地點', 'order.brief': '工程說明', 'order.req': '任務要求', 'order.reward': '達成獎勵', 'order.tip': '工頭提示',
  'order.howto': '怎麼搭火柴',
  'order.howtoText': '從紅色錨點或火柴端點按住拖曳，放開就放下一支火柴；在火柴中段按住可以黏斜撐。單指拖空白處移動畫面；兩指捏合或右邊的 ＋／－ 可以縮放（電腦也能用滾輪）。',
  'order.go': '接下委託',
  'reveal.chip': '完工模型', 'reveal.canvas': '完工模型，可以用手指轉動', 'reveal.hint': '用手指轉轉看', 'reveal.go': '看驗收單', 'reveal.studio': '火柴建築師工作室',
  'res.no': '驗收單', 'res.boardTitle': '這項工程的排行榜 <small>火柴越少越前面</small>', 'res.nick': '取個名字上榜', 'res.nickPh': '最多 12 個字', 'res.upload': '上傳成績',
  'board.title': '排行榜', 'board.pick': '榜單',
  'err.title': '遊戲沒有啟動', 'err.msg': '3D 引擎載入失敗。', 'err.help': '請確認網路連線後重新整理頁面；如果還是不行，請換用最新版 Safari 或 Chrome。', 'err.reload': '重新整理',
  // dynamic
  'shindo': v => `震度 ${v.s}`,
  'lv.best': v => `你的最佳 ${v.n} 支`, 'lv.sub': v => `三星 ≤ ${v.par} 支 · 最多 ${v.budget}`, 'lv.world': v => `世界最少 ${v.n} 支`,
  'lv.starsA': v => `${v.n} 顆星`, 'lv.locked': '未解鎖',
  'order.tutorial': '火柴建築師工作室（新手訓練）', 'order.real': v => `真實建築：${v.r}`,
  'req.stars': v => `碰到並撐住全部 <b>${v.n}</b> 顆星星`, 'req.star': '碰到並撐住星星（高度目標）',
  'req.quake': v => `撐過震度 <b>${v.s}</b> 地震 <b>10</b> 秒，膠點一個都不能斷`,
  'req.quota': v => `火柴最多 <b>${v.budget}</b> 支，每支成本 <b>${v.cost}</b> 金幣（開震時付款）`,
  'rew.refund': v => `沒用完的火柴每支換 <b>${v.r}</b> 金幣（最多 <b>+${v.max}</b>）`, 'rew.par': v => `<b>${v.par}</b> 支以內完成：★★★`, 'rew.board': '上排行榜，比誰用的火柴最少',
  'order.best': v => `你的最佳紀錄：${v.n} 支`,
  'toast.big': '建築很大：兩指捏合或右邊的 ＋／－ 可以縮放，單指拖空白處移動畫面',
  'toast.tap': '從紅色錨點或火柴上按住拖曳', 'toast.erase': '點一下火柴把它拿掉',
  'hud.count': v => `${v.used}<small>/${v.budget} 支 · 三星 ≤ ${v.par}</small>`,
  'why.coins': v => `金幣不夠：這次要 ${v.cost} 金幣，你只有 ${v.coins}`, 'why.broke': '金幣不夠了',
  'why.limit': v => `這關最多 ${v.n} 支火柴`, 'why.occupied': '這裡已經有火柴了', 'why.ground': '不能穿過地面', 'why.groundEnd': '不能插進地面',
  'why.empty': '先放幾支火柴吧', 'why.missStars': v => `還有 ${v.n} 顆星星沒碰到`, 'why.missStar': '結構還沒碰到星星',
  'fail.joint': '膠點斷了！建築被震壞', 'fail.star': '星星掉下來了！建築倒塌', 'fail.stars': '有星星掉下來了！高度沒有守住',
  'res.pay': v => `酬勞結算：成本 <b>−${v.paid}</b>　省下 ${v.unused} 支 × ${v.r} = <b>+${v.reward}</b><br>金幣 <b class="big">${v.coins}</b>`,
  'res.burn': v => `火柴燒掉了：成本 <b>−${v.paid}</b><br>金幣 <b class="big">${v.coins}</b>`,
  'res.topup': v => `<br>火柴盒補給：送你 ${v.top} 金幣（補到 ${v.floor}）`,
  'stamp.ok': '合格', 'stamp.no': '不合格',
  'res.passRecord': '驗收通過・新紀錄！', 'res.pass': '驗收通過', 'res.fail': '驗收不合格',
  'res.passWhy': v => `${v.name}的骨架撐過了震度 ${v.s} 的 10 秒地震。`,
  'res.used': v => `用了 <b>${v.n}</b> 支火柴`, 'res.toThree': v => `${v.par} 支以內拿三顆星`, 'res.three': '三顆星達成', 'res.best': v => `最佳 ${v.n} 支`,
  'btn.retryLess': '省火柴重做', 'btn.next': '下一張委託', 'btn.allDone': '全部完工！回委託清單', 'btn.tearDown': '拆掉重蓋', 'btn.fix': '修改設計再驗收',
  'unit.matches': '支', 'unit.coins': '金幣', 'lb.you': '（你）', 'lb.anon': '無名火柴人',
  'lb.loading': '讀取排行榜中…', 'lb.emptyFirst': '還沒有人上榜，你可以當第一名。', 'lb.login': '登入 Claude 後才能上傳成績。',
  'lb.readonly': '你目前只能查看排行榜，沒有上傳權限。', 'lb.uploadedRank': v => `已上傳！目前排第 ${v.rank} 名（共 ${v.of} 人）`, 'lb.uploaded': '已上傳！',
  'lb.myRank': v => `你在這關的紀錄是 ${v.n} 支，排第 ${v.rank} 名`, 'lb.notBetter': '這次沒有比你的紀錄少', 'lb.uploading': '上傳中…',
  'lb.full': '排行榜已滿，無法再新增玩家。', 'lb.error': '上傳失敗，請稍後再試。', 'lb.coinBoard': '金幣總榜', 'lb.emptyLevel': '這關還沒有人上榜。',
  'lb.coinInfo': '金幣越多排越前面：省下的火柴每支換 2 金幣', 'lb.levelInfo': v => `震度 ${v.s} · 用最少火柴撐過 10 秒的人排前面`,
  'err.3d': v => `3D 畫面啟動失敗：${v.m}`, 'err.load': v => `載入錯誤：${v.m}`,
};

const en = {
  'app.canvas': 'Match Architect game view',
  'hud.menu': 'Jobs', 'hud.tray': 'Matches, stars and coins', 'hud.help': 'Show the work order', 'hud.sound': 'Sound on or off',
  'tool.matchA': 'Place matches', 'tool.match': 'Match', 'tool.deleteA': 'Erase matches', 'tool.delete': 'Erase', 'tool.undo': 'Undo', 'tool.clear': 'Clear', 'clear.confirm': 'Sure?',
  'play.start': 'Start Quake', 'play.stop': 'Stop',
  'zoom.group': 'Zoom', 'zoom.in': 'Zoom in', 'zoom.inT': 'Zoom in (+)', 'zoom.out': 'Zoom out', 'zoom.outT': 'Zoom out (−)', 'zoom.fit': 'Show the whole building', 'zoom.fitT': 'Show the whole building (0)',
  'loading': 'Carrying matches…',
  'title.logo': 'Match<br>Architect', 'title.sub': '火柴建築師',
  'title.tagline': 'Take building jobs from around the world, frame them with as few matches as you can, and survive a 10-second earthquake.',
  'title.start': 'Start Work', 'title.levels': 'Jobs', 'title.board': 'Leaderboard: fewest matches', 'title.coins': 'Coins',
  'snd.on': 'Sound: on', 'snd.off': 'Sound: off', 'mus.on': 'Music: on', 'mus.off': 'Music: off', 'lang.other': '中文',
  'title.jam': 'AI Browser Game Jam 5 · code, levels and models made with Claude · models built in Blender',
  'levels.title': 'Jobs', 'btn.back': 'Back',
  'order.no': 'Work Order', 'order.name': 'Project', 'order.place': 'Site', 'order.brief': 'Brief', 'order.req': 'Requirements', 'order.reward': 'Rewards', 'order.tip': "Foreman's tip",
  'order.howto': 'How to build',
  'order.howtoText': 'Press on a red anchor or the end of a match and drag; let go to place one fixed-length match. Press on the middle of a match to glue a brace onto it. Drag empty space to pan; pinch or use + / − on the right to zoom (mouse wheel works too).',
  'order.go': 'Accept Job',
  'reveal.chip': 'Finished Model', 'reveal.canvas': 'Finished model, drag to spin it', 'reveal.hint': 'Drag to spin it', 'reveal.go': 'See Report', 'reveal.studio': 'Match Architect Studio',
  'res.no': 'Inspection Report', 'res.boardTitle': 'Leaderboard for this job <small>fewer matches rank higher</small>', 'res.nick': 'Pick a name for the board', 'res.nickPh': 'Up to 12 characters', 'res.upload': 'Upload',
  'board.title': 'Leaderboard', 'board.pick': 'Board',
  'err.title': "The game didn't start", 'err.msg': 'The 3D engine failed to load.', 'err.help': 'Check your connection and reload. If it still fails, try the latest Safari or Chrome.', 'err.reload': 'Reload',
  'shindo': v => `Quake ${v.s}`,
  'lv.best': v => `Your best: ${v.n}`, 'lv.sub': v => `★★★ ≤ ${v.par} · max ${v.budget}`, 'lv.world': v => `World best: ${v.n}`,
  'lv.starsA': v => `${v.n} stars`, 'lv.locked': 'Locked',
  'order.tutorial': 'Match Architect Studio (training)', 'order.real': v => `Real building: ${v.r}`,
  'req.stars': v => `Reach and hold all <b>${v.n}</b> stars`, 'req.star': 'Reach and hold the star (height target)',
  'req.quake': v => `Survive a level <b>${v.s}</b> quake for <b>10</b> seconds without a single glue joint breaking`,
  'req.quota': v => `Use at most <b>${v.budget}</b> matches; each costs <b>${v.cost}</b> coin, paid when the quake starts`,
  'rew.refund': v => `Every unused match pays <b>${v.r}</b> coins (up to <b>+${v.max}</b>)`, 'rew.par': v => `Finish with <b>${v.par}</b> or fewer: ★★★`, 'rew.board': 'A spot on the leaderboard: fewest matches wins',
  'order.best': v => `Your record: ${v.n} matches`,
  'toast.big': 'Big building: pinch or use + / − on the right to zoom, drag empty space to pan',
  'toast.tap': 'Press on a red anchor or a match and drag', 'toast.erase': 'Tap a match to remove it',
  'hud.count': v => `${v.used}<small>/${v.budget} · ★★★ ≤ ${v.par}</small>`,
  'why.coins': v => `Not enough coins: this costs ${v.cost}, you have ${v.coins}`, 'why.broke': 'Out of coins',
  'why.limit': v => `This job allows at most ${v.n} matches`, 'why.occupied': "There's already a match here", 'why.ground': "Can't go through the ground", 'why.groundEnd': "Can't stick into the ground",
  'why.empty': 'Place some matches first', 'why.missStars': v => `${v.n} stars still out of reach`, 'why.missStar': "The frame doesn't reach the star yet",
  'fail.joint': 'A glue joint snapped! The building shook apart.', 'fail.star': 'The star fell! The building collapsed.', 'fail.stars': "A star fell! The height didn't hold.",
  'res.pay': v => `Payout: cost <b>−${v.paid}</b> · ${v.unused} unused × ${v.r} = <b>+${v.reward}</b><br>Coins <b class="big">${v.coins}</b>`,
  'res.burn': v => `The matches burned: cost <b>−${v.paid}</b><br>Coins <b class="big">${v.coins}</b>`,
  'res.topup': v => `<br>Matchbox refill: +${v.top} coins (back up to ${v.floor})`,
  'stamp.ok': 'APPROVED', 'stamp.no': 'REJECTED',
  'res.passRecord': 'Passed · new record!', 'res.pass': 'Inspection passed', 'res.fail': 'Inspection failed',
  'res.passWhy': v => `Your ${v.name} frame survived a 10-second level ${v.s} quake.`,
  'res.used': v => `Used <b>${v.n}</b> matches`, 'res.toThree': v => `★★★ at ${v.par} or fewer`, 'res.three': '★★★ earned', 'res.best': v => `best ${v.n}`,
  'btn.retryLess': 'Try fewer', 'btn.next': 'Next Job', 'btn.allDone': 'All done! Back to jobs', 'btn.tearDown': 'Start over', 'btn.fix': 'Fix & retry',
  'unit.matches': '', 'unit.coins': 'coins', 'lb.you': ' (you)', 'lb.anon': 'Anonymous',
  'lb.loading': 'Loading leaderboard…', 'lb.emptyFirst': "No one's on the board yet. Be the first!", 'lb.login': 'Sign in to Claude to upload scores.',
  'lb.readonly': 'You can view this leaderboard but not upload to it.', 'lb.uploadedRank': v => `Uploaded! You're #${v.rank} of ${v.of}.`, 'lb.uploaded': 'Uploaded!',
  'lb.myRank': v => `Your record here is ${v.n} matches, #${v.rank}.`, 'lb.notBetter': 'Not fewer than your record this time.', 'lb.uploading': 'Uploading…',
  'lb.full': 'The leaderboard is full.', 'lb.error': 'Upload failed. Try again later.', 'lb.coinBoard': 'Coin ranking', 'lb.emptyLevel': "No one's on this board yet.",
  'lb.coinInfo': 'Most coins first: every saved match pays 2 coins', 'lb.levelInfo': v => `Quake ${v.s} · fewest matches to survive 10 s ranks first`,
  'err.3d': v => `The 3D view failed to start: ${v.m}`, 'err.load': v => `Load error: ${v.m}`,
};

const S = { zh, en };
export function t(k, v = {}) {
  const s = S[LANG][k] ?? zh[k] ?? k;
  return typeof s === 'function' ? s(v) : s;
}

// static text in the page: data-t (text), data-th (html), data-ta (aria-label), data-tt (title), data-tp (placeholder)
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of root.querySelectorAll('[data-th]')) el.innerHTML = t(el.dataset.th);
  for (const el of root.querySelectorAll('[data-ta]')) el.setAttribute('aria-label', t(el.dataset.ta));
  for (const el of root.querySelectorAll('[data-tt]')) el.title = t(el.dataset.tt);
  for (const el of root.querySelectorAll('[data-tp]')) el.placeholder = t(el.dataset.tp);
  document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-Hant';
  document.documentElement.classList.toggle('lang-en', LANG === 'en');
  document.title = LANG === 'en' ? 'Match Architect' : '火柴建築師';
}
