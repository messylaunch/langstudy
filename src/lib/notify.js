// Daily study reminders. True server push requires infrastructure the app
// doesn't assume; instead we use local notifications: while the app (or its
// installed PWA window) is open we check the reminder time, and on platforms
// that support Periodic Background Sync (installed Chrome/Android PWA) the
// service worker can fire even when closed.
const LS_LAST = 'fala.lastReminderDate'

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

export async function enablePeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.ready
    if ('periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' })
      if (status.state === 'granted') {
        await reg.periodicSync.register('study-reminder', { minInterval: 20 * 60 * 60 * 1000 })
        return true
      }
    }
  } catch {
    /* not available */
  }
  return false
}

export function startReminderLoop(getSettings, hasStudiedToday) {
  const tick = async () => {
    try {
      const settings = getSettings()
      if (!settings || !settings.remindersEnabled) return
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const now = new Date()
      const [h, m] = (settings.reminderTime || '19:00').split(':').map(Number)
      const today = now.toISOString().slice(0, 10)
      if (localStorage.getItem(LS_LAST) === today) return
      if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
        if (!hasStudiedToday()) {
          const reg = await navigator.serviceWorker.ready
          reg.active?.postMessage({ type: 'show-reminder' })
        }
        localStorage.setItem(LS_LAST, today)
      }
    } catch {
      /* noop */
    }
  }
  tick()
  const id = setInterval(tick, 60 * 1000)
  return () => clearInterval(id)
}
