# RetroPie Mahjong voice assets

These are pre-rendered Taiwan Mandarin PCM WAV clips for immediate playback on
the Pi.  The current native scene uses them for the keyboard actions that are
already available:

- `chi.wav`: 吃
- `zimo.wav`: 自摸
- `gang.wav`: 槓（also registered in the sound bus for the Kong command path）
- `hu.wav`: 胡（discard win）
- `pung.wav`: 碰

The clips were generated with the Windows `Microsoft Hanhan Desktop`
`zh-TW` voice by `tools/generate_voice_assets.ps1`.  They are kept as files so
RetroPie does not need network access, a TTS package, or a Chinese voice
installed at runtime.  If the WAV cannot be loaded, the existing short tone
fallback remains active.

## Web and iOS pronunciation

The VocabularyKing reference project demonstrates an important browser
compatibility detail: iOS can play `speechSynthesis` when it is called from a
direct speaker-button gesture, after the voice list has been warmed. Mahjong
牌名則是在 Firebase/React 棄牌狀態更新後才發生，這不是使用者手勢；iOS
Safari 可能因此靜默忽略牌名的 `speechSynthesis`，即使手動例句按鈕仍然正常。

For that reason, Mahjong uses the bundled Taiwan Mandarin clips in `tiles/`
for all 34 tile types. `src/game-sound.ts` preloads them when the table becomes
visible, then plays the decoded buffers through the same unlocked `AudioContext`
used by 吃、碰、槓、胡 and 自摸. The first pointer/touch/keyboard interaction
unlocks that context. This keeps
automatic online/solo discard announcements independent of a new iOS gesture,
Siri voice availability, or a remote TTS request. Browser `speechSynthesis`
remains only as a fallback when a local clip or audio context is unavailable.

The web tile clips can be regenerated locally with
`local-admin/runtime/generate-tile-voice-assets.ps1`.
