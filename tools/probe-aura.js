// Spoerger Aura-controlleren om firmware og opsaetning. Der sendes kun
// forespoergsler - ingen farver skrives.
const HID = require('node-hid')

const VENDOR = 0x0b05
const PRODUCT = 0x19af
const PACKET = 65

const hex = buf => Buffer.from(buf).toString('hex').match(/.{2}/g).join(' ')

function request (device, command, label) {
  const packet = Buffer.alloc(PACKET)
  packet[0] = 0xec
  packet[1] = command

  device.write([...packet])
  try {
    const reply = device.readTimeout(1000)
    if (!reply || !reply.length) return console.log(`${label}: intet svar`)
    console.log(`${label}:`)
    console.log('  rå:', hex(reply.slice(0, 24)), '...')
    const text = Buffer.from(reply.slice(2, 18)).toString('latin1').replace(/[^\x20-\x7e]/g, '')
    if (text.trim()) console.log('  som tekst:', text.trim())
    return reply
  } catch (err) {
    console.log(`${label}: fejl -`, err.message)
  }
}

const info = HID.devices().find(d => d.vendorId === VENDOR && d.productId === PRODUCT)
if (!info) {
  console.log('Fandt ingen Aura-controller.')
  process.exit(1)
}

console.log('Åbner', info.product, 'på interface', info.interface)
const device = new HID.HID(info.path)

request(device, 0x82, 'Firmwareversion')
const config = request(device, 0xb0, 'Konfigurationstabel')

if (config) {
  // Tabellen fortaeller hvor mange lyszoner hver kanal har.
  console.log('  kanalbytes (0x04-0x0F):', hex(config.slice(4, 16)))
}

device.close()
