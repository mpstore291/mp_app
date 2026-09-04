# Laver et 256x256 .ico ud fra det oprindelige lille icon.ico.
# Billedet skaleres op med bevaret forhold og centreres paa et gennemsigtigt kvadrat,
# saa det ikke bliver traukket skaevt.
param(
  [string]$Source = "assets\icon.ico",
  [string]$PreviewPath = "assets\icon-original.png",
  [string]$ScaledPreviewPath = "assets\icon-256.png",
  [string]$OutIco = "assets\icon-256.ico"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = (Get-Location).Path
$src = Join-Path $root $Source

$icon = New-Object System.Drawing.Icon($src)
$original = $icon.ToBitmap()
Write-Output "Original: $($original.Width)x$($original.Height)"
$original.Save((Join-Path $root $PreviewPath), [System.Drawing.Imaging.ImageFormat]::Png)

$size = 256
$canvas = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$scale = [Math]::Min($size / $original.Width, $size / $original.Height)
$w = [int][Math]::Round($original.Width * $scale)
$h = [int][Math]::Round($original.Height * $scale)
$g.DrawImage($original, [int](($size - $w) / 2), [int](($size - $h) / 2), $w, $h)
$g.Dispose()

$scaledPath = Join-Path $root $ScaledPreviewPath
$canvas.Save($scaledPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Pak PNG'en ind i en .ico-container (ICO understoetter PNG-data ved 256x256).
$png = [System.IO.File]::ReadAllBytes($scaledPath)
$stream = [System.IO.File]::Create((Join-Path $root $OutIco))
$writer = New-Object System.IO.BinaryWriter($stream)
$writer.Write([UInt16]0)      # reserveret
$writer.Write([UInt16]1)      # type 1 = ikon
$writer.Write([UInt16]1)      # antal billeder
$writer.Write([Byte]0)        # bredde 0 betyder 256
$writer.Write([Byte]0)        # hoejde 0 betyder 256
$writer.Write([Byte]0)        # ingen palet
$writer.Write([Byte]0)        # reserveret
$writer.Write([UInt16]1)      # farveplaner
$writer.Write([UInt16]32)     # bits pr. pixel
$writer.Write([UInt32]$png.Length)
$writer.Write([UInt32]22)     # offset til billeddata
$writer.Write($png)
$writer.Flush()
$writer.Dispose()
$stream.Dispose()

$canvas.Dispose()
$original.Dispose()
$icon.Dispose()

Write-Output "Skrev $OutIco ($((Get-Item (Join-Path $root $OutIco)).Length) bytes)"
