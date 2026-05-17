import { useRef, useState, useCallback, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useStore } from './store'
import { api } from './api'

function toast(msg, type = '') {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.className   = `toast ${type} show`
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), 3000)
}

async function refreshGraph(setGraphData) {
  const data = await api.graph()
  setGraphData(data)
}

// Entity type → colour dot
const TYPE_DOT = {
  CONCEPT:      '#B8422E',
  PERSON:       '#d48a50',
  ORGANIZATION: '#4a90d9',
  PLACE:        '#5cb87a',
  TECHNOLOGY:   '#50c8c8',
  EVENT:        '#c8b840',
}

export function Sidebar() {
  const setGraphData = useStore(s => s.setGraphData)
  const graphData    = useStore(s => s.graphData)
  const backendOk    = useStore(s => s.backendOk)
  const setBackendOk = useStore(s => s.setBackendOk)
  const setPage      = useStore(s => s.setPage)

  const [fileName,    setFileName]    = useState('')
  const [uploading,   setUploading]   = useState(false)
  const [fileReady,   setFileReady]   = useState(false)
  const [buildingComm, setBuildingComm] = useState(false)
  const [stats,       setStats]       = useState({ docs: 0, entities: 0, chunks: 0, communities: 0 })
  const fileRef   = useRef(null)
  const dropRef   = useRef(null)

  // Check backend + load stats on mount
  useEffect(() => {
    api.stats()
      .then(s => { setBackendOk(true); setStats(s) })
      .catch(() => setBackendOk(false))
  }, [setBackendOk])

  // Drag-over styling
  const onDragOver  = e => { e.preventDefault(); dropRef.current?.classList.add('drag-over') }
  const onDragLeave = () => dropRef.current?.classList.remove('drag-over')
  const onDrop      = e => {
    e.preventDefault()
    dropRef.current?.classList.remove('drag-over')
    const f = e.dataTransfer?.files[0]
    if (f) applyFile(f)
  }

  const applyFile = f => {
    setFileName(f.name)
    setFileReady(true)
    // Stash file on the hidden input via DataTransfer
    const dt = new DataTransfer()
    dt.items.add(f)
    fileRef.current.files = dt.files
  }

  const onFileChange = e => {
    const f = e.target.files[0]
    if (f) applyFile(f)
  }

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files[0]
    if (!file) return
    flushSync(() => setUploading(true))  // paint immediately before fetch starts
    try {
      const data = await api.upload(file)
      toast(`Ingested ${data.added} chunks · entity extraction running…`, 'ok')
      setFileName('')
      setFileReady(false)
      fileRef.current.value = ''
      await refreshGraph(setGraphData)
      const s = await api.stats()
      setStats(s)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }, [setGraphData])

  const handleBuildCommunities = useCallback(async () => {
    setBuildingComm(true)
    try {
      const data = await api.buildCommunities()
      toast(`Built ${data.communities_built} communities`, 'ok')
      const s = await api.stats()
      setStats(s)
    } catch (err) {
      toast(err.message || 'Community build failed', 'error')
    } finally {
      setBuildingComm(false)
    }
  }, [])

  // Deduplicate by entity name (nodes are now entities)
  const entityTypes = graphData.nodes.reduce((acc, n) => {
    acc[n.type || 'CONCEPT'] = (acc[n.type || 'CONCEPT'] || 0) + 1
    return acc
  }, {})

  return (
    <aside className="sidebar">
      {/* Logo — click to go home */}
      <div className="logo" style={{ cursor: 'pointer' }} onClick={() => setPage('home')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3"  fill="#B8422E" />
          <circle cx="4"  cy="6"  r="1.8" fill="#6C7278" />
          <circle cx="20" cy="6"  r="1.8" fill="#6C7278" />
          <circle cx="4"  cy="18" r="1.8" fill="#6C7278" />
          <circle cx="20" cy="18" r="1.8" fill="#6C7278" />
          <line x1="12" y1="12" x2="4"  y2="6"  stroke="#6C7278" strokeWidth="1" />
          <line x1="12" y1="12" x2="20" y2="6"  stroke="#6C7278" strokeWidth="1" />
          <line x1="12" y1="12" x2="4"  y2="18" stroke="#6C7278" strokeWidth="1" />
          <line x1="12" y1="12" x2="20" y2="18" stroke="#6C7278" strokeWidth="1" />
        </svg>
        <span className="logo-text">CONTEXT GRAPH</span>
      </div>

      {/* Page navigation */}
      <div className="nav-tabs">
        <button className="nav-tab active" onClick={() => setPage('graph')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
          Graph
        </button>
        <button className="nav-tab" onClick={() => setPage('dashboard')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Analytics
        </button>
      </div>
      <button className="nav-home-link" onClick={() => setPage('home')}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Back to Home
      </button>

      {/* Upload */}
      <div className="sidebar-section">
        <span className="label">INGEST</span>
        <div
          ref={dropRef}
          className="file-drop"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.md,.txt"
            onChange={onFileChange}
          />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C7278" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
          <div className="drop-label">Drop or click to select</div>
          <div className="drop-hint">PDF · DOCX · MD · TXT</div>
        </div>
        <div className="upload-status">{fileName}</div>
        <button
          className="btn btn-primary"
          disabled={!fileReady || uploading}
          onClick={handleUpload}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      {/* Stats — now entity-aware */}
      <div className="sidebar-section">
        <span className="label">INDEX</span>
        <div className="stats-grid">
          <div className="stat-box">
            <div className="stat-value">{stats.entities ?? graphData.nodes.length}</div>
            <div className="stat-label">entities</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{graphData.links.length}</div>
            <div className="stat-label">relations</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{stats.chunks ?? 0}</div>
            <div className="stat-label">chunks</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{stats.communities ?? 0}</div>
            <div className="stat-label">communities</div>
          </div>
        </div>
      </div>

      {/* Entity type legend */}
      {Object.keys(entityTypes).length > 0 && (
        <div className="sidebar-section">
          <span className="label">ENTITY TYPES</span>
          <div className="files-list">
            {Object.entries(entityTypes).map(([type, count]) => (
              <div key={type} className="file-tag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: TYPE_DOT[type] ?? '#6C7278', flexShrink: 0, display: 'inline-block' }} />
                <span style={{ flex: 1 }}>{type}</span>
                <span style={{ color: 'var(--secondary)', fontSize: '0.6rem' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GraphRAG: community detection */}
      {graphData.nodes.length > 0 && (
        <div className="sidebar-section">
          <span className="label">GRAPHRAG</span>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '0.66rem', padding: '7px 12px' }}
            disabled={buildingComm}
            onClick={handleBuildCommunities}
          >
            {buildingComm ? 'Building…' : '⬡ Build communities'}
          </button>
          <div className="upload-status" style={{ marginTop: 4 }}>
            {stats.communities > 0
              ? `${stats.communities} communities ready · use Global mode in chat`
              : 'Run after uploading documents'}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="sidebar-footer">
        <div className={`status-dot ${backendOk ? 'online' : 'offline'}`} />
        <span className="status-text">{backendOk ? 'Backend connected' : 'Backend offline'}</span>
      </div>
    </aside>
  )
}
