# 雙人 13 張麻將

這個專案是可部署到 GitHub Pages 的雙人 13 張麻將 Web UI，支援：

- 單人對電腦
- 雙人連線對局
- Firebase Realtime Database 同步
- Vite + React shell + 漸進式 TypeScript runtime

## 目前狀態

- Vite 遷移完成
- React shell / runtime 重構完成
- `game.js`、`bot-ai.js`、`network.js` 第一階段核心重構完成
- 主要回歸測試已就位，包含：
  - `npm run verify:migration`
  - `npm run test:game-engine`
  - `npm run test:bot-ai`
  - `npm run test:network-live`
  - `npm run test:network-live:appcheck`

## 本機開發

安裝依賴後可直接執行：

```powershell
npm install
npm run dev
```

預設本機網址：

- `http://127.0.0.1:4173/`
- `http://localhost:4173/`

## 驗證指令

完整發佈前建議至少跑：

```powershell
npm run verify:migration
npm run test:game-engine
npm run test:bot-ai
npm run test:network-live:appcheck
```

## 專案結構

- `src/`：正式站前端、遊戲引擎、AI、多人同步

