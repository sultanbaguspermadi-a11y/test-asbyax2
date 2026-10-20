import { SIZE, LAYOUT, BINGO_BONUS } from './constants.js'

/**
 * Pure placement + scoring rules. `board` is a SIZE x SIZE array of tiles|null that already contains
 * the tiles placed this turn; `placed` lists their coordinates [{r,c}].
 * Horizontal words are read by increasing column, which the RTL board draws right-to-left, so the
 * string is in natural Arabic reading order. Vertical words read top to bottom.
 *
 * Rules kept from the original game: first move covers the centre; one straight line; no gaps (gaps
 * may be filled by existing tiles); must touch an existing tile after the first move; every run of
 * two or more tiles formed is a word and is scored; premiums count only for tiles placed this turn;
 * the centre star is a double-word; playing all seven tiles adds 50.
 */
const at = (board, r, c) => (r >= 0 && r < SIZE && c >= 0 && c < SIZE ? board[r][c] : null)

function run(board, r, c, dr, dc) {
  let sr = r, sc = c
  while (at(board, sr - dr, sc - dc)) { sr -= dr; sc -= dc }
  const cells = []
  for (let rr = sr, cc = sc; at(board, rr, cc); rr += dr, cc += dc) cells.push({ r: rr, c: cc, tile: board[rr][cc] })
  return cells
}

export function wordText(cells) { return cells.map(x => x.tile.letter).join('') }

export function scoreWord(cells, placedKeys) {
  let sum = 0, mult = 1
  for (const { r, c, tile } of cells) {
    let v = tile.value
    if (placedKeys.has(r * SIZE + c)) {
      const p = LAYOUT[r][c]
      if (p === 1) v *= 2
      else if (p === 2) v *= 3
      else if (p === 3 || p === 5) mult *= 2
      else if (p === 4) mult *= 3
    }
    sum += v
  }
  return sum * mult
}

/** @returns {{ok:true, words:{cells:object[],text:string,score:number}[], score:number, bingo:boolean}|{ok:false, code:string}} */
export function analyzePlacement(board, placed) {
  if (!placed.length) return { ok: false, code: 'none' }
  const keys = new Set(placed.map(p => p.r * SIZE + p.c))
  if (placed.some(p => !board[p.r][p.c])) return { ok: false, code: 'none' }
  if (placed.some(p => board[p.r][p.c].letter === '')) return { ok: false, code: 'blank_unset' }

  let total = 0
  for (const row of board) for (const t of row) if (t) total++
  const first = total === placed.length
  if (first && !keys.has(7 * SIZE + 7)) return { ok: false, code: 'center' }

  const rows = new Set(placed.map(p => p.r)), cols = new Set(placed.map(p => p.c))
  if (rows.size > 1 && cols.size > 1) return { ok: false, code: 'line' }
  if (rows.size === 1) {
    const r = placed[0].r, cs = placed.map(p => p.c)
    for (let c = Math.min(...cs); c <= Math.max(...cs); c++) if (!board[r][c]) return { ok: false, code: 'gap' }
  } else {
    const c = placed[0].c, rs = placed.map(p => p.r)
    for (let r = Math.min(...rs); r <= Math.max(...rs); r++) if (!board[r][c]) return { ok: false, code: 'gap' }
  }

  if (!first) {
    const touches = placed.some(({ r, c }) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
      const t = at(board, r + dr, c + dc)
      return t && !keys.has((r + dr) * SIZE + (c + dc))
    }))
    if (!touches) return { ok: false, code: 'disconnected' }
  }

  const seen = new Set(), words = []
  for (const { r, c } of placed) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const cells = run(board, r, c, dr, dc)
      if (cells.length < 2) continue
      const id = `${cells[0].r},${cells[0].c},${dr}`
      if (seen.has(id)) continue
      seen.add(id)
      words.push({ cells, text: wordText(cells), score: scoreWord(cells, keys) })
    }
  }
  if (!words.length) return { ok: false, code: 'noword' }
  const bingo = placed.length === 7
  return { ok: true, words, bingo, score: words.reduce((s, w) => s + w.score, 0) + (bingo ? BINGO_BONUS : 0) }
}
