/**
 * Bounded Arabic morphology. NOTHING here legitimizes a form by itself: every analysis must end in
 * a lexicon entry whose flags explicitly allow the affixes involved (see lexicon.js flags).
 * Works on tile-fold keys (what the board produces); the entry's real spelling is consulted where
 * orthography matters (ta marbuta).
 *
 * Supported:  proclitics و/ف, ب/ك/ل, ال (incl. لل), possessive suffixes, dual, sound masculine and
 *   feminine plurals (with ة -> ت / ة dropped), the full paradigm of SOUND triliteral form-I verbs
 *   flagged G (past, present/subjunctive/jussive, imperative), و/ف + object pronouns on verbs.
 * NOT supported (must be listed in the lexicon): broken plurals, weak/hamzated/doubled verbs,
 *   derived verb forms II-X, participles, verbal nouns, comparatives, nisba derivation.
 */
import { foldKey } from './normalize.js'

const ALEF_ISH = 'اى'
const POSS = ['ي', 'نا', 'ك', 'كما', 'كم', 'كن', 'ه', 'ها', 'هما', 'هم', 'هن']
const OBJ = POSS.filter(s => s !== 'ي') .concat('ني')
// prefix chains: [string, hasArticle]
const PREFIXES = []
for (const c of ['', 'و', 'ف']) for (const [p, art] of [['', false], ['ال', true], ['ب', false], ['بال', true], ['ك', false], ['كال', true], ['ل', false], ['لل', true]]) PREFIXES.push([c + p, art, p === 'لل'])

const endsTa = form => form.endsWith('ة')

/** Sound = exactly 3 letters, none weak/hamza/alef (so no assimilation, no contraction). */
export const isSoundRoot = form => form.length === 3 && !/[ءآأؤإئاةىيو]/.test(form) && form[1] !== form[2]

const join = (stem, suffix) => (stem.at(-1) === suffix[0] && 'نت'.includes(suffix[0]) ? stem + suffix.slice(1) : stem + suffix)

/** All spellings of the sound form-I paradigm of `root` (3 letters). Vowel class does not change the unvocalized spelling. */
export function conjugateSoundVerb(root) {
  if (!isSoundRoot(root)) return []
  const out = new Set()
  for (const s of ['', 'ت', 'ا', 'تا', 'وا', 'ن', 'تما', 'تم', 'تن', 'نا']) out.add(join(root, s))
  const pres = { 'ي': ['', 'ان', 'ون', 'ن', 'ا', 'وا'], 'ت': ['', 'ين', 'ان', 'ون', 'ن', 'ي', 'ا', 'وا'], 'أ': [''], 'ن': [''] }
  for (const [p, sufs] of Object.entries(pres)) for (const s of sufs) out.add(p + join(root, s))
  for (const s of ['', 'ي', 'ا', 'وا', 'ن']) out.add('ا' + join(root, s))
  return [...out]
}

function analyzeVerb(w, lex) {
  for (const conj of ['', 'و', 'ف']) {
    if (!w.startsWith(conj) || w.length - conj.length < 2) continue
    const r = w.slice(conj.length)
    const bases = [[r, '']]
    for (const o of OBJ) if (r.endsWith(o) && r.length > o.length) bases.push([r.slice(0, -o.length), o])
    for (const [b, obj] of bases) {
      if (obj && /[اىينو]$/.test(b)) continue // keep object attachment to the unambiguous consonant-final forms
      // listed verb forms
      for (const e of lex.lookup(b)) if (e.flags.includes('V')) return { type: 'verb', stem: e.form, conj, object: obj, listed: true }
      // generated paradigm of sound form-I lemmas
      for (const p of ['', 'ي', 'ت', 'ن', 'ا']) {
        if (!b.startsWith(p)) continue
        for (let sl = 0; sl <= 3; sl++) {
          const mid = b.slice(p.length, b.length - sl)
          const suf = sl ? b.slice(-sl) : ''
          const lemmas = new Set()
          if (mid.length === 3) lemmas.add(mid)
          if (mid.length === 2 && suf && 'نت'.includes(suf[0])) lemmas.add(mid + suf[0]) // سكنّا: root-final ن/ت merged with the suffix
          for (const l of lemmas) for (const e of lex.lookup(l)) {
            if (!e.flags.includes('G') || !isSoundRoot(e.form)) continue
            if (conjugateSoundVerb(e.form).some(f => foldKey(f) === b)) return { type: 'verb', stem: e.form, conj, object: obj, listed: false }
          }
        }
      }
    }
  }
  return null
}

function analyzeNominal(w, lex) {
  for (const [pre, art, assimilated] of PREFIXES) {
    if (!w.startsWith(pre) || w.length - pre.length < 2) continue
    const r = w.slice(pre.length)
    if (assimilated && r[0] === 'ل') continue
    const possOpts = [['', r]]
    if (!art) for (const p of POSS) if (r.endsWith(p) && r.length > p.length) possOpts.push([p, r.slice(0, -p.length)])
    for (const [poss, r2] of possOpts) {
      const numOpts = [['', r2]]
      for (const n of poss ? ['ات'] : ['ان', 'ين', 'ون', 'ات']) if (r2.endsWith(n) && r2.length > n.length) numOpts.push([n, r2.slice(0, -n.length)])
      for (const [num, r3] of numOpts) {
        const cands = [[r3, 'plain']]
        if (r3.endsWith('ت') && (num === 'ان' || num === 'ين' || (poss && !num))) cands.push([r3.slice(0, -1) + 'ه', 'ta'])
        if (num === 'ات') cands.push([r3 + 'ه', 'drop'])
        for (const [key, kind] of cands) {
          if (key.length < 2) continue
          for (const e of lex.lookup(key)) {
            const f = e.flags
            if (!f.includes('N')) continue
            const ta = endsTa(e.form)
            let ok
            if (num === '') ok = kind === 'plain' ? (poss ? !ta : true) : ta
            else if (num === 'ات') ok = f.includes('f') && (kind === 'drop' ? ta : !ta)
            else if (num === 'ون') ok = f.includes('m') && !ta && kind === 'plain'
            else ok = (f.includes('d') || (num === 'ين' && f.includes('m'))) && (kind === 'ta' ? ta : !ta && !ALEF_ISH.includes(key.at(-1)))
            if (ok && (pre || poss || num)) return { type: 'nominal', stem: e.form, proclitics: pre, number: num, possessive: poss }
          }
        }
      }
    }
  }
  return null
}

/** Function words with pronoun suffixes (في -> فيه). */
function analyzeFunctionWord(w, lex) {
  for (const conj of ['', 'و', 'ف']) {
    if (!w.startsWith(conj)) continue
    const r = w.slice(conj.length)
    for (const p of POSS) {
      if (!r.endsWith(p) || r.length <= p.length) continue
      for (const e of lex.lookup(r.slice(0, -p.length))) if (e.flags.includes('S')) return { type: 'function', stem: e.form, conj, suffix: p }
    }
  }
  return null
}

/** @returns {object|null} analysis, or null when no lexicon-backed analysis exists */
export function analyze(key, lex) {
  return analyzeNominal(key, lex) || analyzeVerb(key, lex) || analyzeFunctionWord(key, lex)
}
