import React, { useEffect, useRef, useState } from 'react'
import * as store from '../lib/store.js'

// Topbar bell. Notifications persist after being read — read just clears the
// unread badge; the list is always there to scroll back through.
export default function NotificationsBell() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const load = () => store.listNotifications().then(setItems).catch(() => {})

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [])

  // Close on Escape or when clicking anywhere outside the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const unread = items.filter((n) => !n.read_at).length

  const toggle = async () => {
    const opening = !open
    setOpen(opening)
    if (opening && unread > 0) {
      await store.markNotificationsRead()
      // keep them visually "unread" until next open; just refresh data
      setTimeout(load, 400)
    }
  }

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button onClick={toggle} title="Notifications" data-tour="bell">
        🔔
        {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          {items.length === 0 && (
            <div className="notif-item">
              <div className="b">Nothing here yet — homework, messages, and updates will appear in this list and stay here.</div>
            </div>
          )}
          {items.map((n) => (
            <div key={n.id} className={'notif-item' + (!n.read_at ? ' unread' : '')}>
              <div className="t">{n.title}</div>
              {n.body && <div className="b">{n.body}</div>}
              <div className="d">{String(n.created_at || '').replace('T', ' ').slice(0, 16)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
