const fs = require('fs')
const os = require('os')
const path = require('path')
const { run } = require('./powershell')

const WORK_DIR = path.join(os.tmpdir(), 'mp_functions')
const LOG_FILE = path.join(WORK_DIR, 'update-log.txt')
const IDS_FILE = path.join(WORK_DIR, 'update-ids.txt')
const SCRIPT_FILE = path.join(WORK_DIR, 'install-updates.ps1')

// PowerShell 5.1 laver et objekt i stedet for en liste, naar der kun er ét element.
// Derfor bygges JSON-listen i haanden.
const SEARCH_SCRIPT = `
$session = New-Object -ComObject Microsoft.Update.Session
$searcher = $session.CreateUpdateSearcher()
$searcher.Online = $true
$items = New-Object System.Collections.ArrayList
foreach ($kind in @('Software','Driver')) {
  try { $found = $searcher.Search("IsInstalled=0 and IsHidden=0 and Type='$kind'") } catch { continue }
  foreach ($u in $found.Updates) {
    [void]$items.Add(([PSCustomObject]@{
      id       = $u.Identity.UpdateID
      title    = $u.Title
      kind     = $kind
      size     = [double]$u.MaxDownloadSize
      severity = $u.MsrcSeverity
      kb       = (@($u.KBArticleIDs) -join ', ')
    } | ConvertTo-Json -Compress))
  }
}
"[" + ($items -join ",") + "]"
`

// Koeres haevet. Henter og installerer de valgte opdateringer og skriver undervejs
// til logfilen, saa appen kan foelge med udefra.
const INSTALL_SCRIPT = `
$ErrorActionPreference = "Stop"
$log = "__LOG__"
function Write-Log($msg) { Add-Content -Path $log -Value $msg -Encoding UTF8 }
try {
  $wanted = @(Get-Content "__IDS__" | Where-Object { $_ })
  Write-Log "Soeger efter de valgte opdateringer..."
  $session = New-Object -ComObject Microsoft.Update.Session
  $searcher = $session.CreateUpdateSearcher()
  $coll = New-Object -ComObject Microsoft.Update.UpdateColl
  foreach ($kind in @('Software','Driver')) {
    try { $found = $searcher.Search("IsInstalled=0 and IsHidden=0 and Type='$kind'") } catch { continue }
    foreach ($u in $found.Updates) {
      if ($wanted -contains $u.Identity.UpdateID) {
        if (-not $u.EulaAccepted) { $u.AcceptEula() }
        [void]$coll.Add($u)
        Write-Log "Valgt: $($u.Title)"
      }
    }
  }
  if ($coll.Count -eq 0) { Write-Log "Ingen af opdateringerne kunne findes laengere."; Write-Log "DONE"; exit }

  Write-Log "Henter $($coll.Count) opdatering(er)..."
  $downloader = $session.CreateUpdateDownloader()
  $downloader.Updates = $coll
  $null = $downloader.Download()

  Write-Log "Installerer..."
  $installer = $session.CreateUpdateInstaller()
  $installer.Updates = $coll
  $result = $installer.Install()

  for ($i = 0; $i -lt $coll.Count; $i++) {
    $code = $result.GetUpdateResult($i).ResultCode
    $status = switch ($code) { 2 { "OK" } 3 { "OK med advarsler" } default { "Fejlede (kode $code)" } }
    Write-Log "$status - $($coll.Item($i).Title)"
  }
  if ($result.RebootRequired) { Write-Log "REBOOT" }
  Write-Log "DONE"
} catch {
  Write-Log "FEJL: $($_.Exception.Message)"
  Write-Log "DONE"
}
`

async function scan () {
  const out = await run(SEARCH_SCRIPT, { timeout: 300000 })
  const updates = JSON.parse(out.trim() || '[]')
  return updates.map(u => ({
    ...u,
    sizeMb: u.size ? Math.round(u.size / 1024 / 1024) : null
  }))
}

function startInstall (ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Ingen opdateringer valgt.')
  }

  fs.mkdirSync(WORK_DIR, { recursive: true })
  fs.writeFileSync(LOG_FILE, '', 'utf8')
  fs.writeFileSync(IDS_FILE, ids.join('\n'), 'utf8')
  fs.writeFileSync(
    SCRIPT_FILE,
    INSTALL_SCRIPT.replace('__LOG__', LOG_FILE).replace('__IDS__', IDS_FILE),
    'utf8'
  )

  // Start-Process med -Verb RunAs udloeser Windows' UAC-boks. Brugeren skal sige ja,
  // ellers sker der ingenting - vi kan ikke omgaa den, og det er meningen.
  const launcher = `Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${SCRIPT_FILE}'`
  return run(launcher, { timeout: 120000 })
    .then(() => ({ started: true }))
    .catch(err => {
      const denied = /cancel|annull|afbrudt|The operation was canceled/i.test(err.message)
      throw new Error(denied
        ? 'Du afviste administratoradgang, så installationen blev ikke startet.'
        : err.message)
    })
}

function readProgress () {
  if (!fs.existsSync(LOG_FILE)) return { lines: [], done: false, reboot: false }

  const lines = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).filter(Boolean)
  return {
    lines: lines.filter(l => l !== 'DONE' && l !== 'REBOOT'),
    done: lines.includes('DONE'),
    reboot: lines.includes('REBOOT')
  }
}

module.exports = { scan, startInstall, readProgress }
