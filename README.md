# 麻將 Web / 單機離線專案

這個專案是可部署到 GitHub Pages 的麻將 Web UI，目前支援：

- 雙人連線對局
- 單機 2 人對電腦
- 單機 4 人對電腦（1 名玩家 + 3 名電腦）
- Firebase Realtime Database 同步
- Vite + React shell + 漸進式 TypeScript runtime
- `mahjong-solo-offline` Capacitor 離線平板包裝

## 目前狀態

- Vite 遷移完成
- React shell / runtime 重構完成
- `game.js`、`bot-ai.js`、`network.js` 第一階段核心重構完成
- 單人模式已支援 `2 人局 / 4 人局` 切換
- 四人單機模式已接上本機房間資料、3 名 bot 排程、四方位牌桌與結果畫面
- 主要回歸測試已就位，包含：
  - `npm run test:game-engine`
  - `npm run test:bot-ai`
  - `npm run test:scoring`
  - `npm run test:solo-controller`
  - `npm run test:network-helpers`
  - `npm run test:network-controller`
  - `npm run test:network-live`
  - `npm run test:network-live:appcheck`
  - `npm run test:layout:2p-tablet` / `test:layout:4p-tablet`（需 dev server，見「驗證指令」）
  - `npm run verify:migration` ⚠️ 目前損壞，待修

## 四人單機進度

目前四人單機版已完成的部分：

- 大廳可直接選擇單機 `2 人局 / 4 人局`
- 四人單機不需要 Firebase 房間、房號、App Check 或匿名登入
- `solo-controller` 會建立 `1 名玩家 + 3 名電腦` 的本機對局資料
- 遊戲引擎、吃碰槓判定、台數計算與勝負分配已泛化到 `2..4` 個 seat
- React 牌桌已支援上家 / 左家 / 右家 / 本家四方位顯示
- 離線 build variant `mahjong-solo-offline` 與 `android-solo-offline/` scaffold 已在 repo 內
- 已有可重跑的兩輪四人單機回歸腳本：`node local-admin/scripts/four-player-solo-regression.mjs`

目前仍建議繼續補強的部分：

- 更長局數與更多吃碰槓情境的回歸驗證
- iPad / Android 實機與離線包裝 QA
- 四人單機 UI 的持續微調與晚盤版面觀察

## 本機開發

安裝依賴後可直接執行：

```powershell
npm install
npm run dev
```

預設本機網址：

- `http://127.0.0.1:4173/`
- `http://localhost:4173/`

## PWA 安裝（兩個獨立入口）

正式站（GitHub Pages）提供**兩個各自獨立、互不干擾**的 PWA 安裝入口，安裝後會產生兩個獨立的桌面 App icon：

| App | 網址 | manifest / scope |
|---|---|---|
| 雙人 13 張麻將 | `https://<pages-host>/mahjong-vite/` | `site.webmanifest`，scope 為根目錄 |
| 單人 4p 麻將 | `https://<pages-host>/mahjong-vite/solo/` | `solo/manifest.webmanifest`，scope 為 `/solo/` |

- 兩者是**同一份 Pages 部署下的不同路徑**，因 `id`/`scope`/`start_url` 分屬不同目錄而被瀏覽器認成兩個獨立 App，可同時安裝、不會互相覆蓋。
- `sologame.html` 為相容用的轉址頁，會自動導向 `/solo/`。
- 各入口有自己的 service worker（根 `sw.js`、`solo/sw.js`），快取前綴不同互不干擾；根 SW 不會攔截 `/solo/` 的導覽。
- **更新方式**：已安裝者**無需移除**，有網路時開啟 App 即由 service worker 在背景抓新版並自動重載（`skipWaiting` + `controllerchange`，註冊時帶 `updateViaCache:"none"`）。發新版時記得 bump 各 HTML 的 `window.__APP_VERSION__` 讓快取失效。
- **僅一次性遷移**：曾安裝「舊版兩入口共用 scope」的裝置，需解除安裝舊 icon、清除該網站資料 / unregister 舊 SW，並首次單獨安裝 `/solo/`，之後即全自動更新。

## App Variants

目前專案有兩個明確的 build variant：

- `mahjong-online`
  - 現有正式站版本
  - 保留單人模式與雙人連線
  - 預設輸出到 `dist/`
- `mahjong-solo-offline`
  - 給 iPad / Android 平板的 Capacitor 離線版
  - build 時只保留單人模式
  - 不會在啟動時載入本機 Firebase override
  - 預設輸出到 `dist-solo-offline/`

常用指令：

```powershell
npm run build:online
npm run build:solo-offline
```

## Capacitor 離線包裝

離線版目前採用 Capacitor scaffold，主要命令如下：

```powershell
npm run cap:add:android:solo-offline
npm run cap:add:ios:solo-offline
npm run cap:sync:solo-offline
npm run cap:open:android:solo-offline
npm run cap:open:ios:solo-offline
```

目前約定：

- `mahjong-online`
  - `appId`: `io.kaokai.mahjongonline`
  - native 專案路徑：`android-online/`、`ios-online/`
- `mahjong-solo-offline`
  - `appId`: `io.kaokai.mahjongsolooffline`
  - native 專案路徑：`android-solo-offline/`、`ios-solo-offline/`

## 驗證指令

完整發佈前建議至少跑：

```powershell
npm run test:game-engine
npm run test:bot-ai
npm run test:scoring
npm run test:solo-controller
npm run test:network-helpers
npm run test:network-controller
npm run test:network-live:appcheck   # 需真實 Firebase 憑證
node local-admin/scripts/four-player-solo-regression.mjs
```

平板版面回歸需先啟動 dev server，再指向該網址執行：

```powershell
npm run dev   # 另開一個終端
$env:TWO_PLAYER_TABLET_URL="http://127.0.0.1:4173/"; npm run test:layout:2p-tablet
$env:FOUR_PLAYER_TABLET_URL="http://127.0.0.1:4173/"; npm run test:layout:4p-tablet
```

> 注意：`npm run verify:migration` 目前為損壞狀態（腳本讀取已不存在的 `src/app-bridge-defaults.ts`），修好前請勿依賴其結果。

## 專案結構

- `src/`：正式站前端、遊戲引擎、AI、多人同步
- `local-admin/`：本機驗證腳本、開發筆記、四人單機回歸輸出
- `android-solo-offline/`：單機離線 Android 專案
