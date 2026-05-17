import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { useStore } from './store'
import { api } from './api'

const VOICEOS_URL = 'https://beta.api.voiceos.com/v1/audio/transcriptions'

// Picks the best supported MIME type for MediaRecorder
function getSupportedMime() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]
  return candidates.find(m => MediaRecorder.isTypeSupported(m)) ?? ''
}

// Records mic audio, transcribes via VoiceOS, calls onTranscript(text)
function useSpeechInput(onTranscript, personNames) {
  const [recState, setRecState] = useState('idle') // 'idle' | 'recording' | 'transcribing'
  const recRef    = useRef(null)
  const chunksRef = useRef([])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const mime   = getSupportedMime()
      const rec    = new MediaRecorder(stream, mime ? { mimeType: mime } : {})
      chunksRef.current = []

      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }

      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
        setRecState('transcribing')
        try {
          const fd = new FormData()
          fd.append('file', blob, 'query.webm')
          fd.append('language', 'en')
          if (personNames.length > 0) {
            // VoiceOS custom_dictionary helps it recognise participant names
            fd.append('custom_dictionary', JSON.stringify(personNames))
          }

          let text = ''
          const res = await fetch(VOICEOS_URL, { method: 'POST', body: fd })
          if (res.ok) {
            const data = await res.json()
            text = data.text ?? data.transcript ?? ''
          } else if (res.status === 401) {
            const fallback = await api.transcribe(blob, personNames)
            text = fallback.text ?? fallback.transcript ?? ''
            toast('VoiceOS unauthorized — switched to Groq fallback', 'error')
          } else {
            throw new Error(`VoiceOS ${res.status}`)
          }

          onTranscript(text)
        } catch (err) {
          console.error('VoiceOS transcription error:', err)
          toast('Transcription failed — check console', 'error')
        } finally {
          setRecState('idle')
        }
      }

      rec.start()
      recRef.current = rec
      setRecState('recording')
    } catch (err) {
      console.error('Mic access denied:', err)
      toast('Microphone access denied', 'error')
    }
  }, [onTranscript, personNames])

  const stop = useCallback(() => recRef.current?.stop(), [])

  const toggle = useCallback(() => {
    if (recState === 'idle')      start()
    else if (recState === 'recording') stop()
  }, [recState, start, stop])

  return { recState, toggle }
}

function toast(msg, type = '') {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.className   = `toast ${type} show`
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), 3000)
}

function Message({ msg, onSourceClick }) {
  if (msg.role === 'thinking') {
    return (
      <div className="message message-assistant">
        <div className="thinking">
          <span className="dot" /><span className="dot" /><span className="dot" />
        </div>
      </div>
    )
  }

  if (msg.role === 'user' || msg.role === 'user-prefill') {
    return (
      <div className="message message-user">
        <div className="bubble">{msg.text}</div>
      </div>
    )
  }

  return (
    <div className="message message-assistant">
      {msg.mode && (
        <div style={{ fontSize: '0.58rem', color: 'var(--secondary)', marginBottom: 4, fontFamily: 'var(--font-label)', letterSpacing: '0.08em' }}>
          {msg.mode === 'global' ? '⬡ GLOBAL' : '◈ LOCAL'} · GraphRAG
        </div>
      )}
      <div className="bubble markdown">
        <ReactMarkdown>{msg.text}</ReactMarkdown>
      </div>
      {msg.sources?.length > 0 && (
        <div className="sources">
          {msg.sources.map((s, i) => (
            <div key={i} className="source-card" onClick={() => onSourceClick(s.id)}>
              <div className="source-card-header">
                <span className="source-type">{s.type}</span>
                <span className="source-name">{s.filename}</span>
              </div>
              {s.text && <p className="source-desc">{s.text}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatPanel() {
  const messages      = useStore(s => s.messages)
  const addMessage    = useStore(s => s.addMessage)
  const replaceLastMessage = useStore(s => s.replaceLastMessage)
  const setSelectedNode    = useStore(s => s.setSelectedNode)
  const graphData          = useStore(s => s.graphData)

  const [input,  setInput]  = useState('')
  const [mode,   setMode]   = useState('local')   // 'local' | 'global'
  const boxRef = useRef(null)

  // Extract PERSON node names to improve VoiceOS transcription accuracy
  const personNames = useMemo(
    () => graphData.nodes.filter(n => n.type === 'PERSON').map(n => n.label).filter(Boolean),
    [graphData.nodes]
  )

  const { recState, toggle: toggleMic } = useSpeechInput(
    text => { if (text) setInput(prev => prev ? `${prev} ${text}` : text) },
    personNames
  )

  // Scroll to bottom on new messages
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [messages])

  // Handle user-prefill messages from NodeDetail
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last?.role === 'user-prefill') {
      setInput(last.text)
    }
  }, [messages])

  const handleSourceClick = (id) => {
    const node = graphData.nodes.find(n => n.id === id)
    if (node) setSelectedNode(node)
  }

  const submit = useCallback(async (queryText) => {
    const q = (queryText || input).trim()
    if (!q) return
    setInput('')

    addMessage({ role: 'user', text: q, mode })
    addMessage({ role: 'thinking' })

    try {
      const data = mode === 'global'
        ? await api.queryGlobal(q)
        : await api.query(q)

      replaceLastMessage({
        role: 'assistant',
        text: data.answer,
        sources: data.sources || [],
        mode: data.mode,
      })

      // Highlight first source entity node in graph
      if (data.sources?.length) {
        const node = graphData.nodes.find(n => n.id === data.sources[0].id)
        if (node) setSelectedNode(node)
      }
    } catch {
      replaceLastMessage({ role: 'assistant', text: 'Request failed. Is the backend running?' })
    }
  }, [input, mode, addMessage, replaceLastMessage, graphData, setSelectedNode])

  const onKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <aside className="chat">
      <div className="chat-header">
        <span className="label" style={{ marginBottom: 0 }}>ASK YOUR GRAPH</span>
        {/* Local / Global mode toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {['local', 'global'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background:   mode === m ? 'var(--tertiary)' : 'transparent',
                border:       `1px solid ${mode === m ? 'var(--tertiary)' : 'var(--border)'}`,
                color:        mode === m ? 'var(--neutral)' : 'var(--secondary)',
                fontFamily:   'var(--font-label)',
                fontSize:     '0.58rem',
                fontWeight:   600,
                letterSpacing:'0.07em',
                padding:      '3px 8px',
                borderRadius: 3,
                cursor:       'pointer',
                textTransform:'uppercase',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {mode === 'global' && (
        <div style={{ padding: '6px 14px', background: 'rgba(184,66,46,0.07)', borderBottom: '1px solid var(--border)', fontSize: '0.68rem', color: 'var(--secondary)' }}>
          Global mode uses community summaries for holistic answers.
        </div>
      )}

      <div className="messages" ref={boxRef}>
        {messages.length === 0 && (
          <div className="welcome-msg">
            <strong style={{ color: 'var(--neutral)', display: 'block', marginBottom: 6 }}>GraphRAG ready</strong>
            <strong>Local</strong> — entity vector search + graph traversal + Claude.<br />
            <strong>Global</strong> — community summaries for thematic/holistic questions.<br /><br />
            Upload documents, then optionally run <em>Build communities</em> in the sidebar for global queries.
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} msg={m} onSourceClick={handleSourceClick} />
        ))}
      </div>

      <form
        className="query-form"
        onSubmit={e => { e.preventDefault(); submit() }}
      >
        <button
          type="button"
          className={`mic-btn mic-btn--${recState}`}
          onClick={toggleMic}
          title={recState === 'idle' ? 'Speak your query (VoiceOS)' : recState === 'recording' ? 'Stop recording' : 'Transcribing…'}
        >
          {recState === 'transcribing' ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mic-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          ) : recState === 'recording' ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8"  y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>
        <input
          id="query-input"
          className="query-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={recState === 'recording' ? 'Listening…' : recState === 'transcribing' ? 'Transcribing…' : 'Ask your graph, or click 🎙 to speak'}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="query-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </form>
    </aside>
  )
}
