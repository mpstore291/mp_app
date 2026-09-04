const API = 'https://servers-frontend.fivem.net/api/servers/single/'

// Accepterer baade et helt cfx.re-link og bare koden i sig selv. Links til andre
// domaener afvises, saa man ikke tror man slaar noget op, man ikke goer.
function parseCode (input) {
  const text = String(input ?? '').trim()

  if (/\//.test(text)) {
    const match = text.match(/^(?:https?:\/\/)?(?:www\.)?cfx\.re\/join\/([a-z0-9]{4,12})\/?$/i)
    return match ? match[1] : null
  }

  return /^[a-z0-9]{4,12}$/i.test(text) ? text : null
}

function pickVars (vars = {}) {
  const interesting = {
    sv_projectName: 'Projektnavn',
    sv_projectDesc: 'Beskrivelse',
    sv_scriptHookAllowed: 'ScriptHook tilladt',
    gamename: 'Spil',
    locale: 'Sprog',
    tags: 'Tags',
    banner_connecting: 'Banner'
  }
  return Object.entries(interesting)
    .filter(([key]) => vars[key])
    .map(([key, label]) => [label, String(vars[key])])
}

async function lookup (input) {
  const code = parseCode(input)
  if (!code) {
    return { ok: false, error: 'Ugyldigt cfx-link. Brug fx cfx.re/join/abc123 eller bare abc123.' }
  }

  let response
  try {
    response = await fetch(API + code, {
      headers: { 'User-Agent': 'MP_Functions', Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    })
  } catch (err) {
    return { ok: false, error: `Kunne ikke nå FiveM: ${err.message}` }
  }

  if (response.status === 404) {
    return { ok: false, error: `Ingen server fundet med koden "${code}". Den kan være offline eller afmeldt.` }
  }
  if (!response.ok) {
    return { ok: false, error: `FiveM svarede med fejl ${response.status}.` }
  }

  const body = await response.json()
  const d = body?.Data
  if (!d) return { ok: false, error: 'FiveM sendte et tomt svar for den kode.' }

  const players = (d.players || []).map(p => ({
    name: p.name,
    id: p.id,
    ping: p.ping,
    // Identifikatorer som Steam- og license-id ligger i klartekst i APIet.
    identifiers: (p.identifiers || []).filter(i => !i.startsWith('ip:'))
  }))

  return {
    ok: true,
    code,
    hostname: stripColors(d.hostname || ''),
    players: {
      online: d.clients ?? 0,
      max: d.sv_maxclients ?? d.svMaxclients ?? 0,
      list: players
    },
    owner: {
      name: d.ownerName || null,
      profile: d.ownerProfile || null,
      avatar: d.ownerAvatar || null
    },
    endpoints: d.connectEndPoints || [],
    details: [
      ['Spiltype', d.gametype],
      ['Kort', d.mapname],
      ['Serverversion', d.server],
      ['Ressourcer', d.resources ? `${d.resources.length} stk.` : null],
      ['OneSync', d.vars?.onesync_enabled === 'true' ? 'Slået til' : 'Slået fra'],
      ['Upvotes', d.upvotePower],
      ['Status', d.support_status]
    ].filter(([, v]) => v !== null && v !== undefined && v !== ''),
    vars: pickVars(d.vars),
    resources: d.resources || []
  }
}

// FiveM-servernavne indeholder farvekoder som ^1 og ^7.
function stripColors (text) {
  return text.replace(/\^\d/g, '').trim()
}

module.exports = { lookup, parseCode }
