# Laeser blaeserindstillingerne ud af bundkortets ASUSManagement-graenseflade.
# Der skrives intet - kun Get-metoder kaldes.
$out = Join-Path $env:TEMP "mp_asus_probe.txt"
function Log($m) { Add-Content -Path $out -Value $m -Encoding UTF8 }
Set-Content -Path $out -Value "" -Encoding UTF8

$inst = @(Get-CimInstance -Namespace root/WMI -ClassName ASUSManagement -ErrorAction SilentlyContinue)[0]
if (-not $inst) { Log "Ingen instans"; exit }

foreach ($type in 0..7) {
  try {
    $p = Invoke-CimMethod -InputObject $inst -MethodName GetFanPolicy -Arguments @{ FanType = [byte]$type } -ErrorAction Stop
    if ($p.ErrorCode -ne 0) { Log "FanType $type -> fejlkode $($p.ErrorCode)"; continue }
    Log "FanType $type -> Mode='$($p.Mode)' Profile='$($p.Profile)' Source='$($p.Source)' LowLimit=$($p.LowLimit)"

    try {
      $c = Invoke-CimMethod -InputObject $inst -MethodName GetManualFanCurve -Arguments @{ FanType = [byte]$type; Mode = $p.Mode } -ErrorAction Stop
      if ($c.ErrorCode -eq 0) {
        Log "    kurve: $($c.LowTemp)C=$($c.LowDuty)%  $($c.MidTemp)C=$($c.MidDuty)%  $($c.HighTemp)C=$($c.HighDuty)%"
      } else { Log "    kurve: fejlkode $($c.ErrorCode)" }
    } catch { Log "    kurve fejlede: $($_.Exception.Message)" }
  } catch {
    Log "FanType $type -> $($_.Exception.Message)"
  }
}

Log "FAERDIG"
