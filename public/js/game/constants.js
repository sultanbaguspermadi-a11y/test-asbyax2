export const SIZE = 15
export const RACK_SIZE = 7
export const BINGO_BONUS = 50
export const CLOCK_SECONDS = 25 * 60
export const MIN_BAG_FOR_SWAP = 7

// Same distribution and values as the original game. `letter` is the canonical letter used for
// word lookup; `shown` is how it is drawn on a tile (heh is drawn with a tatweel so it is
// recognisable as a letter rather than a dot-like isolated form).
export const TILE_SET = [
  ['ا', 1, 8], ['ل', 1, 8], ['ي', 1, 6], ['ت', 1, 4], ['ن', 1, 4], ['ر', 1, 4],
  ['و', 2, 6], ['م', 2, 4], ['ب', 2, 4], ['د', 2, 4], ['ه', 2, 4],
  ['س', 3, 4], ['ج', 3, 2], ['ح', 3, 2], ['ك', 3, 2],
  ['خ', 4, 2], ['ق', 4, 2], ['ف', 4, 2],
  ['ث', 5, 1], ['ذ', 5, 1], ['ش', 5, 1], ['ض', 5, 1],
  ['ط', 8, 1], ['ظ', 8, 1], ['ع', 8, 1],
  ['ص', 10, 1], ['ز', 10, 1], ['غ', 10, 1],
].map(([letter, value, count]) => ({ letter, value, count }))
export const BLANK_COUNT = 2
export const LETTERS = TILE_SET.map(t => t.letter)
export const SHOWN = { 'ه': 'هـ' }
export const shown = letter => SHOWN[letter] ?? letter

// 0 plain, 1 double letter, 2 triple letter, 3 double word, 4 triple word, 5 centre star (double word)
export const LAYOUT = [
  [4, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 1, 0, 0, 4],
  [0, 3, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 3, 0],
  [0, 0, 3, 0, 0, 0, 1, 0, 1, 0, 0, 0, 3, 0, 0],
  [1, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 1],
  [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0],
  [0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0],
  [0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0],
  [4, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 1, 0, 0, 4],
  [0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0],
  [0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0],
  [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0],
  [1, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 1],
  [0, 0, 3, 0, 0, 0, 1, 0, 1, 0, 0, 0, 3, 0, 0],
  [0, 3, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 3, 0],
  [4, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 1, 0, 0, 4],
]
export const PREMIUM = { 0: 'plain', 1: 'dl', 2: 'tl', 3: 'dw', 4: 'tw', 5: 'star' }
