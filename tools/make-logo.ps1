# Fjerner den sorte baggrund fra logoet, saa det kan ligge oven paa app-baggrunden.
# Pixels doemmes paa lysstyrke: helt moerke bliver gennemsigtige, lyse forbliver,
# og dem imellem faar delvis gennemsigtighed, saa kanterne ikke bliver takkede.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = (Get-Location).Path
$src = [System.Drawing.Bitmap]::new((Join-Path $root "assets\logo.png"))
$bmp = [System.Drawing.Bitmap]::new($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($src, 0, 0, $src.Width, $src.Height)
$g.Dispose()
$src.Dispose()

$rect = [System.Drawing.Rectangle]::new(0, 0, $bmp.Width, $bmp.Height)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$count = [Math]::Abs($data.Stride) * $bmp.Height
$bytes = New-Object byte[] $count
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $count)

$lower = 24    # under denne samlede lysstyrke regnes pixlen som baggrund
$upper = 80    # over denne bevares pixlen fuldt ud
$cleared = 0

for ($i = 0; $i -lt $count; $i += 4) {
  # Raekkefoelgen i hukommelsen er blaa, groen, roed, alfa.
  $sum = [int]$bytes[$i] + [int]$bytes[$i + 1] + [int]$bytes[$i + 2]

  if ($sum -le $lower) {
    $bytes[$i + 3] = 0
    $cleared++
  } elseif ($sum -lt $upper) {
    $bytes[$i + 3] = [byte][int](255 * ($sum - $lower) / ($upper - $lower))
  }
}

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $count)
$bmp.UnlockBits($data)
$bmp.Save((Join-Path $root "assets\logo.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$pct = [Math]::Round(100 * $cleared / ($count / 4), 1)
Write-Output "Gjorde $pct% af billedet gennemsigtigt"
