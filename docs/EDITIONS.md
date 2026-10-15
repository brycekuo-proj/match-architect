# 各平台版本

同一份遊戲程式，`npm run build` 一次做出所有版本。版本由 `src/edition.js` 的 `EDITION` 決定（`build.mjs` 用 esbuild 的 `define` 設定 `__MQ_EDITION__`），只影響關卡範圍、廣告與內購、標題畫面的一行字。

| 版本 | `EDITION` | 檔案 | 關卡 | 收費 | 廣告 | 排行榜 |
|---|---|---|---|---|---|---|
| 網頁試玩版＝比賽版（GitHub Pages、itch.io、AI Browser Game Jam 5、Claude 分享連結） | `web` | `play.html`、`dist/itch/index.html`、`dist/match-architect.html` | 第 1 章（1–10 關） | 免費 | 無 | Claude 分享連結版有（artifact 共用資料庫） |
| Google Play | `android` | `dist/app/index.html` → `android/` | 100 關 | 免費 | AdMob（獎勵＋插頁），可買「移除廣告」 | Google Play 遊戲服務（之後接） |
| App Store | `ios` | `dist/ios/index.html` → iOS 專案（還沒做） | 100 關 | 免費 | AdMob，可買「移除廣告」 | Game Center（之後接） |
| Steam | `steam` | `dist/steam/index.html` → `steam/` | 100 關 | 買斷 | 無，也沒有內購 | Steam 排行榜（之後接） |
| 作者試玩檔 | `preview` | `dist/app/preview.html` | 100 關全開、5000 金幣 | — | 無 | — |

- 網頁版建置時把 `src/levels_full.js` 換成 `src/levels_web.js`，檔案裡沒有第 11 關以後的任何東西。其他版本會帶入 `private/` 的關卡和模型，所以 `dist/app/`、`dist/steam/`、`dist/ios/`、`android/app/src/main/assets/`、`steam/app/`、`steam/release/` 都在 `.gitignore`，不會上 GitHub。
- 標題畫面：網頁版寫「AI Browser Game Jam 5 參賽作品」，其他版本改成作者署名（`title.credit`）。
- 金幣、商店道具、外觀在所有版本都一樣，都用遊戲裡賺的金幣買；真錢只有手機版的「移除廣告」。

## Steam 版（`steam/`）
Electron 視窗載入 `dist/steam/index.html`。

```bash
steam/build.sh              # npm run build → 放進 steam/app/ → 冒煙測試 → 打包 macOS 版
steam/build.sh --skip-web   # 直接用現有的 dist/steam/index.html
steam/build.sh --win        # 也打包 Windows x64 版（在 Mac 上要有 Wine 才能寫 exe 圖示）
cd steam && npm start       # 直接開來玩
```
- 產出在 `steam/release/`：`mac-arm64/Match Architect.app`、`win-unpacked/`，就是要上傳到 Steam depot 的內容。
- F11 或 Alt+Enter 切換全螢幕；存檔（localStorage）在 Electron 的使用者資料夾，換電腦不會跟著走（之後可接 Steam Cloud）。
- 上架前：Steamworks 開發者帳號（每款遊戲 US$100 上架費）、App ID、商店頁素材、用 SteamPipe（steamcmd）上傳 depot。Windows 版最好在 Windows 電腦或 CI 打包並簽章。

## 排行榜：各平台獨立
每個平台用自己的排行榜服務，不自己架伺服器：玩家不用另外登入，也不用處理跨平台作弊和帳號。遊戲端已經有 `src/leaderboard.js` 的介面（`ranking(levelKey)`、`coinRanking()`、`submit`），每個平台各寫一個轉接器。

| 平台 | 服務 | 上限 | 打算的排法 |
|---|---|---|---|
| Steam | Steamworks Leaderboards（`FindOrCreateLeaderboard`，遞增排序） | 每款遊戲 10,000 個 | 每關一個（100 個，火柴數越少越前面）＋金幣總榜 |
| Google Play | Play 遊戲服務 v2 | 每款遊戲 **70 個** | 放不下 100 關：每章一個（10 個，分數＝該章 10 關火柴數總和，10 關都過才上榜）＋金幣總榜 |
| App Store | Game Center | 100 個，用排行榜組（sets）可到 500 | 每章一組、組裡每關一個 |
| 網頁版 | Claude artifact 共用資料庫 | — | 現有做法：每關一個＋金幣總榜 |

都需要各平台的開發者帳號和後台設定（排行榜 ID），帳號開好再接。

## iOS（還沒做）
需要 Xcode 和 Apple 開發者帳號。做法同 Android：WKWebView 載入 `dist/ios/index.html`，接 AdMob iOS SDK、StoreKit 內購、Game Center。見 [APP_ADS.md](APP_ADS.md)。
