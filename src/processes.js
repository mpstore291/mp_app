const { run } = require('./powershell')

// Processer som Windows ikke kan undvaere. Bliver de lukket, gaar maskinen ned
// eller genstarter af sig selv, saa de kan ikke afsluttes herfra.
const PROTECTED = new Set([
  'system', 'idle', 'registry', 'memory compression',
  'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'lsaiso',
  'fontdrvhost', 'dwm', 'sihost', 'ctfmon', 'svchost'
])

// PowerShell 5.1 laver et objekt i stedet for en liste ved ét element, saa
// JSON-listen bygges i haanden.
const LIST_SCRIPT = `
$items = New-Object System.Collections.ArrayList
foreach ($p in Get-Process -ErrorAction SilentlyContinue) {
  $cpu = 0
  try { if ($p.CPU) { $cpu = [math]::Round($p.CPU, 3) } } catch { }
  [void]$items.Add(([PSCustomObject]@{
    id     = $p.Id
    name   = $p.ProcessName
    cpu    = $cpu
    memory = [double]$p.WorkingSet64
    title  = $p.MainWindowTitle
  } | ConvertTo-Json -Compress))
}
"[" + ($items -join ",") + "]"
`

async function list () {
  const out = await run(LIST_SCRIPT, { timeout: 30000 })
  const processes = JSON.parse(out.trim() || '[]')

  return processes
    .filter(p => p.id > 4)
    .map(p => ({
      ...p,
      title: p.title || null,
      protected: PROTECTED.has(String(p.name).toLowerCase())
    }))
}

async function kill (id, name) {
  if (PROTECTED.has(String(name).toLowerCase())) {
    return { ok: false, error: `${name} er en del af Windows og kan ikke afsluttes herfra.` }
  }

  const pid = Number(id)
  if (!Number.isInteger(pid) || pid <= 4) {
    return { ok: false, error: 'Ugyldigt proces-nummer.' }
  }

  try {
    await run(`Stop-Process -Id ${pid} -Force -ErrorAction Stop`, { timeout: 15000 })
    return { ok: true }
  } catch (err) {
    const denied = /Access is denied|adgang|denied/i.test(err.message)
    return {
      ok: false,
      error: denied
        ? `${name} kører med højere rettigheder end appen, så den kan ikke lukkes herfra.`
        : err.message.split('\n')[0]
    }
  }
}

module.exports = { list, kill }
