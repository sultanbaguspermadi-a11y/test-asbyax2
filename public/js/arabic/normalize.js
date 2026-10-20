/**
 * Arabic normalization.
 *
 * Two representations are always kept apart:
 *   - the DISPLAY form (what the player sees) is never rewritten;
 *   - the LOOKUP key is produced here by a named, documented profile.
 *
 * Profiles (reasoning in docs/DICTIONARY.md):
 *   orthographic - removes only decoration (harakat, shadda, tanwin, dagger alef, Quranic marks,
 *                  tatweel, bidi/zero-width controls), unifies Persian kaf/yeh look-alikes and
 *                  presentation forms. Hamza, alef, ya and ta marbuta distinctions are KEPT.
 *                  Used to store lexicon headwords.
 *   tile         - orthographic + the folds a 28-letter tile set forces on the game: every alef
 *                  carrier -> ا, ى -> ي, ة -> ه, ؤ -> و, ئ -> ي. A lone ء is never dropped, so words
 *                  needing a stand-alone hamza are simply not formable with these tiles.
 *
 * Folding is many-to-one on purpose but is applied to the LOOKUP KEY only; the lexicon keeps the
 * original spelling next to each key so results can show which real word matched.
 */

// U+064B..U+065F harakat/tanwin/shadda/sukun, U+0670 dagger alef, U+06D6..U+06ED Quranic marks
const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g
const TATWEEL = /\u0640/g
const INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

export const PROFILES = Object.freeze({
  orthographic: Object.freeze({ stripDiacritics: true, stripTatweel: true, foldAlef: false, foldYa: false, foldTaMarbuta: false, foldHamzaCarriers: false }),
  tile: Object.freeze({ stripDiacritics: true, stripTatweel: true, foldAlef: true, foldYa: true, foldTaMarbuta: true, foldHamzaCarriers: true }),
})

/** @param {string} text @param {object|string} [profile] profile name or a partial option object */
export function normalize(text, profile = 'tile') {
  const o = typeof profile === 'string' ? PROFILES[profile] : { ...PROFILES.orthographic, ...profile }
  if (!o) throw new Error(`unknown normalization profile: ${profile}`)
  let s = String(text ?? '').normalize('NFKC').replace(INVISIBLES, '')
  if (o.stripDiacritics) s = s.replace(DIACRITICS, '')
  if (o.stripTatweel) s = s.replace(TATWEEL, '')
  // Persian/Urdu look-alikes typed on foreign keyboards: not Arabic letters, never meaningful here.
  s = s.replace(/\u06A9/g, '\u0643').replace(/[\u06CC\u06D2]/g, '\u064A')
  if (o.foldAlef) s = s.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
  if (o.foldYa) s = s.replace(/\u0649/g, '\u064A')
  if (o.foldTaMarbuta) s = s.replace(/\u0629/g, '\u0647')
  if (o.foldHamzaCarriers) s = s.replace(/\u0624/g, '\u0648').replace(/\u0626/g, '\u064A')
  return s
}

export const foldKey = text => normalize(text, 'tile')
export const orthographic = text => normalize(text, 'orthographic')
/** True when the string is only Arabic base letters (ء..غ, ف..ي). */
export const isArabicWord = text => /^[\u0621-\u063A\u0641-\u064A]+$/.test(text)
