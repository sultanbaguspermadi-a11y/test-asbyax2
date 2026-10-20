import { foldKey, isArabicWord } from './normalize.js'
import { analyze } from './morphology.js'

/**
 * Word validator for the game.
 * Policies (real behavioural difference, not labels):
 *   strict   - the word's key must match a lexicon headword exactly (after the tile fold).
 *   expanded - additionally accepts forms produced by lexicon-backed morphology (morphology.js).
 * Custom words (user list) are accepted under both policies and reported as source "custom".
 *
 * Result statuses: "valid" | "not_found". "not_found" means "not in the installed resources", never
 * "this is not Arabic". A separate "unavailable" status is produced by the client when the
 * lexicon could not be loaded at all.
 */
export class Validator {
  constructor({ lexicon, policy = 'expanded', custom = [] }) {
    this.lexicon = lexicon
    this.policy = policy
    this.custom = new Set()
    this.setCustom(custom)
  }
  setPolicy(policy) {
    if (policy !== 'strict' && policy !== 'expanded') throw new Error(`unknown policy: ${policy}`)
    this.policy = policy
  }
  setCustom(words) { this.custom = new Set([...words].map(foldKey).filter(isArabicWord)) }

  check(word) {
    const key = foldKey(word)
    if (!isArabicWord(key) || key.length < 2) return { word, key, status: 'not_found', reason: 'malformed' }
    const hits = this.lexicon.lookup(key)
    if (hits.length) return { word, key, status: 'valid', source: 'lexicon', matches: hits.map(h => h.form) }
    if (this.custom.has(key)) return { word, key, status: 'valid', source: 'custom' }
    if (this.policy === 'expanded') {
      const analysis = analyze(key, this.lexicon)
      if (analysis) return { word, key, status: 'valid', source: 'morphology', analysis }
    }
    return { word, key, status: 'not_found', reason: 'absent' }
  }
  checkAll(words) { return words.map(w => this.check(w)) }
}
