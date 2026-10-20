import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Game } from '../public/js/game/game.js'
import { analyzePlacement, scoreWord } from '../public/js/game/rules.js'
import { TILE_SET, LAYOUT, BLANK_COUNT, SIZE } from '../public/js/game/constants.js'

const seeded = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const T = (letter, value = 1, id = Math.random()) => ({ id, letter, value, blank: false })
const emptyBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null))
function put(board, r, c, word, vertical = false) {
  const placed = []
  ;[...word].forEach((ch, i) => { const rr = vertical ? r + i : r, cc = vertical ? c : c + i; board[rr][cc] = T(ch); placed.push({ r: rr, c: cc }) })
  return placed
}

test('tile distribution matches the original game (84 tiles incl. 2 blanks)', () => {
  assert.equal(TILE_SET.reduce((s, t) => s + t.count, BLANK_COUNT), 84)
  assert.equal(LAYOUT.length, 15)
  assert.equal(LAYOUT[7][7], 5)
  for (let i = 0; i < 15; i++) for (let j = 0; j < 15; j++) assert.equal(LAYOUT[i][j], LAYOUT[j][i], 'layout symmetric')
})

test('first move: centre required, line required, single tile has no word', () => {
  let b = emptyBoard(); let p = put(b, 7, 2, 'كتاب')
  assert.equal(analyzePlacement(b, p).code, 'center')
  b = emptyBoard(); p = put(b, 7, 5, 'كتاب')
  const a = analyzePlacement(b, p); assert.ok(a.ok); assert.deepEqual(a.words.map(w => w.text), ['كتاب'])
  b = emptyBoard(); b[7][7] = T('ك'); assert.equal(analyzePlacement(b, [{ r: 7, c: 7 }]).code, 'noword')
  b = emptyBoard(); b[7][7] = T('ك'); b[8][8] = T('ت'); assert.equal(analyzePlacement(b, [{ r: 7, c: 7 }, { r: 8, c: 8 }]).code, 'line')
})

test('scoring: letter/word premiums only for new tiles, star doubles, bingo +50', () => {
  const b = emptyBoard()
  const p = put(b, 7, 7, 'ابتثجحخ')           // 7 tiles from centre rightwards, values all 1
  const a = analyzePlacement(b, p)
  // squares (7,7)=star(DW) (7,11)=DL -> letters 1*7 +1 (DL) = 8, x2 = 16, +50 bingo
  assert.ok(a.bingo); assert.equal(a.score, 16 + 50)
  const keys = new Set([7 * 15 + 7])
  assert.equal(scoreWord([{ r: 7, c: 7, tile: T('ا', 3) }, { r: 7, c: 8, tile: T('ب', 2) }], keys), 10) // star only on the new tile; existing letter has no premium
})

test('gap, disconnected, intersecting crosswords, extension', () => {
  const b = emptyBoard(); put(b, 7, 5, 'كتاب')                                  // existing word row 7, cols 5..8
  const placed = put(b, 8, 5, 'ل', true).slice(0)                                // hmm: below the first letter
  b[8][5] = T('ل'); let a = analyzePlacement(b, [{ r: 8, c: 5 }])
  assert.ok(a.ok); assert.deepEqual(a.words.map(w => w.text), ['كل'])           // vertical 2-letter word
  // two new tiles forming a vertical word through existing tile + a crossword
  b[8][6] = T('ا'); a = analyzePlacement(b, [{ r: 8, c: 5 }, { r: 8, c: 6 }])
  assert.deepEqual(a.words.map(w => w.text).sort(), ['كل', 'لا', 'تا'].sort())    // main row word + two crosswords
  // disconnected
  const c = emptyBoard(); put(c, 7, 5, 'كتاب'); const far = put(c, 12, 2, 'ما')
  assert.equal(analyzePlacement(c, far).code, 'disconnected')
  // gap
  const d = emptyBoard(); put(d, 7, 5, 'كتاب'); d[9][5] = T('ا'); d[11][5] = T('ب')
  assert.equal(analyzePlacement(d, [{ r: 9, c: 5 }, { r: 11, c: 5 }]).code, 'gap')
  // extension of an existing word reads the whole word
  const e = emptyBoard(); put(e, 7, 5, 'كتاب'); e[7][9] = T('ه')
  assert.deepEqual(analyzePlacement(e, [{ r: 7, c: 9 }]).words.map(w => w.text), ['كتابه'])
})

test('game: deal, turn flow, rack refill, scores, undo restores everything incl. blanks', () => {
  const g = new Game({ rng: seeded(7) })
  assert.equal(g.bag.length, 84 - 14)
  const letters = g.rack.map(t => t.letter)
  g.rack[0] = T('ك', 3, 9001); g.rack[1] = T('ت', 1, 9002)
  assert.ok(g.placeFromRack(0, 7, 7).ok); assert.ok(g.placeFromRack(1, 7, 8).ok)
  assert.equal(g.placeFromRack(2, 7, 7).code, 'occupied')
  const an = g.analyze(); assert.ok(an.ok)
  const bagBefore = g.bag.length
  const res = g.commit(an, 1000)
  assert.ok(res.ok); assert.equal(g.current, 2); assert.equal(g.bag.length, bagBefore - 2)
  assert.equal(g.racks[1].filter(Boolean).length, 7); assert.equal(g.scores[1], an.score)
  assert.ok(g.started)
  const snap = JSON.stringify(g.serialize())
  assert.ok(g.undo(2000).ok)
  assert.equal(g.current, 1); assert.equal(g.scores[1], 0); assert.equal(g.bag.length, bagBefore)
  assert.ok(g.board.flat().every(t => !t)); assert.equal(g.racks[1].filter(Boolean).length, 7)
  assert.ok(Game.restore(JSON.parse(snap)))   // saved mid-game state is restorable
  assert.equal(new Set(letters).size > 0, true)
})

test('blank tile: needs a letter, scores 0, resets on recall and undo', () => {
  const g = new Game({ rng: seeded(3) })
  const blank = { id: 777, letter: '', value: 0, blank: true }
  g.rack[0] = blank; g.rack[1] = T('ا', 1, 778)
  assert.ok(g.placeFromRack(0, 7, 7).needsBlank); g.placeFromRack(1, 7, 8)
  assert.equal(g.analyze().code, 'blank_unset')
  g.setBlankLetter(7, 7, 'ك')
  const an = g.analyze(); assert.ok(an.ok)
  assert.equal(an.words[0].text, 'كا'); assert.equal(an.score, (0 + 1) * 2)
  g.recall(); assert.equal(blank.letter, ''); assert.equal(g.pending.length, 0)
  g.placeFromRack(g.rack.indexOf(blank), 7, 7); g.placeFromRack(g.rack.findIndex(t => t?.id === 778), 7, 8); g.setBlankLetter(7, 7, 'ك')
  g.commit(g.analyze(), 5); g.undo(6); assert.equal(blank.letter, '')
})

test('swap: needs >=7 in bag, returns tiles, passes turn; pass keeps rack', () => {
  const g = new Game({ rng: seeded(5) })
  const before = g.rack.map(t => t.id)
  assert.ok(g.swap([0, 1, 1, 2], 10).ok)
  assert.equal(g.current, 2); assert.equal(g.bag.length, 70)
  assert.deepEqual(g.racks[1].slice(3).map(t => t.id), before.slice(3))
  g.bag.length = 6; assert.equal(g.swap([0], 11).code, 'bag')
  assert.ok(g.pass(12).ok); assert.equal(g.current, 1)
})

test('clock: counts only the current player, ends the game, time bonus applied', () => {
  const g = new Game({ rng: seeded(9), clockSeconds: 120 })
  g.pass(0)                                    // pass does not start the clock
  assert.equal(g.started, false)
  g.swap([0], 1000)                            // starts the clock; now player 1's turn again? no: player 2 moves after swap by 1 -> current is 1
  assert.equal(g.started, true)
  assert.equal(Math.round(g.timeLeft(g.current, 31000)), 90)
  assert.equal(g.tick(60000), false)
  const loser = g.current
  assert.equal(g.tick(1000 + 121000), true)
  assert.ok(g.ended); assert.equal(g.result.reason, 'time')
  assert.equal(g.timeLeft(loser, 999999), 0)
  assert.equal(g.placeFromRack(0, 7, 7).code, 'ended')
})

test('game end by emptied rack and final-score rules', () => {
  const g = new Game({ rng: seeded(11) })
  g.bag.length = 0
  g.racks[1] = [T('ك', 3), T('ت', 1), null, null, null, null, null]
  g.racks[2] = [T('ص', 10), null, null, null, null, null, null]
  g.scores = { 1: 0, 2: 20 }
  g.placeFromRack(0, 7, 7); g.placeFromRack(1, 7, 8)
  const r = g.commit(g.analyze(), 100)
  assert.ok(r.ended && g.ended); assert.equal(g.result.reason, 'rack')
  assert.equal(g.result.deduction[2], 10)
  assert.equal(g.scores[2], 10 + 25)           // 20 - 10 + 25 minutes remaining
  assert.equal(g.result.winner, 2)
})

test('save/restore round-trip and rejection of corrupt saves', () => {
  const g = new Game({ rng: seeded(21) })
  g.rack[0] = T('ك', 3, 5000); g.rack[1] = T('ت', 1, 5001)
  g.placeFromRack(0, 7, 7); g.placeFromRack(1, 7, 8); g.commit(g.analyze(), 50)
  const copy = Game.restore(JSON.parse(JSON.stringify(g.serialize())))
  assert.ok(copy); assert.equal(copy.scores[1], g.scores[1]); assert.equal(copy.turnStartedAt, null)
  assert.equal(copy.board[7][7].letter, 'ك')
  const bad = JSON.parse(JSON.stringify(g.serialize())); bad.bag.pop()
  assert.equal(Game.restore(bad), null)
  assert.equal(Game.restore({ v: 99 }), null); assert.equal(Game.restore(null), null)
})
