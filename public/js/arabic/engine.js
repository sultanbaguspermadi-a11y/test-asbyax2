import { Lexicon } from './lexicon.js'
import { Validator } from './validator.js'

/**
 * Loads lexicon files described by data/lexicon/meta.json and answers validation requests.
 * Runs inside the Web Worker, or on the main thread as a fallback (same code both ways).
 *   strict   -> tier "core" files only
 *   expanded -> all tiers (+ morphology, see Validator)
 */
export class Engine {
  constructor() { this.tiers = new Map(); this.meta = null; this.baseUrl = ''; this.policy = 'expanded'; this.custom = []; this.validator = null }

  async init({ baseUrl, policy, custom }) {
    this.baseUrl = baseUrl
    this.policy = policy
    this.custom = custom || []
    const res = await fetch(new URL('meta.json', baseUrl))
    if (!res.ok) throw new Error(`lexicon meta: HTTP ${res.status}`)
    this.meta = await res.json()
    await this.#ensureTiers()
    return this.info()
  }

  async #ensureTiers() {
    const wanted = this.policy === 'strict' ? ['core'] : [...new Set(this.meta.files.map(f => f.tier))]
    for (const tier of wanted) {
      if (this.tiers.has(tier)) continue
      const lex = new Lexicon()
      for (const f of this.meta.files.filter(x => x.tier === tier)) {
        const r = await fetch(new URL(f.path, this.baseUrl))
        if (!r.ok) throw new Error(`lexicon file ${f.path}: HTTP ${r.status}`)
        lex.addText(await r.text())
      }
      this.tiers.set(tier, lex)
    }
    const active = wanted.map(t => this.tiers.get(t))
    const merged = { lookup: key => active.flatMap(l => l.lookup(key)) }
    this.validator = new Validator({ lexicon: merged, policy: this.policy, custom: this.custom })
  }

  info() {
    const active = this.policy === 'strict' ? ['core'] : [...this.tiers.keys()]
    return { version: this.meta.version, note: this.meta.note, policy: this.policy, entries: active.reduce((s, t) => s + (this.tiers.get(t)?.size ?? 0), 0), files: this.meta.files }
  }
  async setPolicy(policy) { this.policy = policy; await this.#ensureTiers(); return this.info() }
  setCustom(words) { this.custom = words; this.validator?.setCustom(words) }
  check(words) { return this.validator.checkAll(words) }
}
