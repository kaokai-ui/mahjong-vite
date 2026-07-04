# 程式碼審查報告 — Bug 與重構清單

> 產生日期：2026-07-04
> 範圍：`src/` 全域（89 檔 / ~13.5k 行）+ PWA/部署設定，分六大領域（遊戲引擎、Bot AI、單機控制、連線、React UI、PWA）平行審查。
> 嚴重度分「高 / 中 / 低」。

## ✅ 修復狀態（2026-07-04，PR #3 已合併進 main）

本報告列出的 **19 項 BUG 全數修復**，重構大多完成，皆為前端 client-side 變更、**未更動任何 Firebase 安全規則**。驗證：`tsc` 0 錯誤、六大單元測試套件全通過、2p/4p 平板版面回歸通過、`vite build` 成功。

**依規範刻意跳過（無法保證行為 byte 等價，正確性優先）的重構，仍列為待辦：**
- `src/bot-ai-claim-kong.js` claim/kong 候選建構資料驅動化（各分支 factory/參數/訊息異質）。
- `src/firebase-rules-contract.js` payload schema 三處合併（輸出被安全規則鏡像測試逐字比對，不可冒險）。
- 兩份 `sw.js` 以 `importScripts` 抽共用核心；三份 manifest / 兩份 entry HTML 內嵌腳本去重。

## ⚠️ 回歸事故（2026-07-04，PR #3 引入，已修復待部署）

PR #3 的「座位競態改 `runTransaction`」修法本身帶入一個**全面性回歸：所有玩家加入任何房間都得到「找不到這個房間」**。原因：RTDB `runTransaction` 第一次執行 updater 拿到的是**本地快取值**（加入者從未訂閱 `roomMeta`，必為 `null`），`applyClaim` 對 `null` 回傳 `undefined` → 交易在聯絡伺服器前即中止 → `claim.meta === null` → 誤判為房間不存在。單元測試沒抓到，正因下方既有註記：mock 無交易能力會退回 read-then-set 路徑，交易路徑從未被執行。

修法：把 join 流程開頭已讀到的 meta 傳入 `claimSecondSeat`，updater 遇本地 `null` 時以它為基底；若過期，條件式寫入會被伺服器拒絕並以真實資料重跑 updater，競態保護不變。已用真實 Firebase 雙客戶端 live smoke（`npm run test:network-live`）驗證：修復前必現「找不到這個房間」，修復後建房→加入→開局→打牌同步全通過（順帶更新了該腳本兩個 React 遷移前的過時 selector：`.latest-discard`、`.action-grid`）。

**尚需其他環境確認的事項：**
- 連線座位競態：正式修法為用戶端 `runTransaction`；單元測試 mock 無交易能力會退回等價的 read-then-set，故**交易競態本身需用真實 Firebase 做雙客戶端同時 join 驗證**。伺服端 `.write` 規則不在本 repo，仍建議另行核對線上規則。
- ~~`npm run verify:migration` 為**既有損壞**（腳本讀取不存在的 `src/app-bridge-defaults.ts`）~~ → **已修復**：該腳本原為 React 遷移期的原始碼字串快照，已普遍鏽蝕（47 個引用檔中 11 個已被合併移除、契約字串大量漂移）。遷移既已完成，故精簡為一鍵整合驗證（production build + typecheck + 單元測試 + smoke + solo-offline build），移除逐字比對原始碼結構的斷言。

以下保留原始審查明細作為變更依據與追蹤。

## 摘要

| 領域 | 高 | 中 | 低 | 重構項 |
|---|---|---|---|---|
| 遊戲引擎 / 計分 | 0 | 2 | 1 | 4 |
| Bot AI | 0 | 2 | 3 | 5 |
| 單機控制 | 0 | 2 | 1 | 4 |
| 連線 / Firebase | 0 | 2 | 1 | 4 |
| React UI | 0 | 0 | 2 | 5 |
| PWA / Service Worker | 0 | 2 | 1 | 5 |
| **合計** | **0** | **10** | **9** | **27** |

沒有發現「高」嚴重度的立即崩潰/資料毀損；「中」多為特定情境下的卡死、規則計分偏差、快取/座位競態。

---

## 1. 遊戲引擎 / 規則 / 計分

### BUG
- **[中]** `src/scoring.js:83-90` — **十三么計分缺失**。`evaluateWinningHand` 會判十三么為可胡（`rules.js:268,344`），但 `evaluateWinningScore` 沒有十三么台型，最後只算到 `baseWin(1)+門清(1)=2 台=40 分`，把最大牌當成基本胡。full136 牌組可湊出（m1/m9/p1/p9/s1/s9+七字牌）→ 可觸發。建議在 `evaluateWinningScore` 補上十三么（與字一色）台型。
- **[中]** `src/scoring.js:367-374` vs `src/rules.js:335-342` — **七對子判定兩處語意不一致**。`rules.js` 的 `isSevenPairs` 接受 `count===2||count===4`（四張同牌當兩對可胡），但 `scoring.js` 版本要求「剛好 7 種、每種 2 張」。留一組四張同牌+五對（14 張不宣槓）時，`rules.js` 判胡但 `scoring.js` 不給七對子 2 台 → 計分被低估。建議兩者共用同一判定函式。
- **[低]** `src/scoring.js:326-330`（`rules.js` `detectPatterns`）— **字一色無對應台型**。`rules.js` 會標記「字一色」pattern 並顯示於結果面板，但 `scoring.js` 無此台 → UI 顯示牌型與台數 breakdown 脫節。

### 重構
- `src/scoring.js:367` 與 `src/rules.js:335` — 兩份 `isSevenPairs` 邏輯重複且語意分歧，抽成單一共用函式避免再度漂移。
- `src/game-internal-utils.js:57-59` — `getOpponentSeat(seat)` 為死碼（無 import），且硬編 `getNextSeat(seat,2)` 在 4 人局回錯座位，建議刪除。
- `src/game-panel-snapshot.ts:481-527` — `getOpponentSectionSnapshot` 與 `getSeatSectionSnapshot` 幾乎相同（僅 `revealHand/handTiles` 差異），合併為帶 `reveal` 參數的函式。
- `src/game-panel-snapshot.ts:699-708` / `:374-378` — `formatElapsedDebugTime` 首兩分支回傳相同、`getResultPatternText` 末兩 return 相同，皆有死分支可簡化。

## 2. Bot AI

### BUG
- **[中]** `src/bot-ai-advanced-evaluator.js:259-261` — `evaluateDiscardRisk` 用 `filter(r => r !== highestRisk)` 排除最高風險，遇「兩家風險值相同且皆為最高」會把**兩家都排除**（如 `[20,20,5]` → 只剩 `[5]`），低估打牌風險。建議改用 index 只移除一個最大值實例。
- **[中]** `src/bot-ai-claim-kong.js:79,89,503` — `decideEasyClaimAction` 傳常數 `DEFAULT_SOLO_DIFFICULTY` 給 `shouldTakeSet`，使其內部 `difficulty !== DEFAULT_SOLO_DIFFICULTY`（:503）恆 false，簡單模式碰中張的難度分支形同死碼。建議傳入真正 profile.id 或移除分支。
- **[低]** `src/bot-ai-hand-progress.js:25` — `floating` 計算的 `melds` 含 `lockedMelds`，但 `handTileIds` 不含已鳴牌面子 → 有 open meld 時 floating 被系統性低估、常被 clamp 成 0，評估訊號失真。應只扣 `structure.melds*3`。
- **[低]** `src/bot-ai-discard-decisions.js:134-138` — `chooseAdvancedDiscardDecision` 取 `candidates[0].tileId` 無空陣列防護，手牌空時拋 TypeError（正常流程不會發生，缺防禦）。
- **[低]** `src/bot-ai-action-helpers.js:126` — `pickBestActionCandidate` tie-break 用 `progress.totalScore`，但 structured 路徑只有 `score` 沒 `totalScore` → 平手比較 `undefined>undefined` 恆 false，tie-break 失效。建議 `progress.totalScore ?? progress.score`。

### 重構
- `src/bot-ai-action-helpers.js:10` — `evaluateDiscardRisk` 為未使用 import，刪除。
- `src/bot-ai-hand-progress.js:20` — `searchBestStructure(vector, Boolean(false), ...)` 冗餘，直接寫 `false`。
- `src/bot-ai-advanced-evaluator.js:32,86-95,533-550` — cache key 組裝邏輯四處重複，抽共用 key builder。
- `src/bot-ai-claim-kong.js:129-183,218-293` 及 `359-396,406-479` — structured/advanced 的 claim 與 kong 候選建構高度重複，抽成資料驅動產生器 / 共用骨架。
- `src/bot-ai-claim-kong.js:503,524` — `difficulty !== DEFAULT_SOLO_DIFFICULTY` 表達「非最高難度」語意隱晦，改用明確 profile 旗標。

## 3. 單機 / 本地對局控制

### BUG
- **[中]** `src/solo-controller.js:262-272`（`runBotAction`）— bot 指令 `applyGameCommand` 回傳 `!result.ok` 時只 `onError` 就 return，不重新排程也不清狀態；此時輪到 bot，人類送指令會被「非你回合」拒絕 → **對局永久卡死**只能離開重開。建議失敗時回退到人類可操作狀態或提示重試。
- **[中]** `src/app-controller-runtime.ts:59-71`（影響 SoloController 生命週期）— `initializeControllerRuntime` 於 `await buildController` 後直接指派 `runtime.controller`，未做 `token !== runtime.initToken` 檢查。快速切換模式時，晚解析的舊 build 會覆蓋較新 controller → 狀態不一致。建議指派前後比對 `initToken`。
- **[低]** `src/solo-controller.js:192-241` — 輪到 bot 但 `decideBotAction` 回 `null` 時，`queueBotTurnIfNeeded` 只 `setBotThinking(false)` 便 return，對局靜默卡住且無錯誤訊息（防禦性缺口）。建議偵測「該行動卻無動作」時記錄/提示。

### 重構
- `src/page-shell-variant.ts:3-7` — `DEFAULT_RULESET_ID`/`DEFAULT_DRAW_REVEAL_SECONDS`/`DEFAULT_SOLO_*` 等以字面值硬編，與 game/rules/scoring/solo-controller 既有常數重複，改為 import。
- `src/solo-controller.js:18-20`、`src/app-bootstrap-state.ts:26-30`、`src/page-shell-variant.ts:9-14` — 同批 localStorage key 字串三處重複定義，抽到單一 storage-keys 模組。
- `src/solo-controller.js:216,349` — `getPendingBotAction` 對已正規化的 `room.game` 重複 `normalizeGameState`，直接用 `this.room.game`。
- `src/solo-controller.js:211-241` 與 `:488-504` — `getPendingBotAction` 與 `resolvePendingBotSeat` 重複同組階段判斷邏輯，合併。
- `src/main.tsx` 與 `src/sologame-main.tsx` — 兩入口幾乎相同（差一行 preset），可共用帶參數 bootstrap 以防日後分歧。

## 4. 連線 / 多人 / Firebase

### BUG
- **[中]** `src/network-firebase-runtime.js:190-263` — 匿名登入失敗後 `authReadyPromise` 被 reject 卻未重設為 `null`，且 `authObserverStarted` 已 true。啟動時網路瞬斷導致 `signInAnonymously` 失敗一次後，重試因 `authReady` 仍 false 直接回傳已 rejected 的 promise，不再重掛 observer/重試 → **一次暫時性失敗即永久卡死，須整頁重載**。建議 settle 後將 `authReadyPromise=null` 讓下次重建。
- **[中]** `src/network-room-lifecycle.js:175-199`（及 `45-108`）— 座位配置用「先 `getRoomMeta` 讀、再 `setWithContext` 整包」的 check-then-act，非交易式。兩客人幾乎同時 join 同房會都讀到空位、都寫入，後寫覆蓋先寫 → **被覆蓋者座位靜默遺失**。建議座位配置改 `runTransaction`。
- **[低/中]** `src/network-room-lifecycle.js:108-130` — 建房先寫 `roomMeta`(108) 再寫 `rooms/<id>`(130) 中間無 rollback；後者失敗留下**孤兒 `roomMeta`**，之後建同房號被擋。建議失敗時清除已寫 meta，或合併為單次多路徑更新。

### 重構
- `src/network-room-helpers.js:160-202` — `getSeatForPlayer`/`getSeatForBrowser`/`getSeatValue`/`countOccupiedSeats` 反覆手寫 `obj[seat]||obj[String(seat)]`，抽 `readSeatKey(map,seat)` 小工具。
- `src/firebase-rules-contract.js:115-154` — 指令 payload schema 以三種平行結構各寫一遍（validate 規則字串 / 允許鍵 / 必填鍵），用單一 schema 衍生三者避免漂移。
- `src/network-room-lifecycle.js:202-223` 與 `274-290` — `joinNetworkRoom` 與 `reclaimNetworkSeat` 尾段幾乎相同，抽共用 `finalizeSeatJoin(...)`。
- `src/network-room-helpers.js:81-114,140-154` — 硬編只處理 slot `[0,1]` 的座位映射語意分散，集中定義「人類 slot 數＝2」常數。

> 註：座位競態/覆蓋風險因 repo 未提交 Firebase Database `.write` 規則檔，無法在原始碼層確認伺服端保護；建議一併核對線上規則是否有 `!data.exists()` 之類保護。

## 5. React UI / Shell / 版面

### BUG
- **[低]** `src/react-shell/usePageModeEffects.ts:48-57` — `useBodyModeClasses` effect 依賴整個 `snapshot`，而 store 每次 publish 回新參照 → 對局中每次快照更新（倒數等）都重跑並對 `document.body` 做 3 次 `classList.toggle`，雖只讀 `lobby.mode`/`page.gameFocusActive` 兩值。改為只依賴這兩個具體值。
- **[低]** `src/react-shell/RoomPanel.tsx:86`、`AppShell.tsx:191-194`、`GamePanel.tsx:93-95`、`RoomPanel.tsx:100-102` — 多處用字串本身當 `key`（`key={pill}` 等），列內出現重複字串時產生重複 key、觸發警告並可能誤複用節點。key 加上 index。

> 未發現高/中正確性錯誤：所有 `useEffect` 皆有 cleanup、hooks 於 early-return 前無條件呼叫、`ensureAppRuntimeBooted` 以模組層 promise 防 StrictMode 重複啟動。

### 重構
- `src/react-shell/game-panel/SeatSections.tsx:84-96,106-118` — `EdgeSeatSection` 左右兩側 meld 渲染幾乎相同，抽 `SeatSideMelds` 子元件依 `direction` 決定順序。
- `src/react-shell/game-panel/TableLayouts.tsx:255-331` — `TwoSeatTableLayout` 收下並轉傳 `leftDiscardRow/rightDiscardRow/sideSeatLeftLabel/sideSeatRightLabel` 卻用不到，拆分 Two/Four 各自 props 型別減少無效鑽取。
- `src/react-shell/GamePanel.tsx:14-47` 及 `AppShell.tsx:382` — 大段「Migration contract reference」註解為雜訊死碼，移除或移到 PR 說明。
- `src/react-shell/AppShell.tsx:375` — `Number(... || soloPlayerCount || 2)` 中 `soloPlayerCount` 為字串恆 truthy，末端 `|| 2` 為死碼；抽 `resolveSeatCount()` helper。
- `src/react-shell/game-panel/TableLayouts.tsx:33-62` — `DiscardLane` vertical/horizontal 分支重複「有牌則 map 否則 placeholder」，抽共用判斷。

## 6. PWA / Service Worker / 部署

### BUG
- **[中]** `public/sw.js:1,84`（+ `public/site.webmanifest:7`）— **根 SW / manifest 的 scope `./`（= `/mahjong-vite/`）吞掉 `/solo/`**。已安裝根「雙人麻將」後，離線首次開 `/solo/`（solo SW 未裝時），根 SW 的 navigation fallback 會回傳**雙人麻將 shell**；根 manifest scope 也涵蓋 `/solo/` 削弱兩 App 獨立性。建議收斂根 manifest scope，並讓 fallback 只在 request 落在自己 shell 時回退。
- **[中]** `src/pwa.ts:25` / `src/bootstrap-react-shell.tsx:39` — solo 入口 SW 註冊被 `ONLINE_MULTIPLAYER_ENABLED` 把關；`mahjong-solo-offline` 變體（`onlineMultiplayerEnabled:false`）下 solo web 建置**完全不註冊 SW、無離線快取**。「離線」變體卻關掉離線 SW 是耦合陷阱，需確認是否符合預期。
- **[低]** `src/pwa.ts:38-39,58` — SW base/scope 用 `new URL("./", location.href)`；若 `/solo` 以**無尾斜線**開啟，`./` 解析成根目錄 → 從 solo 頁註冊到根 `sw.js`（拿錯 SW）。目前靠 Pages 301 redirect 掩蓋，建議用明確目錄式路徑。

> 已求證排除：precache 清單無列不存在檔案（每個 URL 都對得到實體/建置產物）；root(`mahjong-pwa`)/solo(`mahjong-solo-pwa`) 快取前綴互不為前綴，activate 不誤刪對方快取。

### 重構
- `public/sw.js` 與 `public/solo/sw.js` — 兩份約 95% 相同（僅差 `cachePrefix` 與 precache 清單），用單一參數化模板（build 時注入）避免漂移。
- `public/sologame.webmanifest` — **死檔**（無任何頁面連結，`sologame.html` 是純 redirect），且與 `public/solo/manifest.webmanifest` 高度重複，刪除。
- `public/sw.js:9-14` — 根 shell precache 塞了 solo 專屬資產（`./sologame.html`、`sologame-*` icons），對雙人 App 是無用負重，移除。
- `public/site.webmanifest` / `public/solo/manifest.webmanifest` / `public/sologame.webmanifest` — 三份 manifest 大量重複欄位，共用基底再覆寫差異。
- `index.html:44-141` 與 `solo/index.html:16-111` — head 注入、`crypto.randomUUID` polyfill、`boot-warning` 三段內嵌腳本幾乎逐字重複，抽共用模組引用。
- `public/sw.js:94` — icon precache 用無 query URL 但 HTML 以 `?appVersion=` 版本化 → precache icon 永遠 miss 被重抓，precache 形同浪費；統一策略（precache 帶 query，或資產請求 `ignoreSearch:true`）。

---

## 建議優先處理順序

1. **連線 auth 永久卡死**（`network-firebase-runtime.js`）— 影響所有連線玩家、易在弱網觸發。
2. **單機 bot 失敗凍結** + **controller initToken 競態**（`solo-controller.js` / `app-controller-runtime.ts`）— 造成整局卡死。
3. **座位競態覆蓋**（`network-room-lifecycle.js`）— 改交易式。
4. **根 SW 吞 /solo/**（`sw.js` / `site.webmanifest`）— 與剛修好的 PWA 隔離直接相關，避免離線情境回退錯 shell。
5. **計分：十三么 / 七對子不一致**（`scoring.js`）— 規則正確性。
6. 其餘中低與重構項可排入常態清理。
