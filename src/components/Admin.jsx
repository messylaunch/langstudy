import React, { useEffect, useState } from 'react'
import * as store from '../lib/store.js'

// Master-only view: every profile with word counts and progress.
export default function Admin() {
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    store
      .adminListUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <h1>All profiles</h1>
      <p className="muted small">
        As the master profile you can see every user's progress. To make someone else a master, run
        the SQL snippet in the README.
      </p>
      {error && <p className="error">{error}</p>}
      {!users && !error && <p className="muted">Loading…</p>}
      {users && (
        <div className="card">
          {users.map((u) => (
            <div className="word-row" key={u.id}>
              <div className="grow">
                <div className="pt">
                  {u.display_name || u.email}{' '}
                  {u.role === 'master' && <span className="badge" style={{ background: '#1e3c82' }}>master</span>}
                </div>
                <div className="en">{u.email}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div><strong>{u.total}</strong> <span className="muted small">words</span></div>
                <div className="muted small">
                  {u.learned} learned · {u.learning} in progress
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
