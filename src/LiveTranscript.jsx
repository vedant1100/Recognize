import { useEffect, useRef, useState } from 'react'

const SPEAKER_COLORS = [
  '#60a5fa', // blue
  '#34d399', // green
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // purple
  '#fb923c', // orange
]

function getSpeakerColor(speaker) {
  const idx = parseInt(speaker.replace(/\D/g, '') || '1', 10) - 1
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length]
}

export function LiveTranscript({ open, onClose }) {
  const [connected, setConnected] = useState(false)
  const [words, setWords] = useState([])      // [{speaker, word, ts}]
  const [speakers, setSpeakers] = useState([])
  const scrollRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    if (!open) return

    function connect() {
      const ws = new WebSocket('ws://localhost:8765/feed')
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.event === 'init') {
            setSpeakers(msg.speakers)
          } else if (msg.speaker && msg.word) {
            setWords(prev => [...prev.slice(-500), { speaker: msg.speaker, word: msg.word, ts: Date.now() }])
          }
        } catch (_) {}
      }

      ws.onclose = () => {
        setConnected(false)
        // Retry every 3s
        setTimeout(() => { if (wsRef.current === ws) connect() }, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      const ws = wsRef.current
      wsRef.current = null
      ws?.close()
    }
  }, [open])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [words])

  // Group consecutive words by same speaker into utterances
  const utterances = []
  let cur = null
  for (const w of words) {
    if (!cur || cur.speaker !== w.speaker) {
      cur = { speaker: w.speaker, words: [w.word], ts: w.ts }
      utterances.push(cur)
    } else {
      cur.words.push(w.word)
    }
  }

  // Word count per speaker
  const wordCounts = {}
  for (const w of words) wordCounts[w.speaker] = (wordCounts[w.speaker] || 0) + 1

  if (!open) return null

  return (
    <div className="live-transcript-panel">
      {/* Header */}
      <div className="lt-header">
        <div className="lt-title">
          <span className={`lt-dot ${connected ? 'live' : 'offline'}`} />
          Live Transcript
          {connected && <span className="lt-live-badge">LIVE</span>}
        </div>
        <button className="lt-close" onClick={onClose}>✕</button>
      </div>

      {/* Speaker stats */}
      {speakers.length > 0 && (
        <div className="lt-speakers">
          {speakers.map(s => (
            <div key={s} className="lt-speaker-chip" style={{ borderColor: getSpeakerColor(s) }}>
              <span style={{ color: getSpeakerColor(s) }}>{s}</span>
              <span className="lt-word-count">{wordCounts[s] || 0}w</span>
            </div>
          ))}
        </div>
      )}

      {/* Transcript */}
      <div className="lt-body" ref={scrollRef}>
        {utterances.length === 0 ? (
          <div className="lt-empty">
            {connected
              ? 'Waiting for speech... (first ~1 second will show as unknown)'
              : 'Connecting to jaylogic server at localhost:8765...'}
          </div>
        ) : (
          utterances.map((u, i) => (
            <div key={i} className="lt-utterance">
              <span className="lt-speaker" style={{ color: getSpeakerColor(u.speaker) }}>
                {u.speaker}
              </span>
              <span className="lt-text">{u.words.join(' ')}</span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="lt-footer">
        {words.length} words &nbsp;·&nbsp;
        {connected ? (
          <span style={{ color: '#34d399' }}>● jaylogic connected</span>
        ) : (
          <span style={{ color: '#f87171' }}>○ reconnecting...</span>
        )}
      </div>
    </div>
  )
}
