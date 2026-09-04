const form = document.getElementById('ping-form')
const hostInput = document.getElementById('host')
const button = document.getElementById('ping-button')
const resultBox = document.getElementById('result')
const updateStatus = document.getElementById('update-status')

function el (tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function showMessage (text) {
  resultBox.replaceChildren(el('p', 'muted', text))
}

function stat (value, label) {
  const box = el('div')
  box.append(el('div', 'stat-value', value), el('div', 'stat-label', label))
  return box
}

function showResult (res) {
  const card = el('div', `result-card ${res.ok ? 'ok' : 'fail'}`)

  card.append(
    el('div', 'result-title', res.ok ? `${res.host} svarer` : `${res.host || 'Værten'} svarer ikke`),
    el('div', 'result-sub', res.ok
      ? `Svartid i gennemsnit ${res.avg} ms`
      : res.error || 'Ukendt fejl')
  )

  if (res.sent) {
    const stats = el('div', 'stats')
    stats.append(
      stat(String(res.sent), 'Sendt'),
      stat(String(res.received), 'Modtaget'),
      stat(`${res.lossPct}%`, 'Tabt'),
      stat(res.min === null ? '–' : `${res.min}/${res.max} ms`, 'Min/Maks')
    )
    card.append(stats)
  }

  resultBox.replaceChildren(card)
}

form.addEventListener('submit', async event => {
  event.preventDefault()

  const host = hostInput.value.trim()
  if (!host) return

  button.disabled = true
  button.textContent = 'Pinger...'
  showMessage(`Sender 4 pakker til ${host}...`)

  try {
    showResult(await window.mp.ping(host))
  } catch (err) {
    showMessage(`Noget gik galt: ${err.message}`)
  } finally {
    button.disabled = false
    button.textContent = 'Ping'
  }
})

document.getElementById('check-updates').addEventListener('click', async () => {
  updateStatus.textContent = 'Søger...'
  const res = await window.mp.checkForUpdates()
  if (!res.checking) updateStatus.textContent = res.reason
})

window.mp.onUpdateStatus(text => { updateStatus.textContent = text })

window.mp.getVersion().then(v => {
  document.getElementById('version').textContent = `v${v}`
})

hostInput.focus()
