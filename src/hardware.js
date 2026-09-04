const os = require('os')
const { execFile } = require('child_process')
const { runJson } = require('./powershell')

const FIELDS = [
  'name',
  'temperature.gpu',
  'fan.speed',
  'utilization.gpu',
  'memory.used',
  'memory.total',
  'power.draw',
  'power.limit',
  'clocks.current.graphics'
]

// nvidia-smi foelger med NVIDIA-driveren og ligger allerede paa maskinen.
function readGpu () {
  return new Promise(resolve => {
    execFile(
      'nvidia-smi',
      [`--query-gpu=${FIELDS.join(',')}`, '--format=csv,noheader,nounits'],
      { encoding: 'utf8', timeout: 10000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          return resolve({
            available: false,
            reason: err.code === 'ENOENT'
              ? 'Fandt ikke nvidia-smi. Det følger med NVIDIA-driveren, så det tyder på et AMD- eller Intel-grafikkort.'
              : `Kunne ikke læse grafikkortet: ${err.message}`
          })
        }

        const cards = stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
          const [name, temp, fan, load, memUsed, memTotal, power, powerLimit, clock] =
            line.split(',').map(v => v.trim())
          const num = v => (v === '[N/A]' || v === '' ? null : Number(v))

          return {
            name,
            temp: num(temp),
            fan: num(fan),
            load: num(load),
            memUsed: num(memUsed),
            memTotal: num(memTotal),
            power: num(power),
            powerLimit: num(powerLimit),
            clock: num(clock)
          }
        })

        resolve({ available: true, cards })
      }
    )
  })
}

// ACPI-termozonerne er de eneste temperaturer Windows udleverer uden en kernedriver.
// De maaler paa bundkortet, ikke inde i selve processorkernerne.
const SYSTEM_SCRIPT = `
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$cores = @(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor |
  Where-Object { $_.Name -ne '_Total' } |
  Sort-Object { [int]$_.Name } |
  ForEach-Object { [int]$_.PercentProcessorTime })
$zones = @(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue |
  ForEach-Object { [PSCustomObject]@{ name = $_.Name; deciKelvin = [double]$_.HighPrecisionTemperature } })
# CurrentClockSpeed melder bare basisfrekvensen. Den faktiske frekvens findes ved at
# gange basis med hvor mange procent af sin ydeevne processoren koerer paa lige nu.
$perf = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1
[PSCustomObject]@{
  load     = $cpu.LoadPercentage
  perfPct  = $perf.PercentProcessorPerformance
  baseClock= $cpu.MaxClockSpeed
  cores    = $cores
  zones    = $zones
} | ConvertTo-Json -Depth 4 -Compress
`

function tidyZoneName (name) {
  const short = String(name).replace(/^\\?_TZ\./, '').replace(/_/g, ' ').trim()
  return `Termozone ${short}`
}

async function readSystem () {
  try {
    const raw = await runJson(SYSTEM_SCRIPT, { timeout: 20000 })
    const cores = raw.cores || []

    return {
      // LoadPercentage er upaalidelig og kommer tit tom tilbage, saa kernerne bruges
      // som reserve.
      load: raw.load ?? (cores.length
        ? Math.round(cores.reduce((a, b) => a + b, 0) / cores.length)
        : null),
      clock: raw.perfPct && raw.baseClock
        ? Math.round(raw.baseClock * raw.perfPct / 100)
        : null,
      maxClock: raw.baseClock ?? null,
      cores,
      zones: (raw.zones || [])
        .map(z => ({ name: tidyZoneName(z.name), temp: Math.round((z.deciKelvin / 10 - 273.15) * 10) / 10 }))
        // Nogle maskiner melder tomme zoner ind med urealistiske vaerdier.
        .filter(z => z.temp > 0 && z.temp < 130)
    }
  } catch {
    return { load: null, clock: null, maxClock: null, cores: [], zones: [] }
  }
}

async function getStatus () {
  const [gpu, system] = await Promise.all([readGpu(), readSystem()])

  return {
    gpu,
    zones: system.zones,
    cpu: {
      name: os.cpus()[0]?.model?.trim() || 'Ukendt processor',
      cores: system.cores,
      coreCount: os.cpus().length,
      load: system.load,
      clock: system.clock,
      maxClock: system.maxClock
    },
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      usedPct: Math.round((1 - os.freemem() / os.totalmem()) * 100)
    }
  }
}

module.exports = { getStatus }
