/* Service worker registration, install button, update prompt, connection notices. All text via textContent. */
export function initPwa({ notify, installButton }) {
  const nav = navigator
  const standalone = () => matchMedia('(display-mode: standalone)').matches || nav.standalone === true
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)

  addEventListener('offline', () => notify('أنت غير متصل بالإنترنت. اللعبة تعمل بدون اتصال.'))
  addEventListener('online', () => notify('عاد الاتصال بالإنترنت.', { ms: 2500 }))

  let prompt = null
  const show = on => { installButton.hidden = !on }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; show(true) })
  addEventListener('appinstalled', () => { prompt = null; show(false) })
  if (ios && !standalone()) show(true)   // iOS has no prompt API: the button explains the manual steps
  installButton.addEventListener('click', async () => {
    if (!prompt) { notify('للتثبيت: اضغط زر المشاركة في المتصفح ثم «إضافة إلى الشاشة الرئيسية».', { ms: 10000 }); return }
    const e = prompt; prompt = null; show(false)
    try { await e.prompt() } catch { /* dismissed */ }
  })

  if (!('serviceWorker' in nav)) return
  // Reload only after the player asked for the update; the very first install also fires controllerchange (clients.claim).
  let updateRequested = false, reloaded = false
  nav.serviceWorker.addEventListener('controllerchange', () => { if (!updateRequested || reloaded) return; reloaded = true; location.reload() })
  const applyUpdate = w => { updateRequested = true; w.postMessage('SKIP_WAITING') }

  addEventListener('load', async () => {
    let reg
    try { reg = await nav.serviceWorker.register('/sw.js') } catch { return }   // the game works online without it
    const announce = w => {
      if (!w) return
      w.addEventListener('statechange', () => {
        if (w.state !== 'installed') return
        if (nav.serviceWorker.controller) notify('يتوفر إصدار جديد من اللعبة.', { ms: 0, action: ['تحديث الآن', () => applyUpdate(w)] })
        else notify('اللعبة جاهزة للعب بدون إنترنت.')
      })
    }
    if (reg.waiting && nav.serviceWorker.controller) notify('يتوفر إصدار جديد من اللعبة.', { ms: 0, action: ['تحديث الآن', () => applyUpdate(reg.waiting)] })
    announce(reg.installing)
    reg.addEventListener('updatefound', () => announce(reg.installing))
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}) })
  })
}
