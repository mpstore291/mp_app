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

  const sys = el('div', 'panel')
  sys.append(el('h2', null, status.cpu.name))
  sys.append(
    gauge('Processorbelastning', status.cpu.load, 100, ' %'),
    gauge('Hukommelse', status.memory.usedPct, 100, ' %')
  )
  sys.append(el('p', 'muted',
    'Processorens temperatur kan ikke aflæses uden en driver på kerneniveau, som Windows ikke tillader almindelige programmer at installere.'))
  body.append(sys)

  tempsBody.replaceChildren(body)
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
