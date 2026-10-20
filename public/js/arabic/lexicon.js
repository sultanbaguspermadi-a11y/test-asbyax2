/**
 * In-memory lexicon.
 *
 * File format (UTF-8, one entry per line):   headword[<TAB>flags]
 *   '#' starts a comment line; blank lines are ignored. Headwords are stored with their real
 *   spelling (hamza, ta marbuta ... kept, diacritics stripped). Lookup is by the tile-fold key,
 *   so the original spelling stays available to show which real word matched.
 *
 * Flags (all optional; default X). Documented in docs/DICTIONARY.md:
 *   X  exact form only - no affixation          N  nominal: proclitics (و ف ب ك ل ال), possessive suffixes
 *   d  dual (ان/ين)     m  sound masculine plural (ون/ين)     f  sound feminine plural (ات)
 *   S  function word that takes pronoun suffixes (e.g. في، من)
 *   G  sound triliteral form-I verb lemma (past 3ms spelling): the full paradigm is generated
 *   V  listed verb form (any person); accepts و/ف and object-pronoun suffixes
 */
import { foldKey, orthographic, isArabicWord } from './normalize.js'

export class Lexicon {
  constructor() {
    /** @type {Map<string,string>} fold key -> "form\tflags" entries joined by "\n" */
    this.map = new Map()
    this.entries = 0
    this.rejected = []
  }

  add(form, flags = 'X') {
    const spelled = orthographic(form)
    if (!isArabicWord(spelled) || spelled.length < 2) { if (this.rejected.length < 20) this.rejected.push(form); return false }
    const key = foldKey(spelled)
    const rec = `${spelled}\t${flags || 'X'}`
    const prev = this.map.get(key)
    if (prev === undefined) this.map.set(key, rec)
    else if (!prev.split('\n').includes(rec)) this.map.set(key, `${prev}\n${rec}`)
    else return false
    this.entries++
    return true
  }

  /** Parse a lexicon file's text; returns the number of entries added. */
  addText(text) {
    let n = 0
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const [form, flags] = line.split('\t')
      if (this.add(form, flags?.trim() || 'X')) n++
    }
    return n
  }

  /** @returns {{form:string, flags:string}[]} */
  lookup(key) {
    const rec = this.map.get(key)
    if (rec === undefined) return []
    return rec.split('\n').map(r => { const [form, flags] = r.split('\t'); return { form, flags } })
  }

  has(key) { return this.map.has(key) }
  get size() { return this.map.size }
}
