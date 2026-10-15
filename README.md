# 火柴建築師 Match Architect

![火柴建築師封面：火柴搭成的東京鐵塔](img/cover.jpg)

你是一位火柴建築師：接下世界各地的委託，用最少的火柴搭出建築骨架，撐過 10 秒大地震。AI Browser Game Jam 5 參賽作品。

**線上玩：<https://brycekuo-proj.github.io/match-architect/play.html>**　｜　首頁：<https://brycekuo-proj.github.io/match-architect/>

免費、瀏覽器直接玩，手機和電腦都可以。`play.html` 是單一檔案、可離線。遊戲有繁體中文和英文，依瀏覽器語言自動切換，標題畫面也可以手動切換。

> **English:** *Match Architect* is a free browser game for AI Browser Game Jam 5. Take building jobs from around the world, frame them out of fixed-length matchsticks, and survive a 10-second earthquake: fewer matches, more stars. If a glue joint snaps, fire runs through the matches and the whole thing comes down; pass, and a cute 3D model of the real landmark spins on a turntable. The game switches to English for non-Chinese browsers (there's a language button on the title screen). itch.io page text, cover and screenshots: [`docs/itch/`](docs/itch/ITCH_PAGE.md).

## 玩法
- 每關是一張**委託單**：工程名稱、地點、震度、任務要求和達成獎勵。
- 第一、二關有互動的「玩法示範」：手指示範要從哪裡拖到哪裡、虛線標出火柴位置，放錯會提示按「復原」，可以跳過；過關或跳過之後，在這兩關的委託單按「玩法示範」可以再看一次。
- 從紅色錨點或火柴端點按住拖曳，放開就放下一支固定長度的火柴；端點會自動吸附。
- 在火柴中段按住拖曳，可以把新火柴黏上去做斜撐。
- 建造時沒有重力；按「開始地震」後地面左右搖晃 10 秒。
- 膠點一斷，火會沿著火柴燒過去，燒到的膠點融掉，整棟倒塌燒成黑炭。
- 所有星星都撐住、沒有膠點斷掉就過關，不規定一定要用幾支。火柴用越少，星星越多（三星目標以內 ★★★、1.25 倍以內 ★★）。
- 縮放：手機兩指捏合，或按畫面右邊的 ＋／－（⤢ 回到整棟建築）；電腦可用滑鼠滾輪、觸控板捏合或鍵盤 + − 0。
- 單指拖空白處移動畫面。

## 完工模型
過關時會先看到這棟建築的 Q 版低多邊形模型在轉台上旋轉，可以用手指轉。13 個模型都是用 Blender 的 Python 腳本做的（`blender/make_landmarks.py`），貼圖也是腳本畫的，仿原建築的石塊、鐵架、玻璃帷幕和拱廊。

## 金幣
- 每關的配額是三星目標的 2 倍。每支火柴成本 1 金幣，按下「開始地震」時付款；錢不夠就不能再放火柴。
- 驗收合格後，配額裡沒用完的火柴每支換 2 金幣。例：艾菲爾鐵塔配額 40 支，用 20 支 → 成本 −20、酬勞 +40。
- 一開始有 30 金幣；沒撐過地震，那次的火柴錢就燒掉了。金幣低於 10 時會補到 10。
- 金幣會一直累積，排行榜也有金幣總榜。
- 每日簽到：標題畫面每天簽一次，30 天一輪（規則在 `src/checkin.js`）：
  - 每天 +10 金幣。
  - 第 5、10、15、20、25 天另送小道具：示範券、鋼骨、碳纖維 ×5、彈簧避震器、檢測儀。
  - 第 30 天送高價值道具，阻尼球和隔震墊一輪一輪輪流送；之後開始新的一輪。
  - 要連續簽。漏簽的天數可以花金幣補簽（每天 30 金幣，最多補 7 天）：補簽的天不給金幣，但碰到第 5、10…天的道具照送。不補或漏太多天，就從第 1 天重來。
  - 手機日期被調回去時不能簽到。
  - App 版簽到時可以看一則廣告，金幣變雙倍。
- 貴的道具（阻尼球 1200、隔震墊 1000）是長期目標，要多玩幾輪、存一陣子才買得起。

## 商店與防震道具
商店只能從標題畫面進去，遊戲進行中不能買東西。搭建時從畫面左邊的**道具框**使用買好的道具（點一下使用，再點一下取消），框上的數字是庫存。

道具都是**一次性**的：按下「開始地震」時用掉，要再用就要重新買；地震中途按停止會退還。用了物理道具（示範券、檢測儀除外）的成績不上排行榜，星星和金幣照算。道具的效果都參考真實的耐震工程：

| 道具 | 價格 | 用法與效果 |
|---|---|---|
| 阻尼球 | 1200 | 掛在一個接點下（約 2/3 高度最好），仿台北 101 的調諧質量阻尼器，抵掉附近火柴的晃動 |
| 鉛心橡膠隔震墊 | 1000 | 開關式，整棟建築放在會滑動的隔震平台上；高樓受力大約減半 |
| 彈簧避震器 | 300／支 | 點兩個接點，中間裝一支不會斷的彈簧油壓斜撐；一棟最多 6 支 |
| 碳纖維包覆 | 200（5 份） | 點火柴包起來：重量 ×0.6、接點強度 ×1.8 |
| 高韌性鋼骨 | 150 | 開關式，接點受力過頭時先彎曲，到 1.7 倍才斷 |
| 結構檢測儀 | 500 | 先試跑一次地震，標出最先斷的接點和每個接點的受力（每檢測一次用 1 個） |
| 工頭示範券 | 100 | 顯示這關參考解的虛線，用過後這關永久有效 |

商店也賣外觀：火柴造型（竹筷 300、糖果棒 400、夜光 600、金火柴 1000）和場景（沙漠 200、雪地 400、夜晚 600）。過關的建築模型收在標題畫面的「展示櫃」。

## 版本
網頁版（GitHub Pages、itch.io、jam、Claude 分享連結）就是比賽版：第 1 章 10 關、免費、沒有廣告。完整版 100 關分三種：Google Play／App Store 免費加廣告（可買移除廣告），Steam 買斷、沒有廣告也沒有內購。各版本差在哪、怎麼建置、排行榜怎麼做：[docs/EDITIONS.md](docs/EDITIONS.md)。

## 廣告（手機版）
網頁版、itch.io 版、jam 版和 Steam 版都**沒有廣告**。廣告只在手機 App 版（Google Play、App Store，AdMob）出現，規則寫在 `src/ads.js`：
- 獎勵廣告（玩家自己選）：過關後看廣告再領一次酬勞、沒過關看廣告退回燒掉的火柴錢、每日簽到看廣告金幣變雙倍、商店裡看廣告領 20 金幣（每天 5 次）或示範券（每天 3 次）。
- 插頁廣告：只在驗收單按「下一張委託」時出現；前 3 關不出現；至少隔 3 次過關、3 分鐘；剛看過獎勵廣告不出現。
- 移除廣告：一次購買 US$2.99，只移除插頁廣告，獎勵廣告照樣可以用。
- 想先看流程：網址加 `?ads=mock` 會用假廣告（會記住，`?ads=off` 關掉）。
- Android App（`android/`）已經接上 AdMob；怎麼打包、上架前要換哪些 ID、內購怎麼接：[docs/APP_ADS.md](docs/APP_ADS.md)。

## 關卡
網頁版（GitHub Pages、itch.io、jam、Claude 分享連結）有第 1 章的 10 關：3 個教學關＋7 座世界名建築（獅身人面像到台北 101，震度 3 → 6 強），後半段先預告幾種新地震：金字塔是直下型、艾菲爾鐵塔是 P波→S波、東京鐵塔是餘震、台北 101 是長週期（業主送一顆阻尼球）。完整版（Google Play、App Store、Steam）有 **100 關，10 章 × 10 關**，每章教一件新東西、章末是一座名建築；網頁版的委託清單只有這 10 關，不顯示完整版的關卡。完整版的委託清單會分章顯示。100 關企劃見 [docs/LEVEL_PLAN.md](docs/LEVEL_PLAN.md)。

### 地震類型
每關除了震度，還有一種地震類型（委託單上的「地震類型」），規則寫在 `src/sim.js` 的 `QT`：

| 類型 | 怎麼搖 |
|---|---|
| 橫向搖晃 | 地面左右來回搖（最基本的地震） |
| 直下型 | 三陣上下猛跳，越重的建築越吃力 |
| 長週期 | 搖得慢、擺得大；高樓會共振，阻尼球最有用 |
| 餘震 | 主震 → 停一下 → 再搖一次；主震時受力大的膠點會變脆 |
| P波→S波 | 先上下小震，2.5 秒後強烈左右搖 |
| 脈衝型 | 斷層旁的地震：地面突然猛推一大下 |
| 混合 | 一關裡接連出現兩、三種（各佔一段時間，換段時會提示） |

想先試試看：網址加 `?quake=jolt`（或 `long`、`after`、`ps`、`pulse`），每一關都會換成那種地震，例如 `play.html?quake=long`。

### 其他關卡機制（完整版）
| 機制 | 怎麼玩 | 寫法 |
|---|---|---|
| 高低地形 | 錨點在不同高度（山坡、階梯、懸崖），火柴不能穿過地面 | `terrain: [steps(…)]` |
| 屋頂載重 | 有些星星上放著重物：水塔、大鐘、看板、屋頂花園、籃板，地震時會甩動 | `loads` |
| 業主提供道具 | 這關免費附道具（阻尼球、隔震墊…），用完不扣自己的庫存，成績照樣上排行榜；有的關可以挑幾種 | `supply` |
| 軟地基 | 褐色泥地上的錨點受力太大會往下陷，建築會歪 | `soft`、`softCap` |

關卡用 `src/leveltools.js` 的「格子圖」寫：一個字元半支火柴寬，畫出參考解的接點、錨點和星星，就會自動算出錨點、星星、三星火柴數、參考解和淡淡的輪廓提示。

### 完整版和網頁版怎麼分開
- 建置網頁版時，`build.mjs` 會把 `src/levels_full.js` 換成 `src/levels_web.js`，所以網頁版檔案裡完全沒有第 11 關以後的關卡、參考解和模型。完整版（`dist/app/`、`dist/steam/`、`dist/ios/`）不放上網。
- 公開的 repo 裡只有第 40 關（東京晴空塔）。第 11–100 關的其他內容只放在作者自己的電腦（`private/` 資料夾，已列在 `.gitignore`），`src/levels_private.js` 只是空的替身。完整版建置和 `npm run test:full` 會自動改用 `private/levels_private.js`。
- 檢查全部關卡：`node --import ./test/use-private.mjs test/levels.test.mjs 11-100`（每關參考解都要放得上去、撐得過它的地震，而且用的火柴數就是三星門檻）。

## 排行榜
`dist/match-architect.html` 是 Claude 分享連結版，使用 Claude artifact 內建的共用資料庫，比每關誰用的火柴最少，以及金幣總榜。GitHub Pages 上的 `play.html` 沒有排行榜，其他功能相同。之後的 Steam、Google Play、App Store 版各用平台自己的排行榜（不跨平台），見 [docs/EDITIONS.md](docs/EDITIONS.md)。

## 技術
- 物理：[Planck.js](https://github.com/piqnt/planck.js)（2D，火柴是剛體、膠點是有摩擦的鉸接，受力超過門檻就斷）
- 畫面：[Three.js](https://threejs.org/) 即時 3D；地震開始時建築展開成有前後兩面的立體塔
- 卡通描邊：深度圖找出輪廓，在物體外側畫粗墨線（`src/outline.js`），遊戲畫面和完工模型都有
- 火柴模型、13 個 Q 版建築模型與封面：Blender（`blender/`）
- 音效與音樂：Web Audio 即時合成，沒有音檔

## 開發
```bash
npm install
npm run build   # 網頁版 dist/match-architect.html、dist/itch/index.html（複製成根目錄的 play.html），以及完整版 dist/app、dist/steam、dist/ios
android/build.sh   # Android App（APK）
steam/build.sh     # Steam 桌面版（Electron）
cd dist/itch && zip ../match-architect-itch.zip index.html   # itch.io 上傳用的 zip
npm test        # 每關參考解必須撐過該關震度；太細、太窄的錯誤解必須倒；倒下的建築必須燒起來；每種道具都要真的有效
python3 test/zoom.py   # 縮放按鈕、雙指捏合、滾輪（需要 Playwright）
python3 test/items.py  # 道具：購買、道具框、放置、檢測、消耗與退還
python3 test/ads.py    # 廣告（假廣告模式）與移除廣告
```

| 檔案 | 內容 |
|---|---|
| `index.html` | GitHub Pages 首頁（遊戲介紹） |
| `play.html` | 遊戲本體（單一檔案、可離線；也可以打包上傳 itch.io） |
| `src/sim.js` | 關卡資料（1–10）、建造規則、物理模擬 |
| `src/levels_full.js` | 完整版才有的關卡（11 以後）、參考解與模型清單 |
| `src/levels_web.js` | 網頁版用的替身：沒有完整版的關卡 |
| `src/designs.js` | 每關參考解（三星目標） |
| `src/render3d.js` | Three.js 畫面 |
| `src/main.js` | 操作、流程、介面 |
| `src/turntable.js` | 過關時旋轉的 Q 版建築模型 |
| `src/outline.js` | 卡通粗描邊 |
| `src/i18n.js` | 中英文介面文字 |
| `src/coach.js` | 第一、二關的互動教學、工頭示範虛線、結構檢測結果 |
| `src/shop.js` | 商店品項、價格與庫存 |
| `src/icons.js` | 道具圖示 |
| `src/ads.js` | 廣告與移除廣告購買（假廣告／AdMob） |
| `src/edition.js` | 這是哪個版本（網頁／Android／iOS／Steam／作者試玩） |
| `src/leaderboard.js` | 排行榜（可換成其他後端） |
| `src/audio.js` | 合成音效與音樂 |
| `src/template.html` | 遊戲頁面與樣式 |
| `blender/` | 火柴、Q 版建築模型與封面的 Blender 腳本 |
| `assets/landmarks/` | 13 個 Q 版建築模型（GLB，建置時嵌入遊戲） |
| `docs/LEVEL_PLAN.md` | 100 關企劃與實作結果 |
| `android/` | Android App（WebView＋AdMob） |
| `steam/` | Steam 桌面版（Electron） |
| `docs/EDITIONS.md` | 各平台版本、建置方式、排行榜規劃 |
| `docs/APP_ADS.md` | App 版接 AdMob 與移除廣告內購 |
| `docs/itch/` | itch.io 報名素材：英文頁面文字、封面、截圖 |

調整手感：`src/sim.js` 的 `PARAMS.breakForce`（膠點強度）、`SHINDO`（各震度的振幅與頻率）、每關的 `shindo` 與 `par`。改完跑 `npm test`。
