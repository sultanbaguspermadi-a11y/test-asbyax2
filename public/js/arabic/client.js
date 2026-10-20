import { foldKey } from './normalize.js'

/**
 * Promise API over the validation engine. Prefers a module Web Worker (keeps the UI thread free while
 * the lexicon is parsed); falls back to the main thread if workers are unavailable.
 * If the lexicon cannot be loaded at all, `status` becomes "unavailable" and check() resolves with
 * status "unavailable" for every word - the game must keep working.
 */
export class ValidatorClient {
  constructor({ baseUrl, policy = 'expanded', custom = [] }) {
    this.baseUrl = new URL(baseUrl, location.href).href
    this.policy = policy
    this.custom = custom
    this.status = 'loading'     // loading | ready | unavailable
    this.info = null
    this.cache = new Map()
    this.listeners = new Set()
    this.pending = new Map()
    this.seq = 0
    this.ready = this.#start()
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  #emit() { for (const fn of this.listeners) fn(this) }

  async #start() {
    try {
      this.info = await this.#call('init', { baseUrl: this.baseUrl, policy: this.policy, custom: this.custom })
      this.status = 'ready'
    } catch (e) {
      console.warn('Dictionary unavailable:', e)
      this.status = 'unavailable'
    }
    this.#emit()
  }

  async #backend() {
    if (this.backend) return this.backend
    if (typeof Worker !== 'undefined') {
      try {
        const w = new Worker(new URL('./validator.worker.js', import.meta.url), { type: 'module' })
        w.onmessage = ({ data }) => { const p = this.pending.get(data.id); if (p) { this.pending.delete(data.id); data.ok ? p.resolve(data.result) : p.reject(new Error(data.error)) } }
        w.onerror = () => { for (const p of this.pending.values()) p.reject(new Error('worker failed')); this.pending.clear(); this.backend = null; this.useInline = true }
        this.backend = { call: (type, payload) => new Promise((resolve, reject) => { const id = ++this.seq; this.pending.set(id, { resolve, reject }); w.postMessage({ id, type, payload }) }) }
        return this.backend
      } catch { /* fall through */ }
    }
    const { Engine } = await import('./engine.js')
    const engine = new Engine()
    this.backend = { call: async (type, payload) => (type === 'init' ? engine.init(payload) : type === 'policy' ? engine.setPolicy(payload) : type === 'custom' ? (engine.setCustom(payload), true) : engine.check(payload)) }
    return this.backend
  }

  async #call(type, payload) {
    try { return await (await this.#backend()).call(type, payload) }
    catch (e) {
      if (!this.useInline || this.inlineTried) throw e
      this.inlineTried = true; this.backend = null; this.useInline = false
      const { Engine } = await import('./engine.js'); const engine = new Engine()
      this.backend = { call: async (t, p) => (t === 'init' ? engine.init(p) : t === 'policy' ? engine.setPolicy(p) : t === 'custom' ? (engine.setCustom(p), true) : engine.check(p)) }
      if (type !== 'init') await this.backend.call('init', { baseUrl: this.baseUrl, policy: this.policy, custom: this.custom })
      return this.backend.call(type, payload)
    }
  }

  async setPolicy(policy) {
    this.policy = policy; this.cache.clear()
    if (this.status === 'ready') this.info = await this.#call('policy', policy)
    this.#emit()
  }
  async setCustom(words) {
    this.custom = words; this.cache.clear()
    if (this.status === 'ready') await this.#call('custom', words)
    this.#emit()
  }

  /** @returns {Promise<{word:string,status:'valid'|'not_found'|'unavailable',source?:string}[]>} */
  async check(words) {
    await this.ready
    if (this.status !== 'ready') return words.map(word => ({ word, key: foldKey(word), status: 'unavailable' }))
    const todo = [...new Set(words.map(foldKey))].filter(k => !this.cache.has(k))
    if (todo.length) {
      try { (await this.#call('check', todo)).forEach((r, i) => this.cache.set(todo[i], r)) }
      catch { return words.map(word => ({ word, key: foldKey(word), status: 'unavailable' })) }
    }
    return words.map(word => ({ ...this.cache.get(foldKey(word)), word }))
  }
}
