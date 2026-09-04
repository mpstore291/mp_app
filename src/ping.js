const { execFile } = require('child_process')
const net = require('net')

const HOSTNAME = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

function isValidTarget (host) {
  if (!host || host.length > 253) return false
  return net.isIP(host) !== 0 || HOSTNAME.test(host)
}

// ping.exe skriver i konsollens kodeside (cp850 på dansk Windows), som Node ikke
// kan afkode. Vi læser derfor tal ud af outputtet i stedet for at stole på teksten.
function parseOutput (output) {
  const times = []
  for (const line of output.split(/\r?\n/)) {
    if (!/TTL=/i.test(line)) continue
    const m = line.match(/[=<]\s*(\d+)\s*ms/i)
    if (m) times.push(Number(m[1]))
  }

  const summary = output.split(/\r?\n/).find(l => l.includes('%')) || ''
  const counts = [...summary.matchAll(/=\s*(\d+)/g)].map(m => Number(m[1]))
  const lossMatch = summary.match(/\((\d+)\s*%/)

  const [sent = 0, received = 0, lost = 0] = counts

  return {
    sent,
    received,
    lost,
    lossPct: lossMatch ? Number(lossMatch[1]) : (sent ? Math.round((lost / sent) * 100) : 100),
    times,
    min: times.length ? Math.min(...times) : null,
    max: times.length ? Math.max(...times) : null,
    avg: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null
  }
}

function ping (rawHost, count = 4) {
  const host = String(rawHost ?? '').trim()

  if (!isValidTarget(host)) {
    return Promise.resolve({
      ok: false,
      host,
      error: 'Ugyldig IP-adresse eller værtsnavn.'
    })
  }

  return new Promise(resolve => {
    execFile(
      'ping',
      ['-n', String(count), '-w', '3000', host],
      { encoding: 'buffer', timeout: 30000, windowsHide: true },
      (err, stdout, stderr) => {
        const output = Buffer.concat([stdout || Buffer.alloc(0), stderr || Buffer.alloc(0)]).toString('latin1')
        const stats = parseOutput(output)

        if (err && err.killed) {
          return resolve({ ok: false, host, error: 'Forespørgslen tog for lang tid (timeout).', ...stats })
        }
        if (stats.received === 0) {
          return resolve({ ok: false, host, error: `Intet svar fra ${host}.`, ...stats })
        }
        resolve({ ok: true, host, ...stats })
      }
    )
  })
}

module.exports = { ping, isValidTarget }
