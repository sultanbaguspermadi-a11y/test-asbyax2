import { SIZE, RACK_SIZE, TILE_SET, BLANK_COUNT, CLOCK_SECONDS, MIN_BAG_FOR_SWAP } from './constants.js'
import { analyzePlacement } from './rules.js'

const other = p => (p === 1 ? 2 : 1)
const emptyBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null))
const SAVE_VERSION = 1

/** Game state + actions. No DOM. Time is passed in (ms) so the clock is testable and survives throttled tabs. */
export class Game {
  constructor({ rng = Math.random, clockSeconds = CLOCK_SECONDS } = {}) {
    this.rng = rng
    this.clockSeconds = clockSeconds
    this.reset()
  }

  reset() {
    this.nextId = 1
    this.bag = []
    for (const t of TILE_SET) for (let i = 0; i < t.count; i++) this.bag.push(this.#tile(t.letter, t.value, false))
    for (let i = 0; i < BLANK_COUNT; i++) this.bag.push(this.#tile('', 0, true))
    this.#shuffle(this.bag)
    this.board = emptyBoard()
    this.racks = { 1: Array(RACK_SIZE).fill(null), 2: Array(RACK_SIZE).fill(null) }
    this.#fill(1, RACK_SIZE); this.#fill(2, RACK_SIZE)
    this.pending = []            // [{r,c,rackIndex}] - tile objects live in this.board
    this.scores = { 1: 0, 2: 0 }
    this.current = 1
    this.remaining = { 1: this.clockSeconds, 2: this.clockSeconds }
    this.turnStartedAt = null    // ms timestamp; null while the clock is not running
    this.started = false
    this.ended = false
    this.result = null
    this.last = null             // data needed to undo the last submitted move
    this.moves = 0
  }

  #tile(letter, value, blank) { return { id: this.nextId++, letter, value, blank } }
  #shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } }
  #fill(p, n) {
    const rack = this.racks[p]
    for (let i = 0; i < RACK_SIZE && n > 0 && this.bag.length; i++) if (!rack[i]) { rack[i] = this.bag.shift(); n-- }
  }
  get rack() { return this.racks[this.current] }

  /* ---------------- clock ---------------- */
  timeLeft(p, now) {
    const base = this.remaining[p]
    if (!this.started || this.ended || p !== this.current || this.turnStartedAt == null) return Math.max(0, base)
    return Math.max(0, base - (now - this.turnStartedAt) / 1000)
  }
  #settle(now) { if (this.turnStartedAt != null) this.remaining[this.current] = this.timeLeft(this.current, now) }
  #endTurn(now) {
    this.#settle(now)
    this.current = other(this.current)
    this.turnStartedAt = this.started ? now : null
  }
  #startClock(now) { if (!this.started) { this.started = true; this.turnStartedAt = now } }
  /** Call periodically. Ends the game when the current player's clock is exhausted. */
  tick(now) {
    if (this.started && !this.ended && this.timeLeft(this.current, now) <= 0) { this.finish('time', now); return true }
    return false
  }
  /** Freeze the clock (tab hidden / page closing) and resume it later. */
  pauseClock(now) { if (this.started && !this.ended && this.turnStartedAt != null) { this.#settle(now); this.turnStartedAt = null } }
  resumeClock(now) { if (this.started && !this.ended && this.turnStartedAt == null) this.turnStartedAt = now }

  /* ---------------- tile movement (pending move) ---------------- */
  get locked() { return this.ended }
  isPending(r, c) { return this.pending.some(p => p.r === r && p.c === c) }

  placeFromRack(rackIndex, r, c) {
    if (this.ended) return { ok: false, code: 'ended' }
    const tile = this.rack[rackIndex]
    if (!tile) return { ok: false, code: 'empty_slot' }
    if (this.board[r]?.[c] === undefined || this.board[r][c]) return { ok: false, code: 'occupied' }
    this.rack[rackIndex] = null
    this.board[r][c] = tile
    this.pending.push({ r, c, rackIndex })
    return { ok: true, needsBlank: tile.blank }
  }
  moveOnBoard(fr, fc, tr, tc) {
    if (this.ended) return { ok: false, code: 'ended' }
    const p = this.pending.find(x => x.r === fr && x.c === fc)
    if (!p) return { ok: false, code: 'locked' }
    if (this.board[tr]?.[tc] === undefined || this.board[tr][tc]) return { ok: false, code: 'occupied' }
    this.board[tr][tc] = this.board[fr][fc]; this.board[fr][fc] = null
    p.r = tr; p.c = tc
    return { ok: true }
  }
  returnToRack(r, c, slot) {
    if (this.ended) return { ok: false, code: 'ended' }
    const i = this.pending.findIndex(x => x.r === r && x.c === c)
    if (i < 0) return { ok: false, code: 'locked' }
    const [p] = this.pending.splice(i, 1)
    const tile = this.board[r][c]; this.board[r][c] = null
    if (tile.blank) tile.letter = ''
    const rack = this.rack
    const idx = [slot, p.rackIndex].find(s => s != null && !rack[s]) ?? rack.findIndex(t => !t)
    rack[idx] = tile
    return { ok: true }
  }
  recall() { for (const p of [...this.pending].reverse()) this.returnToRack(p.r, p.c) }
  setBlankLetter(r, c, letter) {
    const t = this.board[r]?.[c]
    if (!t || !t.blank || !this.isPending(r, c)) return false
    t.letter = letter
    return true
  }
  /** Move/swap inside the rack (reordering). */
  rackMove(from, to) {
    const rack = this.rack
    if (from === to || !rack[from] || to < 0 || to >= RACK_SIZE) return false
    ;[rack[from], rack[to]] = [rack[to], rack[from]]
    return true
  }
  shuffleRack() {
    if (this.ended || this.pending.length) return false
    const rack = this.rack, tiles = rack.filter(Boolean)
    this.#shuffle(tiles)
    for (let i = 0; i < RACK_SIZE; i++) rack[i] = tiles[i] ?? null
    return true
  }

  /* ---------------- analysis / commit ---------------- */
  analyze() { return analyzePlacement(this.board, this.pending) }

  /** Commit an already-analysed (and, by the caller, word-validated) move. */
  commit(analysis, now) {
    if (this.ended) return { ok: false, code: 'ended' }
    if (!analysis?.ok) return { ok: false, code: analysis?.code ?? 'none' }
    this.#startClock(now)
    const player = this.current, rack = this.rack
    const placements = this.pending.map(p => ({ ...p, tile: this.board[p.r][p.c] }))
    const used = placements.length
    const emptyAfter = rack.every(t => !t)
    const drawn = []
    if (!emptyAfter || this.bag.length) {
      for (let i = 0; i < RACK_SIZE && drawn.length < used && this.bag.length; i++) if (!rack[i]) { const t = this.bag.shift(); rack[i] = t; drawn.push(t) }
    }
    this.scores[player] += analysis.score
    this.pending = []
    this.moves++
    this.last = { player, score: analysis.score, placements, drawn }
    if (rack.every(t => !t) && this.bag.length === 0) { this.finish('rack', now); return { ok: true, score: analysis.score, ended: true } }
    this.#endTurn(now)
    return { ok: true, score: analysis.score, ended: false }
  }

  pass(now) {
    if (this.ended) return { ok: false, code: 'ended' }
    if (this.pending.length) return { ok: false, code: 'pending' }
    this.last = null
    this.#endTurn(now)
    return { ok: true }
  }

  canSwap() { return this.bag.length >= MIN_BAG_FOR_SWAP }
  swap(indices, now) {
    if (this.ended) return { ok: false, code: 'ended' }
    if (this.pending.length) return { ok: false, code: 'pending' }
    const idx = [...new Set(indices)].filter(i => this.rack[i])
    if (!idx.length) return { ok: false, code: 'none' }
    if (!this.canSwap()) return { ok: false, code: 'bag' }
    const rack = this.rack, out = idx.map(i => { const t = rack[i]; if (t.blank) t.letter = ''; rack[i] = null; return t })
    for (const i of idx) rack[i] = this.bag.shift()
    this.bag.push(...out)
    this.#shuffle(this.bag)
    this.last = null
    this.#startClock(now)
    this.#endTurn(now)
    return { ok: true, count: idx.length }
  }

  canUndo() { return !!this.last && !this.pending.length && !this.ended }
  undo(now) {
    if (!this.canUndo()) return { ok: false, code: 'nothing' }
    const { player, score, placements, drawn } = this.last
    this.#settle(now)
    this.current = player
    const rack = this.racks[player]
    for (const t of drawn) { const i = rack.findIndex(x => x && x.id === t.id); if (i >= 0) rack[i] = null }
    this.bag.unshift(...drawn)
    for (const { r, c, rackIndex, tile } of placements) {
      this.board[r][c] = null
      if (tile.blank) tile.letter = ''
      const i = !rack[rackIndex] ? rackIndex : rack.findIndex(x => !x)
      rack[i] = tile
    }
    this.scores[player] -= score
    this.moves = Math.max(0, this.moves - 1)
    this.last = null
    this.turnStartedAt = this.started ? now : null
    return { ok: true, player, score }
  }

  finish(reason, now) {
    if (this.ended) return this.result
    this.#settle(now)
    this.recall()
    this.turnStartedAt = null
    const deduction = {}, bonus = {}
    for (const p of [1, 2]) {
      deduction[p] = this.racks[p].reduce((s, t) => s + (t ? (t.blank ? 0 : t.value) : 0), 0)
      bonus[p] = Math.floor(this.remaining[p] / 60)
      this.scores[p] = Math.max(0, this.scores[p] - deduction[p] + bonus[p])
    }
    this.ended = true
    const [a, b] = [this.scores[1], this.scores[2]]
    this.result = { reason, deduction, bonus, scores: { ...this.scores }, winner: a === b ? 0 : a > b ? 1 : 2 }
    return this.result
  }

  /* ---------------- persistence ---------------- */
  /** @param {number} [now] when given, the running clock is settled into the saved remaining time */
  serialize(now) {
    const remaining = { ...this.remaining }
    if (now != null) remaining[this.current] = this.timeLeft(this.current, now)
    return {
      v: SAVE_VERSION, nextId: this.nextId, bag: this.bag, racks: this.racks, board: this.board,
      pending: this.pending, scores: this.scores, current: this.current, remaining,
      started: this.started, ended: this.ended, result: this.result, last: this.last, moves: this.moves,
      clockSeconds: this.clockSeconds,
    }
  }
  /** Returns a Game, or null when the data is not a valid save of this version. The clock is restored paused. */
  static restore(data, opts) {
    try {
      if (!data || data.v !== SAVE_VERSION) return null
      const g = new Game(opts)
      const ok = Array.isArray(data.board) && data.board.length === SIZE && data.board.every(r => Array.isArray(r) && r.length === SIZE)
        && [1, 2].every(p => Array.isArray(data.racks?.[p]) && data.racks[p].length === RACK_SIZE) && Array.isArray(data.bag)
        && (data.current === 1 || data.current === 2)
      if (!ok) return null
      const tiles = [...data.bag, ...data.racks[1], ...data.racks[2], ...data.board.flat()].filter(Boolean)
      if (tiles.length !== TILE_SET.reduce((s, t) => s + t.count, BLANK_COUNT) || new Set(tiles.map(t => t.id)).size !== tiles.length) return null
      Object.assign(g, data, { rng: g.rng, turnStartedAt: null })
      return g
    } catch { return null }
  }
}
