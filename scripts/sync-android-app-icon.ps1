param(
    [string]$SourceImage = "D:\Game\Mahjong-vite\assets\app-icons\android\icon-1024.jpg",
    [string]$AndroidResDir = "D:\Game\Mahjong-vite\android-solo-offline\app\src\main\res"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-ArgbBitmap {
    param([int]$Size)
    return [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Set-HighQualityGraphics {
    param([System.Drawing.Graphics]$Graphics)
    $Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
}

function Save-SquareIcon {
    param(
        [System.Drawing.Bitmap]$SourceBitmap,
        [int]$Size,
        [string]$OutputPath
    )

    $bitmap = New-ArgbBitmap -Size $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        Set-HighQualityGraphics -Graphics $graphics
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($SourceBitmap, [System.Drawing.Rectangle]::new(0, 0, $Size, $Size))
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Save-RoundIcon {
    param(
        [System.Drawing.Bitmap]$SourceBitmap,
        [int]$Size,
        [string]$OutputPath
    )

    $bitmap = New-ArgbBitmap -Size $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    try {
        Set-HighQualityGraphics -Graphics $graphics
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $path.AddEllipse(0, 0, $Size, $Size)
        $graphics.SetClip($path)
        $graphics.DrawImage($SourceBitmap, [System.Drawing.Rectangle]::new(0, 0, $Size, $Size))
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $path.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Save-AdaptiveForegroundIcon {
    param(
        [System.Drawing.Bitmap]$SourceBitmap,
        [int]$Size,
        [string]$OutputPath
    )

    $bitmap = New-ArgbBitmap -Size $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        Set-HighQualityGraphics -Graphics $graphics
        $graphics.Clear([System.Drawing.Color]::Transparent)

        # Keep a small safe inset so adaptive masks do not crop the artwork aggressively.
        $scaledSize = [int][Math]::Round($Size * 0.82)
        $offset = [int][Math]::Round(($Size - $scaledSize) / 2)
        $graphics.DrawImage($SourceBitmap, [System.Drawing.Rectangle]::new($offset, $offset, $scaledSize, $scaledSize))

        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Get-AverageCornerColor {
    param([System.Drawing.Bitmap]$SourceBitmap)

    $points = @(
        @{ X = 0; Y = 0 },
        @{ X = $SourceBitmap.Width - 1; Y = 0 },
        @{ X = 0; Y = $SourceBitmap.Height - 1 },
        @{ X = $SourceBitmap.Width - 1; Y = $SourceBitmap.Height - 1 }
    )

    $red = 0
    $green = 0
    $blue = 0

    foreach ($point in $points) {
        $color = $SourceBitmap.GetPixel($point.X, $point.Y)
        $red += $color.R
        $green += $color.G
        $blue += $color.B
    }

    $count = [double]$points.Count
    return [System.Drawing.Color]::FromArgb(
        255,
        [int][Math]::Round($red / $count),
        [int][Math]::Round($green / $count),
        [int][Math]::Round($blue / $count)
    )
}

$resolvedSourceImage = (Resolve-Path -LiteralPath $SourceImage).Path
$resolvedAndroidResDir = (Resolve-Path -LiteralPath $AndroidResDir).Path

$sourceBitmap = [System.Drawing.Bitmap]::FromFile($resolvedSourceImage)

try {
    $densitySpecs = @(
        @{ Bucket = "mdpi"; IconSize = 48; ForegroundSize = 108 },
        @{ Bucket = "hdpi"; IconSize = 72; ForegroundSize = 162 },
        @{ Bucket = "xhdpi"; IconSize = 96; ForegroundSize = 216 },
        @{ Bucket = "xxhdpi"; IconSize = 144; ForegroundSize = 324 },
        @{ Bucket = "xxxhdpi"; IconSize = 192; ForegroundSize = 432 }
    )

    foreach ($spec in $densitySpecs) {
        $mipmapDir = Join-Path $resolvedAndroidResDir "mipmap-$($spec.Bucket)"
        New-Item -ItemType Directory -Force -Path $mipmapDir | Out-Null

        Save-SquareIcon -SourceBitmap $sourceBitmap -Size $spec.IconSize -OutputPath (Join-Path $mipmapDir "ic_launcher.png")
        Save-RoundIcon -SourceBitmap $sourceBitmap -Size $spec.IconSize -OutputPath (Join-Path $mipmapDir "ic_launcher_round.png")
        Save-AdaptiveForegroundIcon -SourceBitmap $sourceBitmap -Size $spec.ForegroundSize -OutputPath (Join-Path $mipmapDir "ic_launcher_foreground.png")
    }

    $backgroundColor = Get-AverageCornerColor -SourceBitmap $sourceBitmap
    $backgroundHex = "#{0:X2}{1:X2}{2:X2}" -f $backgroundColor.R, $backgroundColor.G, $backgroundColor.B
    $backgroundXml = @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$backgroundHex</color>
</resources>
"@
    $backgroundXmlPath = Join-Path $resolvedAndroidResDir "values\ic_launcher_background.xml"
    Set-Content -LiteralPath $backgroundXmlPath -Value $backgroundXml -Encoding UTF8

    Write-Host "Synced Android app icons from $resolvedSourceImage"
    Write-Host "Adaptive icon background color: $backgroundHex"
}
finally {
    $sourceBitmap.Dispose()
}
