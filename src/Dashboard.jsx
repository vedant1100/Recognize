import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area,
  Cell,
} from 'recharts'
import { useStore } from './store'
import { api } from './api'
import { useEffect, useState } from 'react'

const COLORS = {
  CONCEPT:      '#B8422E',
  PERSON:       '#d48a50',
  ORGANIZATION: '#4a90d9',
  PLACE:        '#5cb87a',
  TECHNOLOGY:   '#50c8c8',
  EVENT:        '#c8b840',
  CHUNK:        '#9b6dff',
}

const BAR_PALETTE = ['#B8422E','#4a90d9','#9b6dff','#50c8c8','#5cb87a','#c8b840','#d48a50','#e06b8b']

function useGraphAnalytics(graphData) {
  return useMemo(() => {
    const nodes = graphData.nodes
    const links = graphData.links

    const personNodes = nodes.filter(n => n.type === 'PERSON')
    const nonPersonNodes = nodes.filter(n => n.type !== 'PERSON' && n.type !== 'CHUNK')

    // connection count per node id
    const connCount = {}
    links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      connCount[s] = (connCount[s] || 0) + 1
      connCount[t] = (connCount[t] || 0) + 1
    })

    // topic types connected to each person
    const personTopics = {}
    links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      const sNode = nodes.find(n => n.id === s)
      const tNode = nodes.find(n => n.id === t)
      if (sNode?.type === 'PERSON') {
        personTopics[s] = personTopics[s] || new Set()
        if (tNode && tNode.type !== 'PERSON') personTopics[s].add(tNode.type)
      }
      if (tNode?.type === 'PERSON') {
        personTopics[t] = personTopics[t] || new Set()
        if (sNode && sNode.type !== 'PERSON') personTopics[t].add(sNode.type)
      }
    })

    // total radius across persons for relative contribution
    const totalR = personNodes.reduce((s, n) => s + (n.r || 7), 0) || 1

    const speakers = personNodes.map((n, i) => {
      const conns = connCount[n.id] || 0
      const topics = personTopics[n.id]?.size || 0
      const relWeight = ((n.r || 7) / totalR) * 100
      const efficiency = Math.min(100, Math.round((conns * 12 + topics * 18 + relWeight * 0.5)))
      return {
        id: n.id,
        name: n.label || `Speaker ${i + 1}`,
        contribution: Math.round(relWeight * 10) / 10,
        connections: conns,
        topicDiversity: topics,
        efficiency,
        color: BAR_PALETTE[i % BAR_PALETTE.length],
      }
    }).sort((a, b) => b.efficiency - a.efficiency)

    // entity type distribution
    const typeDist = {}
    nodes.forEach(n => {
      if (n.type && n.type !== 'CHUNK') typeDist[n.type] = (typeDist[n.type] || 0) + 1
    })
    const typeDistArr = Object.entries(typeDist).map(([type, count]) => ({ type, count }))

    // topic coverage radar (aggregate across all speakers)
    const topicTypes = ['CONCEPT','TECHNOLOGY','ORGANIZATION','EVENT','PLACE']
    const radarData = topicTypes.map(t => {
      const count = nodes.filter(n => n.type === t).length
      return { topic: t.slice(0, 4), fullTopic: t, value: count, max: Math.max(...topicTypes.map(tt => nodes.filter(n => n.type === tt).length), 1) }
    })

    // fake per-meeting efficiency trend (derived from connection distribution)
    const trend = speakers.slice(0, 5).map((sp, i) => ({
      meeting: `M${i + 1}`,
      ...Object.fromEntries(speakers.slice(0, 4).map(s => [s.name.split(' ')[0], Math.round(40 + Math.random() * 50)])),
    }))

    return { speakers, typeDistArr, radarData, trend, personNodes, nonPersonNodes, connCount }
  }, [graphData])
}

function StatCard({ value, label, sub, accent, icon }) {
  return (
    <div className="dash-stat-card" style={{ '--accent': accent }}>
      <div className="dash-stat-icon">{icon}</div>
      <div className="dash-stat-value">{value}</div>
      <div className="dash-stat-label">{label}</div>
      {sub && <div className="dash-stat-sub">{sub}</div>}
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="dash-tooltip">
      <div className="dash-tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="dash-tooltip-row">
          <span className="dash-tooltip-dot" style={{ background: p.fill || p.color }} />
          <span>{p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong></span>
        </div>
      ))}
    </div>
  )
}

function EmptyOverlay() {
  return (
    <div className="dash-empty">
      <div className="dash-empty-icon">◈</div>
      <p className="dash-empty-title">No meeting data yet</p>
      <p className="dash-empty-hint">Upload a meeting transcript on the Graph page to generate analytics.</p>
    </div>
  )
}

export function Dashboard() {
  const graphData  = useStore(s => s.graphData)
  const setPage    = useStore(s => s.setPage)
  const setGraphData = useStore(s => s.setGraphData)
  const [stats, setStats] = useState({ docs: 0, entities: 0, chunks: 0, communities: 0 })

  useEffect(() => {
    api.graph().then(setGraphData).catch(() => {})
    api.stats().then(setStats).catch(() => {})
  }, [])

  const { speakers, typeDistArr, radarData, personNodes, connCount } = useGraphAnalytics(graphData)

  const hasData = graphData.nodes.length > 0
  const totalConns = graphData.links.length
  const avgEfficiency = speakers.length
    ? Math.round(speakers.reduce((s, sp) => s + sp.efficiency, 0) / speakers.length)
    : 0

  const topSpeaker = speakers[0]

  return (
    <div className="dash-root">
      {/* ── Top nav bar ── */}
      <header className="dash-header">
        <div className="dash-brand" style={{ cursor: 'pointer' }} onClick={() => setPage('home')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
          <span className="dash-brand-name">RECOGNIZE</span>
          <span className="dash-brand-sep">/</span>
          <span className="dash-brand-page">Analytics</span>
        </div>

        <nav className="dash-nav">
          <button className="dash-nav-btn" onClick={() => setPage('home')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Home
          </button>
          <button className="dash-nav-btn" onClick={() => setPage('graph')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
            Context Graph
          </button>
          <button className="dash-nav-btn active">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Analytics
          </button>
        </nav>
      </header>

      <main className="dash-main">
        {/* ── Section title ── */}
        <div className="dash-section-head">
          <h1 className="dash-title">Meeting Intelligence</h1>
          <p className="dash-subtitle">Derived from your knowledge graph — {stats.docs} document{stats.docs !== 1 ? 's' : ''} indexed</p>
        </div>

        {/* ── Stat cards ── */}
        <div className="dash-stats-row">
          <StatCard
            value={personNodes.length || '—'}
            label="Speakers"
            sub="identified in meetings"
            accent="#d48a50"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0116 0v2"/></svg>
            }
          />
          <StatCard
            value={stats.docs || '—'}
            label="Meetings"
            sub="transcripts processed"
            accent="#4a90d9"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            }
          />
          <StatCard
            value={totalConns || '—'}
            label="Connections"
            sub="knowledge graph edges"
            accent="#9b6dff"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            }
          />
          <StatCard
            value={avgEfficiency ? `${avgEfficiency}%` : '—'}
            label="Avg Efficiency"
            sub="across all participants"
            accent="#5cb87a"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            }
          />
          <StatCard
            value={stats.entities || '—'}
            label="Entities"
            sub="extracted insights"
            accent="#B8422E"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            }
          />
        </div>

        {!hasData && <EmptyOverlay />}

        {hasData && (
          <>
            {/* ── Row 1: Contribution + Rankings ── */}
            <div className="dash-grid-2">
              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">Speaker Contribution</span>
                  <span className="dash-card-badge">by centrality weight</span>
                </div>
                {speakers.length === 0 ? (
                  <div className="dash-no-speakers">No speakers detected — add PERSON entities to your graph.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={speakers} margin={{ top: 8, right: 8, left: -24, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(108,114,120,0.1)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#6C7278', fontSize: 10 }}
                        interval={0}
                        angle={-35}
                        textAnchor="end"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis tick={{ fill: '#6C7278', fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(184,66,46,0.07)' }} />
                      <Bar dataKey="contribution" name="Contribution %" radius={[3, 3, 0, 0]}>
                        {speakers.map((sp, i) => (
                          <Cell key={sp.id} fill={sp.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">Efficiency Rankings</span>
                  <span className="dash-card-badge">combined score</span>
                </div>
                <div className="dash-rankings">
                  {speakers.length === 0 && (
                    <div className="dash-no-speakers">No speakers in graph yet.</div>
                  )}
                  {speakers.map((sp, i) => (
                    <div key={sp.id} className="dash-rank-row">
                      <span className="dash-rank-num" style={{ color: i < 3 ? sp.color : '#6C7278' }}>
                        {i < 3 ? ['①','②','③'][i] : `#${i + 1}`}
                      </span>
                      <div className="dash-rank-info">
                        <div className="dash-rank-name">{sp.name}</div>
                        <div className="dash-rank-bar-wrap">
                          <div
                            className="dash-rank-bar"
                            style={{ width: `${sp.efficiency}%`, background: sp.color }}
                          />
                        </div>
                      </div>
                      <span className="dash-rank-score">{sp.efficiency}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Row 2: Topic Coverage + Network Connections ── */}
            <div className="dash-grid-2">
              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">Idea Coverage</span>
                  <span className="dash-card-badge">entity types in graph</span>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="rgba(108,114,120,0.15)" />
                    <PolarAngleAxis dataKey="topic" tick={{ fill: '#6C7278', fontSize: 10 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar
                      name="Count"
                      dataKey="value"
                      stroke="#B8422E"
                      fill="#B8422E"
                      fillOpacity={0.25}
                      dot={{ r: 3, fill: '#B8422E' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">Network Connections</span>
                  <span className="dash-card-badge">edges per speaker</span>
                </div>
                <div className="dash-connections">
                  {speakers.length === 0 && (
                    <div className="dash-no-speakers">No speakers in graph yet.</div>
                  )}
                  {speakers.map((sp) => (
                    <div key={sp.id} className="dash-conn-row">
                      <span className="dash-conn-name">{sp.name.split(' ')[0]}</span>
                      <div className="dash-conn-bar-wrap">
                        <div
                          className="dash-conn-bar"
                          style={{
                            width: `${Math.min(100, (sp.connections / (Math.max(...speakers.map(s => s.connections), 1))) * 100)}%`,
                            background: `linear-gradient(90deg, ${sp.color}cc, ${sp.color}44)`,
                          }}
                        />
                      </div>
                      <span className="dash-conn-count">{sp.connections}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Row 3: Entity type distribution + Per-meeting ideas ── */}
            <div className="dash-grid-2">
              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">Entity Breakdown</span>
                  <span className="dash-card-badge">knowledge graph composition</span>
                </div>
                <div className="dash-entity-dist">
                  {typeDistArr.map(({ type, count }, i) => {
                    const max = Math.max(...typeDistArr.map(t => t.count), 1)
                    return (
                      <div key={type} className="dash-entity-row">
                        <span className="dash-entity-dot" style={{ background: COLORS[type] ?? '#6C7278' }} />
                        <span className="dash-entity-type">{type}</span>
                        <div className="dash-entity-bar-wrap">
                          <div
                            className="dash-entity-bar"
                            style={{ width: `${(count / max) * 100}%`, background: COLORS[type] ?? '#6C7278' }}
                          />
                        </div>
                        <span className="dash-entity-count">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">Meaningful Ideas</span>
                  <span className="dash-card-badge">weightage by speaker</span>
                </div>
                <div className="dash-ideas">
                  {speakers.length === 0 && (
                    <div className="dash-no-speakers">No speakers in graph yet.</div>
                  )}
                  {speakers.map((sp) => {
                    const pct = Math.round((sp.topicDiversity / (Math.max(...speakers.map(s => s.topicDiversity), 1))) * 100)
                    return (
                      <div key={sp.id} className="dash-idea-row">
                        <div className="dash-idea-header">
                          <span className="dash-idea-name">{sp.name}</span>
                          <span className="dash-idea-topics">{sp.topicDiversity} topic{sp.topicDiversity !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="dash-idea-bar-wrap">
                          <div
                            className="dash-idea-bar"
                            style={{ width: `${pct}%` }}
                          >
                            <div className="dash-idea-glow" style={{ background: sp.color }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── Row 4: Top performers highlight ── */}
            {topSpeaker && (
              <div className="dash-card dash-spotlight">
                <div className="dash-spotlight-label">TOP PERFORMER</div>
                <div className="dash-spotlight-name">{topSpeaker.name}</div>
                <div className="dash-spotlight-metrics">
                  <div className="dash-spot-metric">
                    <span className="dash-spot-val">{topSpeaker.connections}</span>
                    <span className="dash-spot-key">Connections</span>
                  </div>
                  <div className="dash-spot-sep" />
                  <div className="dash-spot-metric">
                    <span className="dash-spot-val">{topSpeaker.topicDiversity}</span>
                    <span className="dash-spot-key">Topics Covered</span>
                  </div>
                  <div className="dash-spot-sep" />
                  <div className="dash-spot-metric">
                    <span className="dash-spot-val">{topSpeaker.contribution}%</span>
                    <span className="dash-spot-key">Graph Share</span>
                  </div>
                  <div className="dash-spot-sep" />
                  <div className="dash-spot-metric">
                    <span className="dash-spot-val" style={{ color: '#5cb87a' }}>{topSpeaker.efficiency}%</span>
                    <span className="dash-spot-key">Efficiency Score</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
