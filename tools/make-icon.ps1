# Laver app-ikonet ud fra assets\logo.png.
# Logoet er bredt (pentagon + "STORE"-tekst), men Windows-ikoner skal vaere kvadratiske.
# Derfor beskaeres der om selve pentagon-maerket, som er den genkendelige del i smaa stoerrelser.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = (Get-Location).Path
$logo = [System.Drawing.Bitmap]::new((Join-Path $root "assets\logo.png"))
Write-Output "Kilde: $($logo.Width)x$($logo.Height)"

# Find pentagonens afgraensning ved at lede efter ikke-sorte pixels i den oeverste del
# af billedet. Der scannes paa en nedskaleret kopi, saa det gaar hurtigt.
$sw = 200
$sh = [int]($logo.Height * $sw / $logo.Width)
$small = [System.Drawing.Bitmap]::new($logo, $sw, $sh)
$cutoff = [int]($sh * 0.72)   # under denne linje ligger "STORE"-teksten

$minX = $sw; $maxX = 0; $minY = $sh; $maxY = 0
for ($y = 0; $y -lt $cutoff; $y++) {
  for ($x = 0; $x -lt $sw; $x++) {
    $p = $small.GetPixel($x, $y)
    if (($p.R + $p.G + $p.B) -gt 90) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
# Find ogsaa hvor "STORE"-teksten begynder, saa udsnittet kan stoppe lige over den.
$storeTop = $sh
for ($y = $maxY + 2; $y -lt $sh; $y++) {
  $hit = $false
  for ($x = 0; $x -lt $sw; $x++) {
    $p = $small.GetPixel($x, $y)
    if (($p.R + $p.G + $p.B) -gt 90) { $hit = $true; break }
  }
  if ($hit) { $storeTop = $y; break }
}
$small.Dispose()

$scale = $logo.Width / $sw
$storeTopPx = $storeTop * $scale
$bx = $minX * $scale; $by = $minY * $scale
$bw = ($maxX - $minX + 1) * $scale; $bh = ($maxY - $minY + 1) * $scale
Write-Output "Pentagon fundet: $([int]$bx),$([int]$by) $([int]$bw)x$([int]$bh)"

# Kvadratisk udsnit centreret om maerket, med lidt luft omkring. Siden begraenses,
# saa bunden af udsnittet holder sig over "STORE"-teksten.
$cx = $bx + $bw / 2
$cy = $by + $bh / 2
$maxSide = 2 * (($storeTopPx - 8) - $cy)
$side = [Math]::Min([Math]::Max($bw, $bh) * 1.18, $maxSide)
Write-Output "Udsnit: side $([int]$side) (loft paa $([int]$maxSide) pga. STORE-tekst ved y=$([int]$storeTopPx))"
$srcRect = [System.Drawing.RectangleF]::new($cx - $side / 2, $cy - $side / 2, $side, $side)

function New-Square([int]$size) {
  $bmp = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($logo, [System.Drawing.RectangleF]::new(0, 0, $size, $size), $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  return $bmp
}

# Gem en 256px PNG til brug i selve brugerfladen.
$preview = New-Square 256
$preview.Save((Join-Path $root "assets\icon-256.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$preview.Dispose()

# Byg en .ico med flere stoerrelser, saa den ser skarp ud baade i proceslinjen og i stifinderen.
$sizes = @(256, 128, 64, 48, 32, 16)
$blobs = @()
foreach ($s in $sizes) {
  $bmp = New-Square $s
  $ms = [System.IO.MemoryStream]::new()
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $blobs += , $ms.ToArray()
  $ms.Dispose(); $bmp.Dispose()
}

$out = [System.IO.File]::Create((Join-Path $root "assets\icon.ico"))
$w = [System.IO.BinaryWriter]::new($out)
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
  $w.Write([Byte]$dim); $w.Write([Byte]$dim)
  $w.Write([Byte]0); $w.Write([Byte]0)
  $w.Write([UInt16]1); $w.Write([UInt16]32)
  $w.Write([UInt32]$blobs[$i].Length)
  $w.Write([UInt32]$offset)
  $offset += $blobs[$i].Length
}
foreach ($blob in $blobs) { $w.Write($blob) }
$w.Flush(); $w.Dispose(); $out.Dispose()
$logo.Dispose()

Write-Output "Skrev assets\icon.ico med stoerrelserne $($sizes -join ', ')"
