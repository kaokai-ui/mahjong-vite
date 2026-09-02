param(
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'assets\voices')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $synthesizer.SelectVoice('Microsoft Hanhan Desktop')
    $synthesizer.Rate = 0
    $synthesizer.Volume = 100
    $clips = @(
        [pscustomobject]@{ FileName = 'chi.wav'; Text = [char]0x5403 }
        [pscustomobject]@{ FileName = 'zimo.wav'; Text = [string]::Concat([char]0x81EA, [char]0x6478) }
        [pscustomobject]@{ FileName = 'gang.wav'; Text = [char]0x69D3 }
        [pscustomobject]@{ FileName = 'hu.wav'; Text = [char]0x80E1 }
        [pscustomobject]@{ FileName = 'pung.wav'; Text = [char]0x78B0 }
    )
    foreach ($clip in $clips) {
        $target = Join-Path $OutputDirectory $clip.FileName
        $synthesizer.SetOutputToWaveFile($target)
        $spokenText = [string]$clip.Text
        $synthesizer.Speak([string]$spokenText)
        $synthesizer.SetOutputToNull()
        Write-Output ('generated ' + $target)
    }
}
finally {
    $synthesizer.Dispose()
}
