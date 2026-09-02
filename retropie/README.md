# Mahjong RetroPie（單人 2P／4P）

這是 Mahjong-vite 現有 Web 遊戲之外的原生 Pygame 入口。Web/Firebase
版本維持原狀；本目錄只放給 RetroPie Pi Zero 2 W 的本機移植程式，目前已
部署至 `retropie-pi-zero2w:/home/pi/RetroPie/ports/mahjong-vite`。

## RetroPie 目前範圍

- 首頁不輸入玩家名稱，只選擇「單人 2P」或「單人 4P」。
- `胡`（紅色 `Z`）切換模式；鍵盤上的綠色「聽」本版不使用。
- `摸牌`（紅色 `N`）確認；再次按下會丟出摸進牌。
- 單人 2P 為你對一位電腦；單人 4P 為你對三位電腦，兩種模式都可直接開始。
- 136 張完整牌組；4P 初始為一位玩家加三位 AI，牌牆留下 83 張。
- 兩種模式都支援胡牌／流局、碰／吃／槓／過；4P 依下家、對家、上家順序輪流摸打。
- 摸進來的牌獨立顯示在手牌右側，不倒數、不自動消失。
- 手牌上方顯示 `A–M`；按字母直接打出對應手牌。
- 再按紅色 `摸牌` 會打出右側那張摸進來的牌；可暗槓或對家出牌可槓時按綠色 `槓`
  （`Left Ctrl`）。白鍵 `K` 仍是第 11 張手牌，不是槓牌鍵。
- 可胡牌／可自摸時，狀態列會以紅框提示應按 `胡`。
- 玩家與電腦的吃牌／碰牌牌組會固定顯示在各自手牌旁，但不再顯示「副露」或「吃牌／碰牌」文字。
- 按下有效的吃／自摸／槓／胡／碰動作會立即播放台灣中文語音。
- 2P 玩家與電腦各有一張 Q 版透明大頭圖；4P 三位 AI 都顯示不同的 Q 版頭像，玩家
  位於下方，對家在上方，左右為上家／下家。
- 遊戲畫面沒有 Web topbar、回首頁或全螢幕按鈕。
- 不處理滑鼠、觸控或搖桿；遊戲操作只走麻將鍵盤 HID。

白色手牌按鍵是 `A–M`（剛好 13 個位置）；`N` 是紅色「摸牌」的 HID code。
按 `N` 會依目前階段摸牌，若右側已有摸進牌則丟出該牌。綠色「槓」是
`Left Ctrl`；白鍵 `K` 平時只打出第 11 張手牌。

## 本機執行

在 repository 的 `retropie/` 目錄：

```bash
cd retropie
python3 -m python.mahjong --windowed --input-profile mahjong
python3 -m python.mahjong --headless --seed 20260901
python3 -m python.mahjong --headless --seed 20260901 --player-count 4
python3 -m python.mahjong.input_smoke
python3 -m unittest python.mahjong.test_engine
```

Windows 開發機若沒有 Pygame，仍可跑 headless、input smoke、unit tests；
畫面版要在 RetroPie 既有的 Pygame 1.9.4 環境執行。

## PNG 牌面資產

`assets/mahjong_tiles/` 保存 v1 版可供後續 Pygame 遊戲重複使用的完整牌資產：
34 種唯一牌面、牌背、`atlas-34.png` 與 `manifest.json`。目前遊戲預設使用
`assets/mahjong_tiles_v2/` 的 640×880 高解析牌面；若 v2 缺檔，程式會回退到
v1。遊戲會用 `app.py` 的檔案位置組成資產路徑，因此不依賴 launcher 的目前工作目錄。
`reference/mahjong-tile-style-reference-v1.png` 是依照原 Web 牌面風格產生的
ImageGen 視覺參考；正式遊戲 PNG 使用固定規則繪製，避免生成式文字失真。

`assets/voices/` 保存 `chi.wav`、`zimo.wav`、`gang.wav`、`hu.wav`、`pung.wav` 五段台灣中文語音；
`assets/avatars/` 保存 v1 原始高解析 Q 版角色圖，以及 v2 的透明邊界裁切版本。
遊戲使用 `player-v2.png`、`opponent-v2.png`、`opponent-scarlet-v2.png` 與
`opponent-jade-v2.png`，並保留 v1 作為回退與素材來源。4P 對家使用原本的藍髮
角色，左右兩位 AI 分別使用 scarlet 與 jade 新角色。
語音與角色圖都由遊戲程式位置組成絕對路徑載入，Pi 不需要即時 TTS、網路或 SVG。

`assets/fonts/NotoSansCJKtc-Regular.otf` 是目前隨遊戲附帶、優先使用的繁體中文字型；
`NotoSansCJKtc-Medium.otf` 保留為第二順位 fallback 與 A/B 比較。兩者都會在缺檔或
Pygame 無法載入時再回退到 Pi 的系統 CJK 字型；英文與數字仍使用 DejaVu Sans 以保持
混合文字寬度穩定。字型授權檔保存在同一資料夾的 `LICENSE`。

## 畫質實驗模式

目前 launcher 預設使用 `native-1080p`，直接以 1920×1080 畫布繪製。畫面程式
另外保留 `low-power` 與 `smoothscale` 兩個不改變遊戲規則的比較模式：

```text
./retropie/mahjong-arcade.sh --render-mode smoothscale --smoke-frames 3
./retropie/mahjong-arcade.sh --render-mode native-1080p --smoke-frames 3
```

`low-power` 維持 1280×720 邏輯版面並使用快速縮放；`smoothscale` 維持
1280×720 邏輯版面但改用高品質縮放；`native-1080p` 使用 1920×1080 畫布和
放大後的字型、牌面及座位座標直接繪製。

若要重新產生牌面，請在 repository 根目錄執行：

```text
python retropie/tools/generate_mahjong_tiles.py
```

要建立目前 native-1080p 使用的 v2 高解析牌面，執行：

```text
python retropie/tools/generate_mahjong_tiles.py --output retropie/assets/mahjong_tiles_v2 --scale 4 --asset-version v2
python retropie/tools/prepare_avatar_assets.py
```

## RetroPie launcher

將整個 repository 放到 Pi，例如：

```text
/home/pi/RetroPie/ports/mahjong-vite
```

再將 `retropie/mahjong-arcade.sh` 登錄到 Arcade。launcher 會固定使用：

```bash
python3 -m python.mahjong --fullscreen --render-mode native-1080p --fps 30 --input-profile mahjong
```

launcher 不帶固定玩家數；進入後首頁預設選取「單人 4P」，可用 `胡` 在 2P／4P
間切換，再按 `摸牌` 確認。`--player-count 4` 僅供 headless 測試，不會繞過街機首頁。

可使用 `retropie/mahjong-arcade-install.sh` 協助登錄 launcher 與
`gamelist.xml`；安裝腳本會把「KK麻將(2P/4P)」排在第一個、Video Poker
排在第二個，並同步本機 EmulationStation 常用的 gamelist 位置。

## 鍵盤對照

| 麻將鍵 | HID / Pygame key | 第一版用途 |
|---|---|---|
| 白鍵 `A–M` | `A`–`M` | 直接打出對應手牌（2P／4P 相同） |
| 紅色「胡」 | `Z` | 首頁切換模式；可胡時宣告胡牌 |
| 紅色「摸牌」 | `N` | 首頁確認；摸牌後再按則丟出摸進牌 |
| 綠色「槓」 | `Left Ctrl` | 暗槓／明槓，之後進入摸補牌 |
| 綠色「碰」 | `Left Alt` | 碰 |
| 綠色「吃」 | `Space` | 吃第一個可用順子 |
| 綠色「聽」 | `Left Shift` | 本版未使用 |
| 粉紅色「小」 | `Backspace` | 過 |
| 粉紅色「得分」 | `Right Ctrl` | 離開回 RetroPie |

黃色投幣、開始、押分、大、雙倍，以及未指定按鍵不會被遊戲誤當成
操作；這版不是 Video Poker，沒有下注流程。桌面診斷仍接受 `F7`／`Esc`，
但 RetroPie 畫面與實際操作請使用麻將鍵盤的「得分」離開。

## 參考與相容性

移植結構依照：

- `D:\Game\VideoPoker\RETROPIE_PI_MIGRATION.md`
- `D:\Game\VideoPoker\python\video_poker`

程式使用舊版 Pygame 相容寫法：圓角矩形有 fallback、中文字型優先使用隨附的
`NotoSansCJKtc-Regular.otf`，再回退到保留的 `NotoSansCJKtc-Medium.otf`、
`Droid Sans Fallback` / `Noto Sans CJK`，牌面優先載入 PNG，載入失敗才使用
程式文字 fallback，不依賴 SVG。
