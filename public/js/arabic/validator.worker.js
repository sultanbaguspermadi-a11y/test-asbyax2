import { Engine } from './engine.js'
const engine = new Engine()
self.onmessage = async ({ data: { id, type, payload } }) => {
  try {
    let result
    if (type === 'init') result = await engine.init(payload)
    else if (type === 'policy') result = await engine.setPolicy(payload)
    else if (type === 'custom') { engine.setCustom(payload); result = true }
    else if (type === 'check') result = engine.check(payload)
    self.postMessage({ id, ok: true, result })
  } catch (e) { self.postMessage({ id, ok: false, error: String(e?.message || e) }) }
}
