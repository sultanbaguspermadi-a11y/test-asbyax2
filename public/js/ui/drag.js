/**
 * Pointer-based drag and drop (mouse, touch and pen). A press that never moves 8px is left alone so the
 * normal click handlers (tap-to-select / tap-to-place) keep working with keyboard and screen readers.
 */
export function setupDrag({ root, resolveSource, resolveTarget, onDrop, isBusy }) {
  let st = null

  const clearHover = () => { if (st?.hover) { st.hover.classList.remove('drop-ok'); st.hover = null } }
  const finish = (e, drop) => {
    if (!st) return
    const s = st; st = null
    if (s.ghost) {
      s.ghost.remove()
      s.el.removeAttribute('data-dragging')
      s.hover?.classList.remove('drop-ok')
      // a drag must not also fire a click on whatever is under the pointer
      const stop = ev => { ev.stopPropagation(); ev.preventDefault() }
      document.addEventListener('click', stop, { capture: true, once: true })
      setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 0)
      if (drop) {
        const target = resolveTarget(document.elementFromPoint(e.clientX, e.clientY))
        if (target) onDrop(s.src, target)
      }
    }
  }

  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.target.closest?.('.tile[data-draggable="true"]')
    if (!el || isBusy()) return
    const src = resolveSource(el)
    if (!src) return
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, el, src, ghost: null, hover: null }
  })

  addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return
    if (!st.ghost) {
      if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 8) return
      const rect = st.el.getBoundingClientRect()
      const g = document.createElement('div')
      g.className = 'tile-ghost'
      g.style.width = g.style.height = `${Math.max(rect.width, 36)}px`
      g.style.fontSize = getComputedStyle(st.el.parentElement).fontSize
      g.append(st.el.cloneNode(true))
      g.firstChild.removeAttribute('data-dragging'); g.firstChild.removeAttribute('data-draggable')
      document.body.append(g)
      st.ghost = g
      st.el.setAttribute('data-dragging', 'true')
    }
    e.preventDefault()
    st.ghost.style.left = `${e.clientX}px`; st.ghost.style.top = `${e.clientY}px`
    const t = resolveTarget(document.elementFromPoint(e.clientX, e.clientY))
    if (t !== st.hover) { clearHover(); if (t) { t.classList.add('drop-ok'); st.hover = t } }
  }, { passive: false })

  addEventListener('pointerup', e => { if (st && e.pointerId === st.id) finish(e, true) })
  addEventListener('pointercancel', e => { if (st && e.pointerId === st.id) finish(e, false) })
}
