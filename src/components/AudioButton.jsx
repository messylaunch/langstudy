import React, { useState } from 'react'
import { playWord } from '../lib/speech.js'

export default function AudioButton({ text, rate = 0.9, className = 'icon-btn', title = 'Listen' }) {
  const [playing, setPlaying] = useState(false)
  return (
    <button
      className={className}
      title={title}
      onClick={async (e) => {
        e.stopPropagation()
        if (playing) return
        setPlaying(true)
        await playWord(text, rate)
        setPlaying(false)
      }}
    >
      {playing ? '🔊' : '🔈'}
    </button>
  )
}
