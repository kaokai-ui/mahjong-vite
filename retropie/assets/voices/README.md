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
