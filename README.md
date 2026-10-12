# 火柴建築師 Match Architect

![火柴建築師封面：火柴搭成的東京鐵塔](img/cover.jpg)

你是一位火柴建築師：接下世界各地的委託，用最少的火柴搭出建築骨架，撐過 10 秒大地震。AI Browser Game Jam 5 參賽作品。

**線上玩：<https://brycekuo-proj.github.io/match-architect/play.html>**　｜　首頁：<https://brycekuo-proj.github.io/match-architect/>

免費、瀏覽器直接玩，手機和電腦都可以。`play.html` 是單一檔案、可離線。

## 玩法
- 每關是一張**委託單**：工程名稱、地點、震度、任務要求和達成獎勵。
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

## 關卡
目前 13 關（3 個教學關＋10 座世界名建築，震度 3 → 7）。50 關企劃見 [docs/LEVEL_PLAN.md](docs/LEVEL_PLAN.md)。

## 排行榜
`dist/match-architect.html` 是 Claude 分享連結版，使用 Claude artifact 內建的共用資料庫，比每關誰用的火柴最少，以及金幣總榜。GitHub Pages 上的 `play.html` 沒有排行榜，其他功能相同。

## 技術
- 物理：[Planck.js](https://github.com/piqnt/planck.js)（2D，火柴是剛體、膠點是有摩擦的鉸接，受力超過門檻就斷）
- 畫面：[Three.js](https://threejs.org/) 即時 3D；地震開始時建築展開成有前後兩面的立體塔
- 火柴模型、13 個 Q 版建築模型與封面：Blender（`blender/`）
- 音效與音樂：Web Audio 即時合成，沒有音檔

## 開發
```bash
npm install
npm run build   # 產生 dist/match-architect.html、dist/itch/index.html，並複製成根目錄的 play.html
npm test        # 每關參考解必須撐過該關震度；太細、太窄的錯誤解必須倒；倒下的建築必須燒起來、垮下來
python3 test/zoom.py   # 縮放按鈕、雙指捏合、滾輪（需要 Playwright）
```

| 檔案 | 內容 |
|---|---|
| `index.html` | GitHub Pages 首頁（遊戲介紹） |
| `play.html` | 遊戲本體（單一檔案、可離線；也可以打包上傳 itch.io） |
| `src/sim.js` | 關卡資料、建造規則、物理模擬 |
| `src/designs.js` | 每關參考解（三星目標） |
| `src/render3d.js` | Three.js 畫面 |
| `src/main.js` | 操作、流程、介面 |
| `src/turntable.js` | 過關時旋轉的 Q 版建築模型 |
| `src/leaderboard.js` | 排行榜（可換成其他後端） |
| `src/audio.js` | 合成音效與音樂 |
| `src/template.html` | 遊戲頁面與樣式 |
| `blender/` | 火柴、Q 版建築模型與封面的 Blender 腳本 |
| `assets/landmarks/` | 13 個 Q 版建築模型（GLB，建置時嵌入遊戲） |
| `docs/LEVEL_PLAN.md` | 50 關企劃 |

調整手感：`src/sim.js` 的 `PARAMS.breakForce`（膠點強度）、`SHINDO`（各震度的振幅與頻率）、每關的 `shindo` 與 `par`。改完跑 `npm test`。
