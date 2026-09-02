# Mahjong RetroPie 字型資產

`NotoSansCJKtc-Regular.otf` 是目前遊戲優先使用的 Noto Sans CJK Traditional Chinese
Regular 字型；`NotoSansCJKtc-Medium.otf` 仍保留在同一資料夾，作為第二順位 fallback
與 A/B 比較版本。`retropie/python/mahjong/app.py` 會先載入 Regular 繪製 CJK 文字；
若 Regular 不存在或 Pygame 無法載入，才嘗試 Medium，再回退到 RetroPie 系統字型。

目前資產大小：Regular `16,435,884` bytes；Medium `16,522,152` bytes。兩個檔案都已
部署至 Pi 的 `/home/pi/RetroPie/ports/mahjong-vite/retropie/assets/fonts/`，並保留同一份
`LICENSE`。目前 UI 已移除 Pygame 的 synthetic bold，會依照字型檔本身的實際字重繪製；
因此使用 Regular 時會呈現真正的 Regular 字重。

檔名中的 `TC` 代表繁體中文，`Regular` 與 `Medium` 代表不同字重，不代表 4K 解析度。
這次改用 Regular 是因為實機觀察 Medium 的筆畫視覺重量偏重。遊戲在
`native-1080p` 下直接於 1920×1080 畫布，以實際 UI 字級繪製文字；它改善的是中文字形
覆蓋、字重與低解析重新取樣問題，不會自動改變 HDMI 輸出解析度或電視的影像處理。
英文、數字及 A–M 操作標籤仍使用 DejaVu Sans，以保持混合文字的寬度穩定。

來源：

- https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf
- https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Medium.otf
- https://github.com/notofonts/noto-cjk/blob/main/Sans/README-third_party.md

授權：SIL Open Font License 1.1。完整授權文字請見本資料夾的 `LICENSE`；重新散佈時
請保留字型檔與授權檔。
