const fs = require('fs')
const os = require('os')
const path = require('path')
const { run } = require('./powershell')

const WORK_DIR = path.join(os.tmpdir(), 'mp_functions')
const JOB_FILE = path.join(WORK_DIR, 'fan-job.json')
const RESULT_FILE = path.join(WORK_DIR, 'fan-result.json')
const SCRIPT_FILE = path.join(WORK_DIR, 'fan-helper.ps1')

const FAN_NAMES = { 0: 'CPU-blæser', 1: 'Kabinetblæser 1', 2: 'Kabinetblæser 2', 3: 'Kabinetblæser 3' }

// Bundkortets graenseflade svarer kun paa en haevet proces, saa alt arbejde sker i
// dette hjaelpescript, der startes med UAC-boks.
const HELPER = `
$ErrorActionPreference = "Stop"
$result = @{ ok = $false; fans = @(); error = $null }
try {
  $job = Get-Content "__JOB__" -Raw | ConvertFrom-Json
  $inst = @(Get-CimInstance -Namespace root/WMI -ClassName ASUSManagement -ErrorAction Stop)[0]
  if (-not $inst) { throw "Bundkortet svarer ikke paa ASUSManagement." }

  if ($job.action -eq "write") {
    foreach ($fan in $job.fans) {
      $args = @{
        FanType  = [byte]$fan.type
        Mode     = [string]$fan.mode
        LowTemp  = [byte]$fan.lowTemp;  LowDuty  = [byte]$fan.lowDuty
        MidTemp  = [byte]$fan.midTemp;  MidDuty  = [byte]$fan.midDuty
        HighTemp = [byte]$fan.highTemp; HighDuty = [byte]$fan.highDuty
      }
      $r = Invoke-CimMethod -InputObject $inst -MethodName SetManualFanCurve -Arguments $args
      if ($r.ErrorCode -ne 0) { throw "Blaeser $($fan.type) afviste kurven (fejlkode $($r.ErrorCode))." }
    }
  }

  foreach ($type in 0..3) {
    $p = Invoke-CimMethod -InputObject $inst -MethodName GetFanPolicy -Arguments @{ FanType = [byte]$type }
    if ($p.ErrorCode -ne 0) { continue }
    $entry = @{
      type = $type; mode = $p.Mode; profile = $p.Profile
      source = $p.Source; lowLimit = $p.LowLimit; curve = $null
    }
    $c = Invoke-CimMethod -InputObject $inst -MethodName GetManualFanCurve -Arguments @{ FanType = [byte]$type; Mode = $p.Mode }
    if ($c.ErrorCode -eq 0) {
      $entry.curve = @{
        lowTemp = [int]$c.LowTemp;  lowDuty = [int]$c.LowDuty
        midTemp = [int]$c.MidTemp;  midDuty = [int]$c.MidDuty
        highTemp = [int]$c.HighTemp; highDuty = [int]$c.HighDuty
      }
    }
    $result.fans += $entry
  }
  $result.ok = $true
} catch {
  $result.error = $_.Exception.Message
}
$result | ConvertTo-Json -Depth 6 | Set-Content "__RESULT__" -Encoding UTF8
`

// Sikkerhedsnet: en kurve der lader blaeseren staa stille naar det bliver varmt kan
// koge maskinen. Derfor haandhaeves stigende punkter og et gulv paa 20 procent.
function sanitiseCurve (fan) {
  const clampTemp = v => Math.min(90, Math.max(20, Math.round(Number(v) || 0)))
  const clampDuty = v => Math.min(100, Math.max(20, Math.round(Number(v) || 0)))

  const lowTemp = clampTemp(fan.lowTemp)
  const midTemp = Math.max(lowTemp + 1, clampTemp(fan.midTemp))
  const highTemp = Math.max(midTemp + 1, clampTemp(fan.highTemp))

  const lowDuty = clampDuty(fan.lowDuty)
  const midDuty = Math.max(lowDuty, clampDuty(fan.midDuty))
  const highDuty = Math.max(midDuty, clampDuty(fan.highDuty))

  return {
    type: Number(fan.type),
    mode: fan.mode === 'DC' ? 'DC' : 'PWM',
    lowTemp, lowDuty, midTemp, midDuty, highTemp, highDuty
  }
}

async function runHelper (job) {
  fs.mkdirSync(WORK_DIR, { recursive: true })
  fs.rmSync(RESULT_FILE, { force: true })
  fs.writeFileSync(JOB_FILE, JSON.stringify(job), 'utf8')
  fs.writeFileSync(SCRIPT_FILE, HELPER.replace('__JOB__', JOB_FILE).replace('__RESULT__', RESULT_FILE), 'utf8')

  try {
    await run(
      `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${SCRIPT_FILE}'`,
      { timeout: 120000 }
    )
  } catch (err) {
    if (/cancel|annull|afbrudt/i.test(err.message)) {
      return { ok: false, error: 'Du afviste administratoradgang. Blæserne kan kun læses og ændres med den.' }
    }
    return { ok: false, error: err.message }
  }

  if (!fs.existsSync(RESULT_FILE)) {
    return { ok: false, error: 'Hjælpeprogrammet gav intet svar tilbage.' }
  }

  // PowerShell skriver et byte-order-maerke forrest, som JSON.parse ikke accepterer.
  const result = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8').replace(/^\uFEFF/, ''))
  if (result.fans) {
    result.fans = result.fans.map(f => ({ ...f, name: FAN_NAMES[f.type] || `Blæser ${f.type}` }))
  }
  return result
}

const read = () => runHelper({ action: 'read' })
const write = fans => runHelper({ action: 'write', fans: fans.map(sanitiseCurve) })

module.exports = { read, write, sanitiseCurve }
