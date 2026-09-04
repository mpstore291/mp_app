# Afgoer om SMBus-metoderne rent faktisk er implementeret i bundkortets firmware,
# eller om de blot staar i ASUS' generelle klassebeskrivelse uden at findes.
# Der laeses kun.
$out = Join-Path $env:TEMP "mp_rgb_probe.txt"
function Log($m) { Add-Content -Path $out -Value $m -Encoding UTF8 }
Set-Content -Path $out -Value "" -Encoding UTF8

$inst = @(Get-CimInstance -Namespace root/WMI -ClassName ASUSManagement -ErrorAction SilentlyContinue)[0]
if (-not $inst) { Log "Ingen instans"; exit }

function Try-Call($name, $callArgs) {
  try {
    $r = Invoke-CimMethod -InputObject $inst -MethodName $name -Arguments $callArgs -ErrorAction Stop
    $pairs = $r.PSObject.Properties |
      Where-Object { $_.Name -notmatch '^(PSComputerName|CimClass|CimInstanceProperties|CimSystemProperties)$' } |
      ForEach-Object { "$($_.Name)=$($_.Value)" }
    Log "$name -> OK : $($pairs -join ' ')"
  } catch {
    Log "$name -> AFVIST : $($_.Exception.Message.Trim())"
  }
}

Log "=== kendt fungerende metode som referencepunkt ==="
Try-Call 'GetFanPolicy' @{ FanType = [byte]0 }

Log "`n=== SMBus-metoder ==="
Try-Call 'read_smbus_byte'  @{ slave = [uint32]0x4E; cmd = [uint32]0x00 }
Try-Call 'read_smbus_word'  @{ slave = [uint32]0x4E; cmd = [uint32]0x00 }
Try-Call 'read_smbus_block' @{ slave = [uint32]0x4E; cmd = [uint32]0x00; count = [uint32]1 }

Log "`n=== andre generelle metoder ==="
Try-Call 'device_status' @{ device_id = [uint32]0 }
Try-Call 'GetLastError'  @{}

Log "FAERDIG"
