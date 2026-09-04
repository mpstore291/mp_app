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

async function readCpu () {
  try {
    const load = await runJson('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average | ConvertTo-Json', { timeout: 15000 })
    return { load: typeof load === 'number' ? load : null }
  } catch {
    return { load: null }
  }
}

async function getStatus () {
  const [gpu, cpu] = await Promise.all([readGpu(), readCpu()])

  return {
    gpu,
    cpu: {
      name: os.cpus()[0]?.model?.trim() || 'Ukendt processor',
      cores: os.cpus().length,
      load: cpu.load
    },
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      usedPct: Math.round((1 - os.freemem() / os.totalmem()) * 100)
    }
  }
}

module.exports = { getStatus }
