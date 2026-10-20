/** localStorage wrapper that never throws (private mode, quota, disabled storage). */
const SETTINGS_KEY = 'asb:settings:v1', GAME_KEY = 'asb:game:v1', CUSTOM_KEY = 'asb:custom-words:v1'

const read = key => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null } catch { return null } }
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false } }
const remove = key => { try { localStorage.removeItem(key) } catch { /* ignore */ } }

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',            // system | light | dark
  policy: 'expanded',         // strict | expanded
  unknown: 'ask',             // ask | block
  showOpponentRack: false,
})

export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...(read(SETTINGS_KEY) || {}) })
export const saveSettings = s => write(SETTINGS_KEY, s)
export const loadGame = () => read(GAME_KEY)
export const saveGame = data => write(GAME_KEY, data)
export const clearGame = () => remove(GAME_KEY)
export const loadCustomWords = () => { const v = read(CUSTOM_KEY); return Array.isArray(v) ? v.filter(w => typeof w === 'string') : [] }
export const saveCustomWords = words => write(CUSTOM_KEY, words)
