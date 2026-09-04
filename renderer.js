const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = String(text)
  return node
}

/* ---------- Startskaerm ---------- */

const splash = document.getElementById('splash')
const splashText = document.getElementById('splash-text')

let splashDone = false
function finishSplash () {
  if (splashDone) return
  splashDone = true
  splash.classList.add('done')
  document.getElementById('app').classList.remove('hidden')
  setTimeout(() => splash.remove(), 600)
}

window.mp.onStartupStatus(({ stage, text }) => {
  splashText.textContent = text
  if (stage === 'ready') setTimeout(finishSplash, 700)
})

// Hvis opdateringstjekket hverken svarer eller fejler, maa appen ikke haenge fast
// paa startskaermen.
setTimeout(finishSplash, 12000)

/* ---------- Vinduesknapper ---------- */

document.getElementById('win-min').onclick = () => window.mp.window.minimize()
document.getElementById('win-max').onclick = () => window.mp.window.maximize()
document.getElementById('win-close').onclick = () => window.mp.window.close()
window.mp.window.onState(max => {
  document.getElementById('win-max').textContent = max ? '❐' : '▢'
})

/* ---------- Navigation ---------- */

const TITLES = {
  menu: 'MP_Functions',
  pc: 'PC',
  specs: 'PC › Specs',
  updates: 'PC › Updates',
  temps: 'PC › Temperaturer',
  fans: 'PC › Fan Control',
  rgb: 'PC › RGB',
  tools: 'Tools',
  ping: 'Tools › IP Ping',
  fivem: 'Tools › FiveM'
}

const backButton = document.getElementById('back')
const history = []

function show (name) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.dataset.view === name)
  })
  document.getElementById('titlebar-title').textContent = TITLES[name] || 'MP_Functions'
  backButton.classList.toggle('hidden', history.length === 0)
  document.getElementById('app').scrollTop = 0

  if (name === 'specs') loadSpecs()
  if (name === 'rgb') loadRgb()
  if (name === 'fans') checkFanSupport()
  name === 'temps' ? startTemps() : stopTemps()
}

function goto (name) {
  history.push(currentView())
  show(name)
}

function currentView () {
  return document.querySelector('.view.active').dataset.view
}

document.querySelectorAll('[data-goto]').forEach(button => {
  button.onclick = () => goto(button.dataset.goto)
})

backButton.onclick = () => {
  const previous = history.pop()
  if (previous) show(previous)
}

/* ---------- Specs ---------- */

const GROUPS = [
  ['system', 'System'],
  ['os', 'Styresystem'],
  ['cpu', 'Processor'],
  ['memory', 'Hukommelse'],
  ['gpu', 'Grafik'],
  ['disks', 'Lagerplads']
]

let specsLoaded = false
async function loadSpecs () {
  if (specsLoaded) return
  const body = document.getElementById('specs-body')

  try {
    const specs = await window.mp.specs()
    body.replaceChildren()

    for (const [key, label] of GROUPS) {
      const rows = (specs[key] || []).filter(([, value]) => value)
      if (!rows.length) continue

      const group = el('div', 'spec-group')
      group.append(el('h3', null, label))
      for (const [name, value] of rows) {
        const row = el('div', 'spec-row')
        row.append(el('div', 'spec-key', name), el('div', 'spec-val', value))
        group.append(row)
      }
      body.append(group)
    }
    specsLoaded = true
  } catch (err) {
    body.replaceChildren(el('p', 'muted', `Kunne ikke hente systemoplysninger: ${err.message}`))
  }
}

/* ---------- Temperaturer og belastning ---------- */

const tempsBody = document.getElementById('temps-body')
let tempsTimer = null

function startTemps () {
  if (tempsTimer) return
  refreshTemps()
  tempsTimer = setInterval(refreshTemps, 2000)
}

function stopTemps () {
  clearInterval(tempsTimer)
  tempsTimer = null
}

// Gron under 60 grader, gul op til 80, roed derover.
function tempColor (celsius) {
  if (celsius === null) return 'var(--text-dim)'
  if (celsius < 60) return 'var(--ok)'
  if (celsius < 80) return '#d9a441'
  return 'var(--error)'
}

function gauge (label, value, max, suffix, color) {
  const wrap = el('div', 'gauge')
  const head = el('div', 'gauge-head')
  head.append(el('span', null, label), el('span', 'gauge-value', value === null ? '–' : `${value}${suffix}`))

  const track = el('div', 'gauge-track')
  const fill = el('div', 'gauge-fill')
  fill.style.width = `${Math.min(100, Math.max(0, ((value ?? 0) / max) * 100))}%`
  if (color) fill.style.background = color
  track.append(fill)

  wrap.append(head, track)
  return wrap
}

async function refreshTemps () {
  let status
  try {
    status = await window.mp.hardware()
  } catch (err) {
    tempsBody.replaceChildren(el('p', 'muted', `Kunne ikke hente data: ${err.message}`))
    return stopTemps()
  }

  const body = el('div')

  if (status.gpu.available) {
    for (const card of status.gpu.cards) {
      const panel = el('div', 'panel')
      panel.append(el('h2', null, card.name))

      const big = el('div', 'big-temp', card.temp === null ? '–' : `${card.temp}°`)
      big.style.color = tempColor(card.temp)
      panel.append(big)

      panel.append(
        gauge('Blæser', card.fan, 100, ' %'),
        gauge('Belastning', card.load, 100, ' %'),
        gauge('Grafikhukommelse', card.memUsed, card.memTotal || 1, ` MB af ${card.memTotal}`),
        gauge('Strøm', card.power === null ? null : Math.round(card.power), card.powerLimit || 1, ` W af ${card.powerLimit}`)
      )
      if (card.clock) panel.append(el('p', 'muted', `Klokfrekvens ${card.clock} MHz`))
      body.append(panel)
    }
  } else {
    const panel = el('div', 'panel')
    panel.append(el('h2', null, 'Grafikkort'), el('p', 'muted', status.gpu.reason))
    body.append(panel)
  }

  const cpu = el('div', 'panel')
  cpu.append(el('h2', null, status.cpu.name))

  const clock = el('div', 'big-temp', status.cpu.clock ? `${(status.cpu.clock / 1000).toFixed(2)} GHz` : '–')
  clock.style.color = 'var(--brand-light)'
  cpu.append(clock)
  if (status.cpu.maxClock) {
    cpu.append(el('p', 'muted', `Basisfrekvens ${(status.cpu.maxClock / 1000).toFixed(1)} GHz — resten er turbo`))
  }

  cpu.append(gauge('Samlet belastning', status.cpu.load, 100, ' %'))

  if (status.cpu.cores.length) {
    cpu.append(el('div', 'gauge-head', `Kerner (${status.cpu.cores.length})`))
    const grid = el('div', 'core-grid')
    status.cpu.cores.forEach((load, i) => {
      const core = el('div', 'core')
      const bar = el('div', 'core-bar')
      const fill = el('div', 'core-fill')
      fill.style.height = `${load}%`
      if (load > 80) fill.style.background = 'var(--error)'
      else if (load > 45) fill.style.background = '#d9a441'
      bar.append(fill)
      core.append(bar, el('div', 'core-label', i))
      core.title = `Kerne ${i}: ${load} %`
      grid.append(core)
    })
    cpu.append(grid)
  }
  body.append(cpu)

  const sys = el('div', 'panel')
  sys.append(el('h2', null, 'System'))
  sys.append(gauge('Hukommelse', status.memory.usedPct, 100, ' %'))

  for (const zone of status.zones) {
    sys.append(gauge(zone.name, zone.temp, 100, ' °C', tempColor(zone.temp)))
  }

  sys.append(el('p', 'muted', status.zones.length
    ? 'Termozonen sidder på bundkortet. Temperaturen inde i selve processorkernerne kan Windows ikke udlevere uden en driver på kerneniveau.'
    : 'Dit bundkort melder ingen temperaturer til Windows.'))
  body.append(sys)

  tempsBody.replaceChildren(body)
}

/* ---------- RGB ---------- */

const PRESETS = [
  ['Rød', '#ff0000'], ['Orange', '#ff6a00'], ['Gul', '#ffd000'],
  ['Grøn', '#00ff40'], ['Cyan', '#00e5ff'], ['Blå', '#0066ff'],
  ['Lilla', '#8a2be2'], ['Pink', '#ff2d95'], ['Hvid', '#ffffff']
]

// ASUS' Aura-controller styres over USB. Alle pakker er 65 bytes, hvor den foerste
// er rapport-nummeret 0xEC, og de resterende 64 er indholdet.
const AURA_VENDOR = 0x0b05
const AURA_PRODUCTS = [0x19af, 0x1939, 0x18f3]
const AURA_REPORT = 0xec

const CMD_EFFECT = 0x35
const CMD_DIRECT = 0x40
const CMD_COMMIT = 0x3f
const CMD_FIRMWARE = 0x82
const MODE_DIRECT = 0xff

// Tilstanden saettes samlet for fast og adresserbart lys, mens farver sendes til
// hver kanal for sig: 0-3 er de adresserbare stik, 4 er lyset paa bundkortet.
const EFFECT_CHANNELS = [0x00, 0x01]
const COLOR_CHANNELS = [0x00, 0x01, 0x02, 0x03, 0x04]
const CHUNK = 20
const STARTS = [0, 20, 40, 60, 80, 100]

let auraDevice = null

function payload (...bytes) {
  const buf = new Uint8Array(64)
  bytes.forEach((b, i) => { buf[i] = b & 0xff })
  return buf
}

const send = (device, ...bytes) => device.sendReport(AURA_REPORT, payload(...bytes))

async function getAura () {
  if (auraDevice && auraDevice.opened) return auraDevice

  const filters = AURA_PRODUCTS.map(productId => ({ vendorId: AURA_VENDOR, productId }))
  const known = await navigator.hid.getDevices()
  let device = known.find(d => d.vendorId === AURA_VENDOR && AURA_PRODUCTS.includes(d.productId))

  if (!device) {
    const picked = await navigator.hid.requestDevice({ filters })
    device = picked[0]
  }
  if (!device) {
    throw new Error(
      'Fandt ingen ASUS Aura-controller på denne PC. Lysstyringen taler Auras protokol, '
      + 'så den virker på ASUS-bundkort med indbygget RGB. Andre mærker som Corsair, '
      + 'Razer og MSI bruger hver deres egen protokol.'
    )
  }

  if (!device.opened) await device.open()
  auraDevice = device
  return device
}

// Svaret kommer som en indgaaende rapport, ikke som returvaerdi.
function awaitReport (device, timeout = 1000) {
  return new Promise(resolve => {
    const done = data => {
      clearTimeout(timer)
      device.removeEventListener('inputreport', handler)
      resolve(data)
    }
    const handler = event => done(event.data)
    const timer = setTimeout(() => done(null), timeout)
    device.addEventListener('inputreport', handler)
  })
}

const rgbStatus = document.getElementById('rgb-status')
const rgbPanel = document.getElementById('rgb-panel')
const rgbColor = document.getElementById('rgb-color')
const rgbBrightness = document.getElementById('rgb-brightness')
const rgbResult = document.getElementById('rgb-result')

let rgbLoaded = false

async function loadRgb () {
  if (rgbLoaded) return

  let device
  try {
    device = await getAura()
  } catch (err) {
    rgbStatus.replaceChildren(el('p', 'muted', err.message))
    return
  }

  let firmware = 'ukendt'
  try {
    await send(device, CMD_FIRMWARE)
    const reply = await awaitReport(device)
    if (reply) {
      firmware = new TextDecoder('latin1')
        .decode(new Uint8Array(reply.buffer, reply.byteOffset + 1, 16))
        .replace(/[^\x20-\x7e]/g, '').trim() || 'ukendt'
    }
  } catch {
    // Firmwarenavnet er kun pynt; styringen virker uden.
  }

  rgbStatus.replaceChildren(el('p', 'muted',
    `${device.productName} fundet · firmware ${firmware}. Styrer lyset på bundkortet og de tilsluttede RGB-stik.`))
  rgbPanel.classList.remove('hidden')

  const swatches = document.getElementById('swatches')
  swatches.replaceChildren()
  for (const [name, hex] of PRESETS) {
    const dot = el('button', 'swatch')
    dot.style.background = hex
    dot.title = name
    dot.onclick = () => { rgbColor.value = hex; applyColor() }
    swatches.append(dot)
  }

  rgbLoaded = true
}

function hexToRgb (hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  }
}

async function applyColor () {
  const base = hexToRgb(rgbColor.value)
  const scale = Number(rgbBrightness.value) / 100
  const colour = {
    r: Math.round(base.r * scale),
    g: Math.round(base.g * scale),
    b: Math.round(base.b * scale)
  }

  rgbResult.replaceChildren(el('p', 'muted', 'Sender farve...'))

  try {
    const device = await getAura()

    // Uden dette overskriver controllerens egen effekt vores farver med det samme.
    for (const channel of EFFECT_CHANNELS) {
      await send(device, CMD_EFFECT, channel, 0x00, 0x00, MODE_DIRECT)
    }

    const chunk = []
    for (let i = 0; i < CHUNK; i++) chunk.push(colour.r, colour.g, colour.b)

    for (const channel of COLOR_CHANNELS) {
      for (const start of STARTS) {
        // Farverne traeder foerst frem naar bit 0x80 saettes, og kun paa sidste pakke.
        const apply = start === STARTS[STARTS.length - 1] ? 0x80 : 0x00
        await send(device, CMD_DIRECT, apply | channel, start, CHUNK, ...chunk)
      }
    }

    await send(device, CMD_COMMIT, 0x55, 0x00, 0x00)
    rgbResult.replaceChildren(el('p', 'muted',
      `Farven er sat (${colour.r}, ${colour.g}, ${colour.b}).`))
  } catch (err) {
    rgbResult.replaceChildren(el('p', 'muted', `Kunne ikke sætte farven: ${err.message}`))
  }
}

rgbBrightness.oninput = () => {
  document.getElementById('brightness-value').textContent = `${rgbBrightness.value} %`
}

document.getElementById('rgb-apply').onclick = applyColor

document.getElementById('rgb-restore').onclick = async () => {
  try {
    const device = await getAura()
    // Tilstand 0x01 er den faste farve, bundkortet selv styrer.
    for (const channel of EFFECT_CHANNELS) {
      await send(device, CMD_EFFECT, channel, 0x00, 0x00, 0x01)
    }
    await send(device, CMD_COMMIT, 0x55, 0x00, 0x00)
    rgbResult.replaceChildren(el('p', 'muted', 'Lyset styres igen af bundkortet.'))
  } catch (err) {
    rgbResult.replaceChildren(el('p', 'muted', `Kunne ikke give lyset tilbage: ${err.message}`))
  }
}

/* ---------- Blaeserstyring ---------- */

const fansBody = document.getElementById('fans-body')
const loadFansButton = document.getElementById('load-fans')

// Undersoeges foerst uden administratoradgang, saa folk med andre bundkort ikke
// moeder en UAC-boks til ingen nytte.
let fanSupportChecked = false
async function checkFanSupport () {
  if (fanSupportChecked) return
  fanSupportChecked = true

  const info = await window.mp.fans.supported()
  if (info.supported) {
    fansBody.replaceChildren(el('p', 'muted',
      `${info.board} understøtter blæserstyring. Windows beder om administratoradgang, når kurverne skal læses eller ændres.`))
    return
  }

  loadFansButton.classList.add('hidden')
  fansBody.replaceChildren(el('p', 'muted', info.reason))
}

loadFansButton.onclick = async () => {
  loadFansButton.disabled = true
  loadFansButton.textContent = 'Venter på godkendelse...'
  fansBody.replaceChildren(el('p', 'muted', 'Sig ja til Windows\u2019 boks om administratoradgang.'))

  try {
    renderFans(await window.mp.fans.read())
  } catch (err) {
    fansBody.replaceChildren(el('p', 'muted', err.message))
  } finally {
    loadFansButton.disabled = false
    loadFansButton.textContent = 'Hent blæsere'
  }
}

function point (label, temp, duty, fanType, key) {
  const wrap = el('div', 'curve-point')
  wrap.append(el('div', 'curve-label', label))

  const tempInput = document.createElement('input')
  tempInput.type = 'number'
  tempInput.min = 20
  tempInput.max = 90
  tempInput.value = temp
  tempInput.dataset.fan = fanType
  tempInput.dataset.field = `${key}Temp`

  const dutyInput = document.createElement('input')
  dutyInput.type = 'number'
  dutyInput.min = 20
  dutyInput.max = 100
  dutyInput.value = duty
  dutyInput.dataset.fan = fanType
  dutyInput.dataset.field = `${key}Duty`

  const row = el('div', 'curve-inputs')
  row.append(tempInput, el('span', 'curve-unit', '°C →'), dutyInput, el('span', 'curve-unit', '%'))
  wrap.append(row)
  return wrap
}

function renderFans (result) {
  if (!result.ok) {
    fansBody.replaceChildren(el('p', 'muted', result.error || 'Kunne ikke læse blæserne.'))
    return
  }

  const body = el('div')
  body.append(el('p', 'muted',
    'Kurven bestemmer, hvor hurtigt blæseren kører ved en given temperatur. Appen tvinger '
    + 'punkterne til at stige og holder hastigheden på mindst 20 %, så maskinen ikke kan koge.'))

  for (const fan of result.fans) {
    const panel = el('div', 'panel')
    panel.append(el('h2', null, fan.name))
    panel.append(el('p', 'muted',
      `Tilstand ${fan.mode}${fan.profile ? ` · profil ${fan.profile}` : ''}${fan.source ? ` · styret af ${fan.source}` : ''}`))

    if (!fan.curve) {
      panel.append(el('p', 'muted', 'Bundkortet udleverer ingen kurve for denne blæser, så den kan kun aflæses.'))
      body.append(panel)
      continue
    }

    const grid = el('div', 'curve-grid')
    grid.append(
      point('Nederste punkt', fan.curve.lowTemp, fan.curve.lowDuty, fan.type, 'low'),
      point('Midterste punkt', fan.curve.midTemp, fan.curve.midDuty, fan.type, 'mid'),
      point('Øverste punkt', fan.curve.highTemp, fan.curve.highDuty, fan.type, 'high')
    )
    panel.append(grid)

    const save = el('button', 'primary', 'Gem kurve')
    save.onclick = () => saveCurve(fan, save)
    panel.append(save)
    body.append(panel)
  }

  fansBody.replaceChildren(body)
}

async function saveCurve (fan, button) {
  const value = field => Number(
    fansBody.querySelector(`input[data-fan="${fan.type}"][data-field="${field}"]`).value
  )

  const curve = {
    type: fan.type,
    mode: fan.mode === 'DC' ? 'DC' : 'PWM',
    lowTemp: value('lowTemp'), lowDuty: value('lowDuty'),
    midTemp: value('midTemp'), midDuty: value('midDuty'),
    highTemp: value('highTemp'), highDuty: value('highDuty')
  }

  button.disabled = true
  button.textContent = 'Gemmer...'
  try {
    const result = await window.mp.fans.write([curve])
    if (result.ok) renderFans(result)
    else fansBody.replaceChildren(el('p', 'muted', result.error))
  } finally {
    button.disabled = false
    button.textContent = 'Gem kurve'
  }
}

/* ---------- Windows updates ---------- */

const scanButton = document.getElementById('scan-updates')
const installButton = document.getElementById('install-updates')
const updatesBody = document.getElementById('updates-body')

scanButton.onclick = async () => {
  scanButton.disabled = true
  installButton.disabled = true
  scanButton.textContent = 'Søger...'
  updatesBody.replaceChildren(el('p', 'muted', 'Windows leder efter opdateringer. Det kan tage et par minutter.'))

  try {
    const updates = await window.mp.updates.scan()
    renderUpdates(updates)
  } catch (err) {
    updatesBody.replaceChildren(el('p', 'muted', `Søgningen fejlede: ${err.message}`))
  } finally {
    scanButton.disabled = false
    scanButton.textContent = 'Søg efter opdateringer'
  }
}

function renderUpdates (updates) {
  updatesBody.replaceChildren()

  if (!updates.length) {
    updatesBody.append(el('p', 'muted', 'Din PC er helt opdateret. Ingen opdateringer mangler.'))
    return
  }

  const drivers = updates.filter(u => u.kind === 'Driver').length
  updatesBody.append(el('p', 'view-sub',
    `Fandt ${updates.length} opdatering(er)${drivers ? `, heraf ${drivers} driver(e)` : ''}.`))

  for (const update of updates) {
    const row = el('div', 'update-item')

    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = true
    box.dataset.id = update.id

    const info = el('div')
    const title = el('div', 'update-title', update.title)
    if (update.kind === 'Driver') title.append(el('span', 'badge driver', 'Driver'))
    else title.append(el('span', 'badge', 'Windows'))

    const meta = [
      update.sizeMb ? `${update.sizeMb} MB` : null,
      update.severity ? `Alvorlighed: ${update.severity}` : null,
      update.kb ? `KB${update.kb}` : null
    ].filter(Boolean).join(' · ')

    info.append(title)
    if (meta) info.append(el('div', 'update-meta', meta))
    row.append(box, info)
    updatesBody.append(row)
  }

  installButton.disabled = false
}

installButton.onclick = async () => {
  const ids = [...updatesBody.querySelectorAll('input:checked')].map(b => b.dataset.id)
  if (!ids.length) return

  installButton.disabled = true
  scanButton.disabled = true

  const log = el('div', 'log', 'Venter på, at du godkender administratoradgang...')
  updatesBody.replaceChildren(el('p', 'view-sub', `Installerer ${ids.length} opdatering(er).`), log)

  try {
    await window.mp.updates.install(ids)
    pollProgress(log)
  } catch (err) {
    log.textContent = err.message
    installButton.disabled = false
    scanButton.disabled = false
  }
}

function pollProgress (log) {
  const timer = setInterval(async () => {
    const { lines, done, reboot } = await window.mp.updates.progress()
    log.textContent = lines.join('\n') || 'Arbejder...'

    if (done) {
      clearInterval(timer)
      if (reboot) log.textContent += '\n\nPC\u2019en skal genstartes for at fuldføre.'
      log.textContent += '\n\nFærdig. Søg igen for at se, om der mangler mere.'
      scanButton.disabled = false
    }
  }, 1500)
}

/* ---------- Ping ---------- */

const pingForm = document.getElementById('ping-form')
const pingButton = document.getElementById('ping-button')
const pingResult = document.getElementById('ping-result')

pingForm.onsubmit = async event => {
  event.preventDefault()
  const host = document.getElementById('ping-host').value.trim()
  if (!host) return

  pingButton.disabled = true
  pingButton.textContent = 'Pinger...'
  pingResult.replaceChildren(el('p', 'muted', `Sender 4 pakker til ${host}...`))

  try {
    const res = await window.mp.ping(host)
    const card = el('div', `card ${res.ok ? 'ok' : 'fail'}`)
    card.append(
      el('div', 'card-title', res.ok ? `${res.host} svarer` : `${res.host || 'Værten'} svarer ikke`),
      el('div', 'card-sub', res.ok ? `Gennemsnitlig svartid ${res.avg} ms` : res.error)
    )

    if (res.sent) {
      const stats = el('div', 'stats')
      for (const [value, label] of [
        [res.sent, 'Sendt'],
        [res.received, 'Modtaget'],
        [`${res.lossPct}%`, 'Tabt'],
        [res.min === null ? '–' : `${res.min}/${res.max} ms`, 'Min/Maks']
      ]) {
        const box = el('div')
        box.append(el('div', 'stat-value', value), el('div', 'stat-label', label))
        stats.append(box)
      }
      card.append(stats)
    }
    pingResult.replaceChildren(card)
  } finally {
    pingButton.disabled = false
    pingButton.textContent = 'Ping'
  }
}

/* ---------- FiveM ---------- */

const fivemForm = document.getElementById('fivem-form')
const fivemButton = document.getElementById('fivem-button')
const fivemResult = document.getElementById('fivem-result')

fivemForm.onsubmit = async event => {
  event.preventDefault()
  const code = document.getElementById('fivem-code').value.trim()
  if (!code) return

  fivemButton.disabled = true
  fivemButton.textContent = 'Slår op...'
  fivemResult.replaceChildren(el('p', 'muted', 'Henter serveroplysninger...'))

  try {
    renderServer(await window.mp.fivem(code))
  } finally {
    fivemButton.disabled = false
    fivemButton.textContent = 'Slå op'
  }
}

function renderServer (res) {
  if (!res.ok) {
    const card = el('div', 'card fail')
    card.append(el('div', 'card-title', 'Kunne ikke slå serveren op'), el('div', 'card-sub', res.error))
    fivemResult.replaceChildren(card)
    return
  }

  const card = el('div', 'card ok')
  card.append(
    el('div', 'card-title', res.hostname || `Server ${res.code}`),
    el('div', 'card-sub', `${res.players.online} af ${res.players.max} spillere online`)
  )

  const rows = [
    ...res.details,
    ['Ejer', res.owner.name],
    ['IP-adresser', res.endpoints.join(', ')],
    ...res.vars
  ].filter(([, value]) => value)

  const group = el('div', 'spec-group')
  group.style.marginTop = '16px'
  for (const [key, value] of rows) {
    const row = el('div', 'spec-row')
    row.append(el('div', 'spec-key', key), el('div', 'spec-val', value))
    group.append(row)
  }
  card.append(group)

  if (res.players.list.length) {
    card.append(el('h3', null, `Spillere (${res.players.list.length})`))
    const list = el('div', 'player-list')
    for (const player of res.players.list) {
      const row = el('div', 'player')
      row.append(el('span', null, player.name), el('span', 'muted', `${player.ping} ms`))
      list.append(row)
    }
    card.append(list)
  }

  fivemResult.replaceChildren(card)
}

/* ---------- Version ---------- */

window.mp.getVersion().then(v => {
  document.getElementById('version').textContent = `MP_Functions v${v}`
})
