# App 版的廣告與內購（之後上架用）

網頁版、itch.io 版沒有廣告。App 版用 Capacitor 包裝 `dist/itch/index.html`，廣告走 AdMob，「移除廣告」走商店內購。遊戲端已經寫好（`src/ads.js`），App 端只要接上外掛。

## 1. 包成 App
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "Match Architect" com.brycekuo.matcharchitect --web-dir dist/itch
npx cap add android
npx cap add ios
```

## 2. AdMob
```bash
npm install @capacitor-community/admob
npx cap sync
```
- 在 AdMob 後台建立 App，取得 **App ID**，填進 `android/app/src/main/AndroidManifest.xml`（`com.google.android.gms.ads.APPLICATION_ID`）和 `ios/App/App/Info.plist`（`GADApplicationIdentifier`）。
- 建立兩個廣告單元：**獎勵廣告**、**插頁廣告**，把 `src/ads.js` 裡 `UNITS` 的測試 ID 換成正式 ID，並把 `isTesting: true` 改成 `false`、`initializeForTesting` 改成 `false`。
- 如果 `window.Capacitor.Plugins.AdMob` 拿不到外掛，在 App 的入口加一行：
  ```js
  import { AdMob } from '@capacitor-community/admob';
  window.MQ_ADMOB = AdMob;
  ```
- iOS 需要 App Tracking Transparency 說明文字（`NSUserTrackingUsageDescription`），歐盟玩家需要 UMP 同意視窗。

## 3. 移除廣告（一次性內購，US$2.99）
在 Google Play Console 和 App Store Connect 建立非消耗型商品，ID 用 `remove_ads`。用任一內購外掛（例如 cordova-plugin-purchase 或 RevenueCat），在 App 入口提供：
```js
window.MQ_IAP = {
  async buy(productId) { /* 購買成功回傳 true */ },
  async restore() { /* 回傳已購買的商品 ID 陣列，例如 ['remove_ads'] */ },
};
```
遊戲會在商店的「移除廣告」卡片呼叫 `buy('remove_ads')`，「恢復購買」呼叫 `restore()`。

## 遊戲裡的廣告規則（`src/ads.js`）
- 獎勵廣告都由玩家自己選：過關後再領一次酬勞、沒過關退回燒掉的火柴錢、每日禮物 30 → 60 金幣、商店看廣告領 20 金幣（每天 5 次）或示範券（每天 3 次）。看到一半關掉沒有獎勵。
- 插頁廣告：只在驗收單按「下一張委託」時出現；第 1～3 關不出現；至少隔 3 次過關且 3 分鐘；3 分鐘內看過獎勵廣告就不出現；買了移除廣告就不出現。
- 搭建和地震進行中都不會出現任何廣告。
- 測試：網址加 `?ads=mock` 用假廣告跑完整流程（會記住；`?ads=off` 關掉）。
