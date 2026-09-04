const { execFile } = require('child_process')

// PowerShell skriver som standard i konsollens kodeside, hvilket oedelaegger danske
// tegn. Foerste linje tvinger UTF-8, saa JSON kan laeses paalideligt.
const PREFIX = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ProgressPreference="SilentlyContinue"; '

function run (script, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PREFIX + script],
      { encoding: 'utf8', timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err && !stdout) return reject(new Error(stderr.trim() || err.message))
        resolve(stdout)
      }
    )
  })
}

async function runJson (script, options) {
  const out = (await run(script, options)).trim()
  if (!out) return null
  try {
    return JSON.parse(out)
  } catch {
    throw new Error(`Uventet svar fra systemet: ${out.slice(0, 200)}`)
  }
}

module.exports = { run, runJson }
