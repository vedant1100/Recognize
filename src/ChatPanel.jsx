import { useRef, useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useStore } from './store'
import { api } from './api'

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
        <input
          id="query-input"
          className="query-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="What does this knowledge base say about…"
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
