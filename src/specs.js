const os = require('os')
const { runJson } = require('./powershell')

const SCRIPT = `
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$gpu = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })
$ram = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  [PSCustomObject]@{ size = $_.Capacity; speed = $_.ConfiguredClockSpeed }
})
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  [PSCustomObject]@{ letter = $_.DeviceID; size = $_.Size; free = $_.FreeSpace }
})
[PSCustomObject]@{
  osName        = $os.Caption
  osVersion     = "$($os.Version) (build $($os.BuildNumber))"
  installedOn   = $os.InstallDate.ToString("yyyy-MM-dd")
  lastBoot      = $os.LastBootUpTime.ToString("yyyy-MM-dd HH:mm")
  computerName  = $cs.Name
  manufacturer  = $cs.Manufacturer
  model         = $cs.Model
  motherboard   = "$($board.Manufacturer) $($board.Product)"
  biosVersion   = $bios.SMBIOSBIOSVersion
  cpuName       = $cpu.Name
  cpuCores      = $cpu.NumberOfCores
  cpuThreads    = $cpu.NumberOfLogicalProcessors
  cpuMaxClock   = $cpu.MaxClockSpeed
  totalRam      = $cs.TotalPhysicalMemory
  gpus          = $gpu
  ramSticks     = $ram
  disks         = $disks
} | ConvertTo-Json -Depth 5 -Compress
`

function formatBytes (bytes) {
  if (!bytes) return null
  const gb = Number(bytes) / 1024 ** 3
  return gb >= 1000 ? `${(gb / 1024).toFixed(2)} TB` : `${gb.toFixed(1)} GB`
}

async function getSpecs () {
  const raw = await runJson(SCRIPT, { timeout: 45000 })

  return {
    system: [
      ['Computernavn', raw.computerName],
      ['Producent', [raw.manufacturer, raw.model].filter(Boolean).join(' ')],
      ['Bundkort', raw.motherboard],
      ['BIOS', raw.biosVersion]
    ],
    os: [
      ['Styresystem', raw.osName],
      ['Version', raw.osVersion],
      ['Installeret', raw.installedOn],
      ['Sidst startet', raw.lastBoot],
      ['Oppetid', formatUptime(os.uptime())]
    ],
    cpu: [
      ['Processor', raw.cpuName],
      ['Kerner', `${raw.cpuCores} kerner / ${raw.cpuThreads} tråde`],
      ['Maks. hastighed', raw.cpuMaxClock ? `${(raw.cpuMaxClock / 1000).toFixed(2)} GHz` : null]
    ],
    memory: [
      ['Installeret RAM', formatBytes(raw.totalRam)],
      ['Ledig lige nu', formatBytes(os.freemem())],
      ['Moduler', (raw.ramSticks || []).map(s =>
        `${formatBytes(s.size)}${s.speed ? ` @ ${s.speed} MHz` : ''}`).join(', ')]
    ],
    gpu: (raw.gpus || []).map((name, i) => [`Grafikkort ${i + 1}`, name]),
    disks: (raw.disks || []).map(d => [
      `Drev ${d.letter}`,
      `${formatBytes(d.size - d.free)} brugt af ${formatBytes(d.size)} — ${formatBytes(d.free)} ledig`
    ])
  }
}

function formatUptime (seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d ? `${d} dage, ${h} t ${m} min` : `${h} t ${m} min`
}

module.exports = { getSpecs }
