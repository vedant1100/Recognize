import { useEffect } from 'react'
import { Sidebar }     from './Sidebar'
import { BrainCanvas } from './brain/BrainCanvas'
import { ChatPanel }   from './ChatPanel'
import { useStore }    from './store'
import { api }         from './api'

export default function App() {
  const setGraphData = useStore(s => s.setGraphData)

  // Initial graph load
  useEffect(() => {
    api.graph().then(setGraphData).catch(() => {})
  }, [setGraphData])

  return (
    <div className="app">
      <Sidebar />
      <BrainCanvas />
      <ChatPanel />
      <div id="toast" className="toast" />
    </div>
  )
}
