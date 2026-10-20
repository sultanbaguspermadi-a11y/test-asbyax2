import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalize, foldKey, orthographic, isArabicWord } from '../public/js/arabic/normalize.js'
import { Lexicon } from '../public/js/arabic/lexicon.js'
import { Validator } from '../public/js/arabic/validator.js'
import { conjugateSoundVerb, isSoundRoot } from '../public/js/arabic/morphology.js'

const lex = new Lexicon()
lex.addText(readFileSync(new URL('../public/data/lexicon/core.txt', import.meta.url), 'utf8'))
const expanded = new Validator({ lexicon: lex, policy: 'expanded' })
const strict = new Validator({ lexicon: lex, policy: 'strict' })
const ok = (v, w) => assert.equal(v.check(w).status, 'valid', w)
const no = (v, w) => assert.equal(v.check(w).status, 'not_found', w)

test('normalization: decoration is stripped, letters are not', () => {
  assert.equal(orthographic('كَتَبَ'), 'كتب')
  assert.equal(orthographic('مَدْرَسَةٌ'), 'مدرسة')            // ta marbuta kept
  assert.equal(orthographic('أَكَلَ'), 'أكل')                  // hamza kept in orthographic profile
  assert.equal(orthographic('هٰذا'), 'هذا')                    // dagger alef
  assert.equal(orthographic('هـ'), 'ه')                        // tatweel
  assert.equal(orthographic('\u200Fكتاب\u200E'), 'كتاب')       // bidi marks
  assert.equal(normalize('ﻛﺘﺎﺏ'), 'كتاب')                       // presentation forms
  assert.equal(orthographic('كتاب'.replace('ك', 'ک')), 'كتاب') // Persian kaf
})

test('normalization: tile profile folds only what 28 tiles cannot express', () => {
  assert.equal(foldKey('أإآٱ'), 'اااا')
  assert.equal(foldKey('على'), 'علي')
  assert.equal(foldKey('مدرسة'), 'مدرسه')
  assert.equal(foldKey('مؤمن'), 'مومن')
  assert.equal(foldKey('رئيس'), 'رييس')
  assert.equal(foldKey('شيء'), 'شيء')                           // stand-alone hamza is never dropped
  assert.notEqual(foldKey('كتب'), foldKey('كتاب'))              // different letters stay different
  assert.equal(normalize('أكل', { foldAlef: false }), 'أكل')    // configurable
})

test('isArabicWord rejects Latin, digits, spaces and punctuation', () => {
  assert.ok(isArabicWord('كتاب'))
  for (const s of ['abc', 'كتاب1', 'كتاب كتاب', 'كتاب،', '', 'ک']) assert.ok(!isArabicWord(s), s)
})

test('lexicon: loads, keeps original spelling, records rejects', () => {
  const l = new Lexicon()
  assert.equal(l.addText('# c\nأكل\tV\nbad\nمدرسة\tNdf\n'), 2)
  assert.deepEqual(l.lookup('اكل').map(e => e.form), ['أكل'])
  assert.equal(l.rejected[0], 'bad')
  assert.ok(lex.size > 500)
})

test('direct lexicon hits, including tile-folded spellings', () => {
  for (const w of ['كتاب', 'مدرسة', 'مدرسه', 'اخ', 'كَتَبَ']) ok(strict, w)
  assert.deepEqual(strict.check('مدرسه').matches, ['مدرسة'])
})

test('rejects what is not in the resources (no plausible-looking acceptance)', () => {
  for (const w of ['ككككك', 'بتكاو', 'قلمقلم', 'شظغز', 'ا', '', 'abc', 'كتاب1']) no(expanded, w)
  assert.equal(expanded.check('abc').reason, 'malformed')
  assert.equal(expanded.check('شظغز').reason, 'absent')
})

test('strict accepts headwords only; expanded adds lexicon-backed morphology', () => {
  no(strict, 'الكتاب'); ok(expanded, 'الكتاب')
  no(strict, 'كتابان'); ok(expanded, 'كتابان')
  ok(expanded, 'بالكتاب'); ok(expanded, 'وبالكتاب'); ok(expanded, 'للكتاب'); ok(expanded, 'كتابه'); ok(expanded, 'كتابهم')
  assert.equal(expanded.check('الكتاب').source, 'morphology')
  assert.equal(expanded.check('الكتاب').analysis.stem, 'كتاب')
})

test('nominal morphology obeys flags and construct rules', () => {
  ok(expanded, 'مدرستان'); ok(expanded, 'مدرسات'); ok(expanded, 'مدرستها'); ok(expanded, 'المدرسة')
  no(expanded, 'مدرسهات')        // wrong: ة must drop, not stay as ه
  no(expanded, 'الكتابه')        // ال + possessive is not allowed
  ok(expanded, 'معلمون'); ok(expanded, 'معلمين'); no(expanded, 'كتابون') // sound masc plural only where flagged m
  no(expanded, 'صحراءات')        // N without d/f/m flags takes no number suffix
  no(expanded, 'صحراوان')
  ok(expanded, 'سياراته')
})

test('function words take pronoun suffixes only when flagged S', () => {
  ok(expanded, 'فيه'); ok(expanded, 'منهم'); ok(expanded, 'وعنها')
  no(expanded, 'ثمه'); no(expanded, 'لكنه')
})

test('sound verb paradigm: generated only for flagged sound lemmas', () => {
  for (const w of ['يكتب', 'تكتبين', 'يكتبون', 'كتبوا', 'كتبتم', 'اكتبوا', 'اكتب', 'نكتب', 'اكتب', 'يكتبه', 'كتبها', 'وكتب', 'فكتبوا']) ok(expanded, w)
  no(expanded, 'يكتبانه')   // object attachment on ان-forms is refused by design (documented)
  no(expanded, 'ككتب'); no(expanded, 'يكتبوون'); no(expanded, 'يظتلن')
  ok(expanded, 'يقتلن'); ok(expanded, 'كتبك')   // كتبك = "he wrote you" (object suffix) / "your books"-like reading is also in lexicon morphology
})

test('verb generator: assimilation and refusal on non-sound roots', () => {
  assert.ok(conjugateSoundVerb('سكن').includes('سكنا'))        // سكنّا
  assert.ok(!conjugateSoundVerb('سكن').includes('سكننا'))
  assert.ok(conjugateSoundVerb('كتب').includes('كتبنا'))
  assert.deepEqual(conjugateSoundVerb('قال'), [])               // hollow
  assert.deepEqual(conjugateSoundVerb('مدد'), [])               // doubled
  assert.deepEqual(conjugateSoundVerb('أكل'), [])               // hamzated
  assert.ok(isSoundRoot('كتب') && !isSoundRoot('وعد'))
  ok(expanded, 'سكنا')
  no(expanded, 'يقالن')                   // not generated for weak verbs
})

test('listed (irregular) verb forms work but are not generalised', () => {
  ok(expanded, 'يقول'); ok(expanded, 'وقال'); ok(expanded, 'قاله')
  no(expanded, 'يقولون')
})

test('custom dictionary is additive and policy independent; normalised on entry', () => {
  const v = new Validator({ lexicon: lex, policy: 'strict', custom: ['زَلزَلة', 'xyz', 'ا'] })
  ok(v, 'زلزله'); assert.equal(v.check('زلزلة').source, 'custom')
  no(v, 'xyz')
  v.setCustom([]); no(v, 'زلزلة')
  assert.throws(() => v.setPolicy('fancy'))
})

test('performance sanity: 1,000 checks on a 300k-entry synthetic lexicon', () => {
  const big = new Lexicon()
  const L = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'
  let n = 0
  for (let a = 0; a < 28 && n < 300000; a++) for (let b = 0; b < 28; b++) for (let c = 0; c < 28; c++) for (let d = 0; d < 14 && n < 300000; d++) { big.add(L[a] + L[b] + L[c] + L[d] + 'ا', 'N'); n++ }
  const v = new Validator({ lexicon: big })
  const t = performance.now()
  for (let i = 0; i < 1000; i++) v.check('كتابكم' + (i % 3 ? '' : 'ين'))
  const ms = performance.now() - t
  console.log(`  entries=${big.size} 1000 checks=${ms.toFixed(1)}ms`)
  assert.ok(ms < 2000)
})
