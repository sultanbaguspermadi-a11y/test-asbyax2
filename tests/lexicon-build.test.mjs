import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Lexicon } from '../public/js/arabic/lexicon.js'
import { Validator } from '../public/js/arabic/validator.js'

// NOTE: the fixture follows the documented Wiktextract JSONL schema (word, pos, lang_code, forms[{form,tags}], senses[{form_of,tags}]).
// It was written by hand: this project's sandbox had no network access, so the builder has NOT been run on a real kaikki dump yet.
const entries = [
  { word: 'كِتَاب', pos: 'noun', lang_code: 'ar', forms: [{ form: 'kitāb', tags: ['romanization'] }, { form: 'كُتُب', tags: ['plural'] }], senses: [{ glosses: ['book'] }] },
  { word: 'كُتُب', pos: 'noun', lang_code: 'ar', senses: [{ form_of: [{ word: 'كتاب' }], glosses: ['plural of كتاب'] }] },
  { word: 'مُحَمَّد', pos: 'name', lang_code: 'ar', senses: [{ glosses: ['a given name'] }] },
  { word: 'كتاب جيد', pos: 'phrase', lang_code: 'ar', senses: [{ glosses: ['x'] }] },
  { word: 'كتبو', pos: 'verb', lang_code: 'ar', senses: [{ tags: ['misspelling'], glosses: ['x'] }] },
  { word: 'ذَهَبَ', pos: 'verb', lang_code: 'ar', forms: [{ form: 'يَذْهَبُ', tags: ['present'] }, { form: 'dhahaba', tags: ['romanization'] }], senses: [{ glosses: ['to go'] }] },
  { word: 'word', pos: 'noun', lang_code: 'en', senses: [{ glosses: ['x'] }] },
]
test('builder: filters, splits lemma/forms tiers, registers in meta, output loads and validates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lex-'))
  writeFileSync(join(dir, 'in.jsonl'), entries.map(e => JSON.stringify(e)).join('\n') + '\n')
  copyFileSync(new URL('../public/data/lexicon/meta.json', import.meta.url), join(dir, 'meta.json'))
  copyFileSync(new URL('../public/data/lexicon/core.txt', import.meta.url), join(dir, 'core.txt'))
  execFileSync('node', ['scripts/build-lexicon.mjs', '--kaikki', join(dir, 'in.jsonl'), '--out', dir], { stdio: 'pipe' })
  const lem = readFileSync(join(dir, 'wiktionary-ar-lemmas.txt'), 'utf8'), frm = readFileSync(join(dir, 'wiktionary-ar-forms.txt'), 'utf8')
  assert.match(lem, /^كتاب\tN$/m); assert.match(lem, /^ذهب\tV$/m)
  assert.doesNotMatch(lem + frm, /محمد|جيد|كتبو|word|kitab|dhahaba/)       // names, phrases, misspellings, other languages, romanizations
  assert.match(frm, /^كتب\tN$/m); assert.match(frm, /^يذهب\tV$/m)
  assert.doesNotMatch(frm, /^كتاب\t/m)                                      // lemma not repeated in forms tier
  assert.match(lem, /CC BY-SA/)
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
  assert.deepEqual(meta.files.map(f => `${f.id}:${f.tier}`), ['core:core', 'wiktionary-ar-lemmas:core', 'wiktionary-ar-forms:extended'])
  const core = new Lexicon(); core.addText(readFileSync(join(dir, 'wiktionary-ar-lemmas.txt'), 'utf8'))
  const ext = new Lexicon(); ext.addText(readFileSync(join(dir, 'wiktionary-ar-forms.txt'), 'utf8'))
  const strict = new Validator({ lexicon: core, policy: 'strict' }), both = new Validator({ lexicon: { lookup: k => [...core.lookup(k), ...ext.lookup(k)] }, policy: 'expanded' })
  assert.equal(strict.check('كتاب').status, 'valid'); assert.equal(strict.check('كتب').status, 'not_found'); assert.equal(both.check('كتب').status, 'valid')
  assert.equal(both.check('محمد').status, 'not_found')
})
