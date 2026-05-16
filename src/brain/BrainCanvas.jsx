import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './Scene'
import { useStore } from '../store'

function NodeDetailPanel() {
  const selected    = useStore(s => s.selectedNode)
  const setSelected = useStore(s => s.setSelectedNode)
  const addMessage  = useStore(s => s.addMessage)

  const handleAsk = () => {
    if (!selected) return
    addMessage({ role: 'user-prefill', text: `Tell me more about: ${selected.preview}` })
    setSelected(null)
    // Focus the query input
    document.getElementById('query-input')?.focus()
  }

  return (
    <div className={`node-detail${selected ? ' visible' : ''}`}>
      <div className="detail-header">
        <div className="detail-meta">
          <span className="detail-file">{selected?.label}</span>
          <span className="detail-chunk">chunk {(selected?.chunk_index ?? 0) + 1}</span>
        </div>
        <button className="btn-icon btn" onClick={() => setSelected(null)}>×</button>
      </div>
      <p className="detail-preview">{selected?.preview}</p>
      <button className="btn btn-ghost" style={{ fontSize: '0.66rem', padding: '6px 12px' }} onClick={handleAsk}>
        Ask about this chunk →
      </button>
    </div>
  )
}

export function BrainCanvas() {
  const graphData = useStore(s => s.graphData)
  const hasNodes  = graphData.nodes.length > 0

  return (
    <div className="graph-wrap">
      <Canvas
        camera={{ position: [0, 0, 420], fov: 65 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <Scene graphData={graphData} />
        </Suspense>
      </Canvas>

      {/* Empty state overlay */}
      <div className={`empty-state${hasNodes ? ' hidden' : ''}`}>
        <div className="empty-icon">◈</div>
        <p className="empty-title">Your knowledge graph is empty</p>
        <p className="empty-hint">
          Upload a PDF, DOCX, or Markdown file to start mapping semantic connections.
        </p>
      </div>

      {/* Node detail panel slides up from bottom */}
      <NodeDetailPanel />
    </div>
  )
}
