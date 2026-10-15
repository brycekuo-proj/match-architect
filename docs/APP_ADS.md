# App 版的廣告與內購

網頁版、itch.io 版、Steam 版沒有廣告。手機 App 版（Google Play、App Store）免費、100 關全開，靠 AdMob 廣告，另賣「移除廣告」內購。遊戲端的廣告規則寫在 `src/ads.js`。

## Android（已接上 AdMob）
`android/` 是 Android App：一個全螢幕 WebView 載入完整版（`dist/app/index.html`），加上 Google Mobile Ads SDK。

```bash
android/build.sh             # npm run build → 把完整版放進 App → 打包 debug APK
android/build.sh --skip-web  # 直接用現有的 dist/app/index.html
# 產出：android/release/MatchArchitect-v<版本>.apk
```
- 需要 JDK 17（`/opt/homebrew/opt/openjdk@17`）和 Android SDK（`/opt/homebrew/share/android-commandlinetools`），和其他 App 一樣。
- Google Mobile Ads SDK 25.5、UMP 3.2（歐盟／英國玩家會先看到同意視窗），Kotlin 2.3，compileSdk／targetSdk 36。
- `android/admob.properties`：AdMob 的 App ID、獎勵廣告和插頁廣告的單元 ID、`testing`。已經填上正式 ID（AdMob 帳號 `pub-3164945301503336` 的 App「火柴建築師」，2026-10-15 建立）。
- debug 版一律用 Google 的測試廣告單元（顯示「Test Ad」、沒有收入）；release 版在 `testing=true` 時也用測試廣告，改成 `testing=false` 才會用正式單元。開發時不要點自己的正式廣告，會被停權。
- App 裡的 `AdsBridge.kt` 以 `window.MQAndroidAds` 提供給網頁：一次預先載好一則獎勵廣告和一則插頁廣告，按下去馬上播；播完再載下一則。
- 完整版（含第 11–100 關）只會被複製到 `android/app/src/main/assets/`，這個資料夾和 `android/release/` 都在 `.gitignore`，不會上 GitHub。

### 上架前要做的
1. ~~在 AdMob 建立 App 和兩個廣告單元~~（已完成：火柴建築師_獎勵、火柴建築師_插頁，ID 已填進 `android/admob.properties`）。
2. `android/admob.properties` 改成 `testing=false`，打包 release 版。
3. 建立上架用的簽章金鑰（keystore），改用 `./gradlew bundleRelease` 產生 AAB 上傳到 Google Play Console。上架後在 AdMob 的 App 頁按「新增商店」連結 Google Play，審核通過前廣告放送會受限。
4. 在 AdMob 的「隱私權和訊息」為這個 App 建立 GDPR 同意訊息（需要隱私權政策網址）。沒建的話，App 啟動時 UMP 會回報「no form(s) configured」，歐盟／英國玩家看不到廣告；其他地區不受影響。
5. 「移除廣告」內購：接 Google Play Billing（商品 ID `remove_ads`），在 App 裡提供 `window.MQ_IAP = { buy(id), restore() }`。接好之前，商店不會顯示「移除廣告」。

## iOS（還沒做）
需要 Xcode 和 Apple 開發者帳號。做法和 Android 一樣：WKWebView 載入完整版，加 Google Mobile Ads iOS SDK、ATT 說明文字（`NSUserTrackingUsageDescription`）、StoreKit 內購，網頁端用同樣的廣告介面。

## Capacitor（另一條路，目前沒用）
`src/ads.js` 也能接 `@capacitor-community/admob`：外掛在 `window.Capacitor.Plugins.AdMob` 或 `window.MQ_ADMOB` 時自動使用。

## 遊戲裡的廣告規則（`src/ads.js`）
- 獎勵廣告都由玩家自己選：過關後再領一次酬勞、沒過關退回燒掉的火柴錢、每日簽到加倍、商店看廣告領 20 金幣（每天 5 次）或示範券（每天 3 次）。看到一半關掉沒有獎勵。
- 插頁廣告：只在驗收單按「下一張委託」時出現；第 1～3 關不出現；至少隔 3 次過關且 3 分鐘；3 分鐘內看過獎勵廣告就不出現；買了移除廣告就不出現。
- 搭建和地震進行中都不會出現任何廣告。廣告蓋住遊戲或 App 切到背景時，遊戲聲音會暫停。
- 網頁測試：網址加 `?ads=mock` 用假廣告跑完整流程（會記住；`?ads=off` 關掉）。
