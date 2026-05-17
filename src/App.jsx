import { useEffect, useState } from 'react'
import { Sidebar }         from './Sidebar'
import { BrainCanvas }     from './brain/BrainCanvas'
import { ChatPanel }       from './ChatPanel'
import { LiveTranscript }  from './LiveTranscript'
import { Dashboard }       from './Dashboard'
import { Home }            from './Home'
import { useStore }        from './store'
import { api }             from './api'

export default function App() {
  const setGraphData = useStore(s => s.setGraphData)
  const currentPage  = useStore(s => s.currentPage)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  useEffect(() => {
    api.graph().then(setGraphData).catch(() => {})
  }, [setGraphData])

  if (currentPage === 'home')      return <Home />
  if (currentPage === 'dashboard') return <Dashboard />

  return (
    <div className="app">
      <Sidebar />
      <BrainCanvas />
      <ChatPanel />
      <div id="toast" className="toast" />

      <button
        className="lt-toggle-btn"
        onClick={() => setTranscriptOpen(o => !o)}
        title="Live Transcript"
      >
        {transcriptOpen ? '✕ Transcript' : '◉ Live Transcript'}
      </button>

      <LiveTranscript open={transcriptOpen} onClose={() => setTranscriptOpen(false)} />
    </div>
  )
}
