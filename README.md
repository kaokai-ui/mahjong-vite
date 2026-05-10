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
  - `npm run verify:migration`
  - `npm run test:game-engine`
  - `npm run test:bot-ai`
  - `npm run test:scoring`
  - `npm run test:solo-controller`
  - `npm run test:network-live`
  - `npm run test:network-live:appcheck`

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
npm run verify:migration
npm run test:game-engine
npm run test:bot-ai
npm run test:scoring
npm run test:solo-controller
npm run test:network-live:appcheck
node local-admin/scripts/four-player-solo-regression.mjs
```

## 專案結構

- `src/`：正式站前端、遊戲引擎、AI、多人同步
- `local-admin/`：本機驗證腳本、開發筆記、四人單機回歸輸出
- `android-solo-offline/`：單機離線 Android 專案
