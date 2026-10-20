import { Game } from './game/game.js'
import { SIZE, RACK_SIZE, LAYOUT, PREMIUM, LETTERS, shown } from './game/constants.js'
import { ValidatorClient } from './arabic/client.js'
import { loadSettings, saveSettings, loadGame, saveGame, clearGame, loadCustomWords, saveCustomWords } from './store.js'
import { setupDrag } from './ui/drag.js'
import { ERRORS, PREMIUM_NAMES, PREMIUM_LABEL, playerName, fmtClock } from './ui/text.js'
import { initPwa } from './pwa.js'

const $ = id => document.getElementById(id)
const now = () => performance.now()
const settings = loadSettings()
const customWords = loadCustomWords()
const validator = new ValidatorClient({ baseUrl: '/data/lexicon/', policy: settings.policy, custom: customWords })

/* ---------- fonts (non-blocking; the CSS font stacks have system fallbacks) ---------- */
{
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Noto+Naskh+Arabic:wght@600;700&display=swap'
  document.head.append(l)
}

/* ---------- state ---------- */
let game = (() => { const g = Game.restore(loadGame()); if (g) { g.resumeClock(now()); return g } return new Game() })()
const ui = { selected: null, swap: false, swapSel: new Set(), cursor: { r: 7, c: 7 }, busy: false, checkToken: 0, lastPlaced: null }

/* ---------- status / toast ---------- */
let statusTimer = 0
function say(text, type = 'info', ms = 5000) {
  const el = $('status')
  el.textContent = text; el.dataset.t = type
  clearTimeout(statusTimer)
  if (ms) statusTimer = setTimeout(() => { el.textContent = ''; delete el.dataset.t }, ms)
}
let toastTimer = 0
function notify(text, { ms = 5000, action = null } = {}) {
  const t = $('toast'), btn = t.querySelector('button')
  t.querySelector('.toast-text').textContent = text
  btn.hidden = !action
  if (action) { btn.textContent = action[0]; btn.onclick = () => { action[1](); t.hidden = true } }
  t.hidden = false
  clearTimeout(toastTimer)
  if (ms) toastTimer = setTimeout(() => { t.hidden = true }, ms)
}

/* ---------- persistence ---------- */
const persist = () => saveGame(game.serialize(now()))

/* ---------- theme ---------- */
const mq = matchMedia('(prefers-color-scheme: dark)')
function effectiveTheme() { return settings.theme === 'system' ? (mq.matches ? 'dark' : 'light') : settings.theme }
function applyTheme() {
  const t = effectiveTheme()
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]').content = t === 'dark' ? '#0a1a20' : '#0c4a3c'
  const b = $('btn-theme'); b.setAttribute('aria-pressed', String(t === 'dark'))
  const label = t === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'
  b.setAttribute('aria-label', label); b.title = label
}
mq.addEventListener('change', () => { if (settings.theme === 'system') applyTheme() })   // never overrides a manual choice
$('btn-theme').addEventListener('click', () => { settings.theme = effectiveTheme() === 'dark' ? 'light' : 'dark'; saveSettings(settings); applyTheme() })

/* ---------- board / rack construction ---------- */
const boardEl = $('board'), rackEl = $('rack')
const squares = Array.from({ length: SIZE }, () => Array(SIZE))
function buildBoard() {
  for (let r = 0; r < SIZE; r++) {
    const row = document.createElement('div'); row.className = 'row'; row.setAttribute('role', 'row'); row.setAttribute('aria-rowindex', r + 1)
    for (let c = 0; c < SIZE; c++) {
      const kind = PREMIUM[LAYOUT[r][c]]
      const sq = document.createElement('button')
      sq.type = 'button'; sq.className = 'sq'; sq.dataset.r = r; sq.dataset.c = c; sq.dataset.p = kind
      sq.setAttribute('role', 'gridcell'); sq.setAttribute('aria-colindex', c + 1); sq.tabIndex = -1
      if (kind !== 'plain') {
        const p = document.createElement('span'); p.className = 'prem'
        if (kind === 'star') { p.classList.add('prem-star'); p.textContent = '★' }
        else { const [n, t] = PREMIUM_LABEL[kind]; const a = document.createElement('span'); a.className = 'prem-n'; a.textContent = n; const b = document.createElement('span'); b.className = 'prem-t'; b.textContent = t; p.append(a, b) }
        sq.append(p)
      }
      squares[r][c] = sq; row.append(sq)
    }
    boardEl.append(row)
  }
  squares[ui.cursor.r][ui.cursor.c].tabIndex = 0
}
const slots = []
function buildRack() {
  for (let i = 0; i < RACK_SIZE; i++) {
    const s = document.createElement('button'); s.type = 'button'; s.className = 'slot'; s.dataset.i = i; s.tabIndex = i === 0 ? 0 : -1
    slots.push(s); rackEl.append(s)
  }
}

function tileEl(tile, { pending = false, draggable = false, faceDown = false } = {}) {
  const t = document.createElement('span')
  t.className = 'tile' + (faceDown ? ' facedown' : '')
  t.dataset.id = tile.id
  if (tile.blank) t.dataset.blank = 'true'
  if (pending) t.dataset.pending = 'true'
  if (draggable) t.dataset.draggable = 'true'
  const l = document.createElement('span'); l.className = 't-letter'; l.textContent = shown(tile.letter)
  const v = document.createElement('span'); v.className = 't-val'; v.textContent = tile.blank ? '' : String(tile.value)
  t.append(l, v)
  return t
}
const tileName = t => (t.blank ? (t.letter ? `قطعة فارغة تمثّل ${t.letter}` : 'قطعة فارغة') : `الحرف ${t.letter}، قيمته ${t.value}`)

/* ---------- rendering ---------- */
function renderBoard() {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const sq = squares[r][c], tile = game.board[r][c], pending = !!tile && game.isPending(r, c)
    const sig = tile ? `${tile.id}|${tile.letter}|${pending}` : ''
    if (sq._sig !== sig) {
      sq._sig = sig
      sq.querySelector('.tile')?.remove()
      if (tile) {
        const t = tileEl(tile, { pending, draggable: pending && !game.ended })
        if (ui.lastPlaced === `${r},${c}`) t.classList.add('just-placed')
        sq.append(t); sq.dataset.tile = '1'
      } else delete sq.dataset.tile
      const where = `الصف ${r + 1}، العمود ${c + 1}`
      sq.setAttribute('aria-label', tile ? `${where}: ${tileName(tile)}${pending ? '، موضوعة في هذه الحركة' : ''}` : `${where}: ${PREMIUM_NAMES[sq.dataset.p]}، فارغ`)
    }
  }
  ui.lastPlaced = null
}
function renderRacks() {
  const rack = game.rack
  rackEl.setAttribute('aria-label', `رف ${playerName(game.current)}`)
  slots.forEach((s, i) => {
    const tile = rack[i]
    const sig = tile ? `${tile.id}|${tile.letter}` : ''
    if (s._sig !== sig) {
      s._sig = sig; s.querySelector('.tile')?.remove()
      if (tile) s.append(tileEl(tile, { draggable: !game.ended && !ui.swap }))
    } else if (tile) s.querySelector('.tile').dataset.draggable = String(!game.ended && !ui.swap)
    s.setAttribute('aria-label', tile ? tileName(tile) : 'خانة فارغة')
    s.setAttribute('aria-pressed', String(!ui.swap && ui.selected === i && !!tile))
    s.classList.toggle('swap-sel', ui.swap && ui.swapSel.has(i))
    s.disabled = game.ended
  })
  for (const p of [1, 2]) {
    const mini = document.querySelector(`#p${p} .mini-rack`)
    const show = settings.showOpponentRack && p !== game.current && !game.ended
    mini.hidden = !show
    if (show) { mini.replaceChildren(...game.racks[p].filter(Boolean).map(t => tileEl(t))); mini.setAttribute('aria-label', `رف ${playerName(p)}`) }
  }
}
function renderPlayers() {
  for (const p of [1, 2]) {
    const el = $(`p${p}`), active = game.current === p && !game.ended
    el.dataset.active = String(active)
    el.querySelector('.score').textContent = game.scores[p]
    el.querySelector('.turn-badge').hidden = !active
  }
  updateClocks()
}
function updateClocks() {
  const t = now()
  for (const p of [1, 2]) {
    const left = game.timeLeft(p, t), el = document.querySelector(`#p${p} .clock`)
    el.querySelector('.clock-text').textContent = fmtClock(left)
    el.dataset.low = String(game.started && !game.ended && left < 60)
    el.setAttribute('aria-label', `الوقت المتبقي للاعب ${p === 1 ? 'الأول' : 'الثاني'}: ${fmtClock(left)}`)
  }
  $('bag').querySelector('.bag-n').textContent = game.bag.length
}
function renderControls() {
  const pend = game.pending.length > 0, over = game.ended
  const submit = $('btn-submit'), recall = $('btn-recall')
  const label = (b, text) => { b.querySelector('span').textContent = text }
  if (ui.swap) {
    label(submit, 'تأكيد التبديل'); label(recall, 'إلغاء التبديل')
    submit.disabled = ui.swapSel.size === 0 || ui.busy; recall.disabled = false
    submit.dataset.mode = 'swap'
  } else {
    label(submit, 'احتساب الحركة'); label(recall, 'استرجاع')
    submit.disabled = !pend || over || ui.busy; recall.disabled = !pend || over
    delete submit.dataset.mode
  }
  $('btn-swap').disabled = over || pend || ui.swap
  $('btn-pass').disabled = over || pend || ui.swap
  $('btn-shuffle').disabled = over || pend || ui.swap
  $('btn-undo').disabled = !game.canUndo() || ui.swap
}

let previewToken = 0
function renderPreview() {
  const el = $('preview'), token = ++previewToken
  if (ui.swap || !game.pending.length) { el.replaceChildren(); return }
  const a = game.analyze()
  if (!a.ok) { el.replaceChildren(); if (a.code !== 'none') { const s = document.createElement('span'); s.textContent = ERRORS[a.code]; el.append(s) } return }
  const chips = a.words.map(w => { const c = document.createElement('span'); c.className = 'chip'; c.dataset.s = 'checking'; const m = document.createElement('span'); m.className = 'mark'; m.textContent = '…'; const t = document.createElement('bdi'); t.textContent = w.text; c.append(t, m); return c })
  const score = document.createElement('span'); score.className = 'chip-score'; score.textContent = `+${a.score}`
  score.setAttribute('aria-label', `نقاط الحركة ${a.score}`)
  el.replaceChildren(...chips, score)
  validator.check(a.words.map(w => w.text)).then(rs => {
    if (token !== previewToken) return
    rs.forEach((r, i) => {
      chips[i].dataset.s = r.status
      const m = chips[i].querySelector('.mark')
      m.textContent = r.status === 'valid' ? '✓' : '؟'
      chips[i].title = r.status === 'valid' ? 'موجودة في القاموس' : r.status === 'unavailable' ? 'التحقق غير متاح' : 'غير موجودة في القاموس المثبّت'
      m.setAttribute('aria-label', chips[i].title)
    })
  })
}

function render() { renderBoard(); renderRacks(); renderPlayers(); renderControls(); renderPreview() }
function changed({ save = true } = {}) { render(); if (save) persist() }

/* ---------- interaction ---------- */
const guard = () => { if (game.ended) { say(ERRORS.ended, 'error'); return true } return ui.busy }

function chooseBlank() {
  const dlg = $('dlg-blank')
  return new Promise(resolve => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue && LETTERS.includes(dlg.returnValue) ? dlg.returnValue : null), { once: true })
    dlg.returnValue = ''; dlg.showModal()
  })
}

async function placeSelected(r, c) {
  const idx = ui.selected
  const res = game.placeFromRack(idx, r, c)
  if (!res.ok) { say(ERRORS[res.code] || ERRORS.occupied, 'error'); return }
  ui.selected = null; ui.lastPlaced = `${r},${c}`
  await afterPlace(r, c, res)
}
async function afterPlace(r, c, res) {
  if (res.needsBlank) {
    changed({ save: false })
    const letter = await chooseBlank()
    if (letter) game.setBlankLetter(r, c, letter); else game.returnToRack(r, c)
  }
  changed()
}

boardEl.addEventListener('click', async e => {
  const sq = e.target.closest('.sq'); if (!sq || guard() || ui.swap) return
  const r = +sq.dataset.r, c = +sq.dataset.c
  moveCursor(r, c, false)
  if (game.board[r][c]) {
    if (game.isPending(r, c)) { game.returnToRack(r, c); changed() }
    else say('هذه القطعة من حركة سابقة ولا يمكن تحريكها.', 'info', 2500)
  } else if (ui.selected != null && game.rack[ui.selected]) {
    ui.busy = true; try { await placeSelected(r, c) } finally { ui.busy = false; renderControls() }
  } else say('اختر قطعة من الرف أولاً.', 'info', 2500)
})

rackEl.addEventListener('click', e => {
  const s = e.target.closest('.slot'); if (!s || game.ended || ui.busy) return
  const i = +s.dataset.i
  if (!game.rack[i]) return
  if (ui.swap) { ui.swapSel.has(i) ? ui.swapSel.delete(i) : ui.swapSel.add(i) }
  else ui.selected = ui.selected === i ? null : i
  render()
})

setupDrag({
  root: document.body,
  isBusy: () => ui.busy || game.ended || ui.swap,
  resolveSource(el) {
    const slot = el.closest('.slot'), sq = el.closest('.sq')
    if (slot) return { kind: 'rack', i: +slot.dataset.i }
    if (sq && game.isPending(+sq.dataset.r, +sq.dataset.c)) return { kind: 'board', r: +sq.dataset.r, c: +sq.dataset.c }
    return null
  },
  resolveTarget(el) { const t = el?.closest?.('.sq, .slot'); return t && (t.classList.contains('sq') ? boardEl.contains(t) : rackEl.contains(t)) ? t : null },
  async onDrop(src, target) {
    ui.busy = true
    try {
      if (target.classList.contains('sq')) {
        const r = +target.dataset.r, c = +target.dataset.c
        if (src.kind === 'rack') {
          const res = game.placeFromRack(src.i, r, c)
          if (!res.ok) { say(ERRORS[res.code], 'error', 2500); return }
          ui.selected = null; ui.lastPlaced = `${r},${c}`; await afterPlace(r, c, res); return
        }
        if (src.r === r && src.c === c) return
        const res = game.moveOnBoard(src.r, src.c, r, c)
        if (!res.ok) say(ERRORS[res.code] || ERRORS.occupied, 'error', 2500)
      } else {
        const i = +target.dataset.i
        if (src.kind === 'rack') game.rackMove(src.i, i)
        else game.returnToRack(src.r, src.c, i)
      }
      changed()
    } finally { ui.busy = false; renderControls() }
  },
})

/* keyboard: arrows move around the board (RTL: left = next column) and the rack; 1-7 pick a rack tile */
function moveCursor(r, c, focus = true) {
  r = Math.max(0, Math.min(SIZE - 1, r)); c = Math.max(0, Math.min(SIZE - 1, c))
  squares[ui.cursor.r][ui.cursor.c].tabIndex = -1
  squares[ui.cursor.r][ui.cursor.c].removeAttribute('data-cursor')
  ui.cursor = { r, c }
  const sq = squares[r][c]; sq.tabIndex = 0
  if (focus) sq.focus()
}
boardEl.addEventListener('focusin', e => { const sq = e.target.closest('.sq'); if (sq) moveCursor(+sq.dataset.r, +sq.dataset.c, false) })
boardEl.addEventListener('keydown', e => {
  const sq = e.target.closest('.sq'); if (!sq) return
  const r = +sq.dataset.r, c = +sq.dataset.c
  const map = { ArrowRight: [0, -1], ArrowLeft: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }
  if (map[e.key]) { e.preventDefault(); moveCursor(r + map[e.key][0], c + map[e.key][1]) }
  else if (e.key === 'Home') { e.preventDefault(); moveCursor(r, 0) }
  else if (e.key === 'End') { e.preventDefault(); moveCursor(r, SIZE - 1) }
})
rackEl.addEventListener('keydown', e => {
  const i = slots.indexOf(document.activeElement); if (i < 0) return
  const d = { ArrowRight: -1, ArrowLeft: 1 }[e.key]
  if (d) { e.preventDefault(); const n = Math.max(0, Math.min(RACK_SIZE - 1, i + d)); slots[i].tabIndex = -1; slots[n].tabIndex = 0; slots[n].focus() }
})
addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return
  if (/^[1-7]$/.test(e.key) && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
    const i = +e.key - 1
    if (!game.ended && !ui.busy && game.rack[i]) { if (ui.swap) { ui.swapSel.has(i) ? ui.swapSel.delete(i) : ui.swapSel.add(i) } else ui.selected = ui.selected === i ? null : i; render() }
  } else if (e.key === 'Escape' && ui.selected != null) { ui.selected = null; render() }
})

/* ---------- actions ---------- */
function confirmDialog({ title, body, ok }) {
  const dlg = $('dlg-confirm')
  dlg.querySelector('h2').textContent = title
  dlg.querySelector('.dlg-body').textContent = body
  dlg.querySelector('.btn-danger').textContent = ok
  return new Promise(resolve => { dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }); dlg.returnValue = ''; dlg.showModal() })
}
function showUnknown(results) {
  const dlg = $('dlg-unknown')
  const list = $('unknown-list'); list.replaceChildren()
  for (const r of results) {
    const li = document.createElement('li'); const w = document.createElement('bdi'); w.textContent = r.word
    const why = document.createElement('span'); why.className = 'why'; why.textContent = r.status === 'unavailable' ? 'التحقق غير متاح' : 'غير موجودة'
    li.append(w, why); list.append(li)
  }
  const unavailable = results.some(r => r.status === 'unavailable')
  $('unknown-intro').textContent = unavailable ? 'تعذّر تحميل القاموس، فلا يمكن التحقق من الكلمات التالية.' : 'لم تُوجد هذه الكلمات في القاموس المثبّت.'
  $('unknown-note').textContent = 'هذا لا يعني أنها غير صحيحة في العربية: القاموس الحالي محدود. اتفق اللاعبان على قبولها أو عدّلا الحركة.'
  dlg.querySelector('[value="add"]').hidden = unavailable
  return new Promise(resolve => { dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true }); dlg.returnValue = 'cancel'; dlg.showModal() })
}

async function submit() {
  if (guard()) return
  if (ui.swap) return doSwap()
  const a = game.analyze()
  if (!a.ok) { say(ERRORS[a.code], 'error'); return }
  ui.busy = true; renderControls()
  try {
    const results = await validator.check(a.words.map(w => w.text))
    const bad = results.filter(r => r.status !== 'valid')
    if (bad.length) {
      const unavailable = bad.some(r => r.status === 'unavailable')
      if (settings.unknown === 'block' && !unavailable) {
        say(`الحركة مرفوضة — كلمات غير موجودة في القاموس: ${bad.map(b => b.word).join('، ')}`, 'error', 8000)
        return
      }
      const choice = await showUnknown(bad)
      if (choice === 'cancel') { say('عدّل الحركة أو استرجع القطع.', 'info', 3000); return }
      if (choice === 'add') {
        for (const b of bad) if (!customWords.includes(b.word)) customWords.push(b.word)
        saveCustomWords(customWords); await validator.setCustom(customWords)
      }
    }
    const who = game.current
    const res = game.commit(a, now())
    if (!res.ok) { say(ERRORS[res.code] || ERRORS.none, 'error'); return }
    ui.selected = null
    say(`سجّل ${playerName(who)} ${res.score} نقطة. ${res.ended ? '' : `الدور الآن لـ${playerName(game.current)}.`}`, 'success')
    changed()
    if (res.ended) showOver()
  } finally { ui.busy = false; renderControls() }
}

function doSwap() {
  const res = game.swap([...ui.swapSel], now())
  if (!res.ok) { say(ERRORS[res.code] || ERRORS.none, 'error'); return }
  ui.swap = false; ui.swapSel.clear(); ui.selected = null
  say(`تم تبديل ${res.count} قطع. الدور الآن لـ${playerName(game.current)}.`, 'success')
  changed()
}

$('btn-submit').addEventListener('click', submit)
$('btn-recall').addEventListener('click', () => {
  if (game.ended) return
  if (ui.swap) { ui.swap = false; ui.swapSel.clear(); say('أُلغي التبديل.'); render(); return }
  game.recall(); ui.selected = null; say('أُعيدت القطع إلى الرف.', 'info', 2500); changed()
})
$('btn-swap').addEventListener('click', () => {
  if (guard()) return
  if (game.pending.length) { say(ERRORS.pending, 'error'); return }
  if (!game.canSwap()) { say(ERRORS.bag, 'error'); return }
  ui.swap = true; ui.swapSel.clear(); ui.selected = null
  say('حدّد القطع التي تريد تبديلها ثم اضغط «تأكيد التبديل».', 'info', 0); render()
})
$('btn-pass').addEventListener('click', () => {
  if (guard()) return
  const res = game.pass(now()); if (!res.ok) { say(ERRORS[res.code], 'error'); return }
  ui.selected = null; say(`تم تمرير الدور. الدور الآن لـ${playerName(game.current)}.`, 'success'); changed()
})
$('btn-shuffle').addEventListener('click', () => { if (guard()) return; if (game.shuffleRack()) { ui.selected = null; changed() } })
$('btn-undo').addEventListener('click', async () => {
  if (guard() || !game.canUndo()) return
  if (!(await confirmDialog({ title: 'التراجع عن الحركة الأخيرة', body: 'ستُعاد القطع والنقاط إلى ما كانت عليه قبل آخر حركة. لا يمكن التراجع أكثر من حركة واحدة.', ok: 'نعم، تراجع' }))) return
  const res = game.undo(now())
  if (res.ok) { say(`أُلغيت حركة ${playerName(res.player)} واستُعيدت ${res.score} نقطة.`, 'info'); ui.selected = null; changed() }
})
async function newGame(ask = true) {
  if (ask && !game.ended && (game.moves > 0 || game.pending.length) && !(await confirmDialog({ title: 'لعبة جديدة', body: 'سيُنهى الدور الحالي وتضيع كل النتائج والتقدّم. هل تريد المتابعة؟', ok: 'نعم، ابدأ لعبة جديدة' }))) return
  game = new Game(); ui.selected = null; ui.swap = false; ui.swapSel.clear()
  clearGame(); say('بدأت لعبة جديدة.', 'success', 3000); changed()
}
$('btn-new').addEventListener('click', () => newGame())

/* ---------- game over ---------- */
function showOver() {
  const r = game.result, dlg = $('dlg-over')
  $('over-winner').textContent = (r.reason === 'time' ? 'انتهى وقت أحد اللاعبين. ' : 'فرغ أحد الرفوف ولا قطع في الكيس. ') + (r.winner ? `الفائز: ${playerName(r.winner)}!` : 'تعادل!')
  $('over-rows').replaceChildren(...[1, 2].map(p => {
    const tr = document.createElement('tr')
    for (const text of [playerName(p), `−${r.deduction[p]}`, `+${r.bonus[p]}`, String(r.scores[p])]) { const td = document.createElement('td'); td.textContent = text; tr.append(td) }
    return tr
  }))
  dlg.addEventListener('close', () => { if (dlg.returnValue === 'new') newGame(false) }, { once: true })
  dlg.returnValue = ''; dlg.showModal()
}

/* ---------- settings / help ---------- */
const form = $('settings-form')
function syncSettingsForm() {
  form.theme.value = settings.theme; form.policy.value = settings.policy; form.unknown.value = settings.unknown
  form.showOpponentRack.checked = settings.showOpponentRack
  $('custom-words').value = customWords.join('\n')
  updateDictInfo()
}
function updateDictInfo() {
  const i = validator.info, el = $('dict-info')
  el.textContent = validator.status === 'unavailable' ? 'القاموس غير متاح حالياً: ستُسأل عن كل كلمة.' : i ? `القاموس: ${i.version} — ${i.entries.toLocaleString('ar-EG-u-nu-latn')} مدخلاً. قاموس تجريبي صغير وليس شاملاً.` : 'جارٍ تحميل القاموس…'
  $('custom-count').textContent = `${customWords.length} كلمة في قاموسك الخاص.`
}
validator.onChange(() => { updateDictInfo(); renderPreview() })
form.addEventListener('change', async e => {
  const n = e.target.name
  if (n === 'theme') { settings.theme = form.theme.value; applyTheme() }
  else if (n === 'policy') { settings.policy = form.policy.value; await validator.setPolicy(settings.policy); renderPreview() }
  else if (n === 'unknown') settings.unknown = form.unknown.value
  else if (n === 'showOpponentRack') { settings.showOpponentRack = form.showOpponentRack.checked; renderRacks() }
  saveSettings(settings)
})
$('custom-words').addEventListener('change', async e => {
  const words = [...new Set(e.target.value.split('\n').map(w => w.trim()).filter(Boolean))]
  customWords.length = 0; customWords.push(...words)
  saveCustomWords(customWords); await validator.setCustom(customWords); updateDictInfo(); renderPreview()
})
$('btn-settings').addEventListener('click', () => { syncSettingsForm(); $('dlg-settings').showModal() })
$('btn-help').addEventListener('click', () => $('dlg-help').showModal())
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close('cancel') }))   // click on backdrop

function buildStatic() {
  const grid = $('blank-letters')
  for (const l of LETTERS) { const b = document.createElement('button'); b.value = l; b.textContent = shown(l); b.setAttribute('aria-label', l); grid.append(b) }
  const legend = $('legend')
  for (const k of ['dl', 'tl', 'dw', 'tw', 'star']) {
    const d = document.createElement('div'), sq = document.createElement('span'); sq.className = 'sq'; sq.dataset.p = k
    const p = document.createElement('span'); p.className = 'prem'
    if (k === 'star') { p.classList.add('prem-star'); p.textContent = '★' } else { const n = document.createElement('span'); n.className = 'prem-n'; n.textContent = PREMIUM_LABEL[k][0]; p.append(n) }
    sq.append(p); const t = document.createElement('span'); t.textContent = PREMIUM_NAMES[k]; d.append(sq, t); legend.append(d)
  }
}

/* ---------- clock loop & lifecycle ---------- */
setInterval(() => {
  if (game.tick(now())) { changed(); showOver(); return }
  updateClocks()
}, 250)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); else if (game.tick(now())) { changed(); showOver() } })
addEventListener('pagehide', persist)

/* ---------- start ---------- */
applyTheme(); buildStatic(); buildBoard(); buildRack(); syncSettingsForm(); render()
if (game.ended && game.result) say('اللعبة السابقة انتهت. ابدأ لعبة جديدة من زر +.', 'info', 6000)
initPwa({ notify, installButton: $('btn-install') })
// handy for debugging and browser tests; read-only snapshot
window.__asb = { get game() { return game }, validator, render }
