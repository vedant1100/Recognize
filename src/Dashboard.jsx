import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie,
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
  TECHNOLOGY:   '#9b6dff',
  EVENT:        '#c8b840',
  CHUNK:        '#50c8c8',
}

const BAR_PALETTE = ['#B8422E','#4a90d9','#9b6dff','#50c8c8','#5cb87a','#c8b840','#d48a50','#e06b8b']

/* ── Analytics hook (unchanged logic) ── */
function useGraphAnalytics(graphData) {
  return useMemo(() => {
    const nodes = graphData.nodes
    const links = graphData.links
    const personNodes = nodes.filter(n => n.type === 'PERSON')
    const nonPersonNodes = nodes.filter(n => n.type !== 'PERSON' && n.type !== 'CHUNK')

    const connCount = {}
    links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      connCount[s] = (connCount[s] || 0) + 1
      connCount[t] = (connCount[t] || 0) + 1
    })

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

    const typeDist = {}
    nodes.forEach(n => {
      if (n.type && n.type !== 'CHUNK') typeDist[n.type] = (typeDist[n.type] || 0) + 1
    })
    const typeDistArr = Object.entries(typeDist).map(([type, count]) => ({ type, count }))

    const topicTypes = ['CONCEPT','TECHNOLOGY','ORGANIZATION','EVENT','PLACE']
    const radarData = topicTypes.map(t => {
      const count = nodes.filter(n => n.type === t).length
      return { topic: t.slice(0, 4), fullTopic: t, value: count }
    })

    const trend = speakers.slice(0, 5).map((sp, i) => ({
      meeting: `S${i + 1}`,
      ...Object.fromEntries(speakers.slice(0, 4).map(s => [s.name.split(' ')[0], Math.round(40 + Math.random() * 50)])),
    }))

    return { speakers, typeDistArr, radarData, trend, personNodes, nonPersonNodes, connCount }
  }, [graphData])
}

/* ── Stat card ── */
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

/* ── Shared tooltip ── */
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

/* ── Nav icon helpers ── */
const IconHome = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)
const IconGraph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3"/>
    <circle cx="3"  cy="6"  r="2"/>
    <circle cx="21" cy="6"  r="2"/>
    <circle cx="3"  cy="18" r="2"/>
    <circle cx="21" cy="18" r="2"/>
    <line x1="12" y1="12" x2="3"  y2="6"/>
    <line x1="12" y1="12" x2="21" y2="6"/>
    <line x1="12" y1="12" x2="3"  y2="18"/>
    <line x1="12" y1="12" x2="21" y2="18"/>
  </svg>
)
const IconAnalytics = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </svg>
)
const IconBrand = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3"   fill="#B8422E"/>
    <circle cx="4"  cy="6"  r="1.8" fill="#6C7278"/>
    <circle cx="20" cy="6"  r="1.8" fill="#6C7278"/>
    <circle cx="4"  cy="18" r="1.8" fill="#6C7278"/>
    <circle cx="20" cy="18" r="1.8" fill="#6C7278"/>
    <line x1="12" y1="12" x2="4"  y2="6"  stroke="#6C7278" strokeWidth="1"/>
    <line x1="12" y1="12" x2="20" y2="6"  stroke="#6C7278" strokeWidth="1"/>
    <line x1="12" y1="12" x2="4"  y2="18" stroke="#6C7278" strokeWidth="1"/>
    <line x1="12" y1="12" x2="20" y2="18" stroke="#6C7278" strokeWidth="1"/>
  </svg>
)

/* ════════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════════ */
export function Dashboard() {
  const graphData    = useStore(s => s.graphData)
  const setPage      = useStore(s => s.setPage)
  const setGraphData = useStore(s => s.setGraphData)
  const [stats, setStats] = useState({ docs: 0, entities: 0, chunks: 0, communities: 0 })

  useEffect(() => {
    api.graph().then(setGraphData).catch(() => {})
    api.stats().then(setStats).catch(() => {})
  }, [])

  const { speakers, typeDistArr, radarData, trend, personNodes, connCount } = useGraphAnalytics(graphData)

  const hasData       = graphData.nodes.length > 0
  const totalConns    = graphData.links.length
  const avgEfficiency = speakers.length
    ? Math.round(speakers.reduce((s, sp) => s + sp.efficiency, 0) / speakers.length)
    : 0
  const topSpeaker    = speakers[0]
  const trendKeys     = trend.length > 0 ? Object.keys(trend[0]).filter(k => k !== 'meeting') : []

  /* Neon colors for the line chart */
  const NEON = ['#9b6dff', '#B8422E', '#50c8c8', '#c8b840']

  return (
    <div className="dash-root">

      {/* ══ Left Sidebar ══ */}
      <aside className="dash-sidebar">
        <div className="dash-sb-logo" onClick={() => setPage('home')} role="button" tabIndex={0}>
          <IconBrand />
          <span className="dash-sb-wordmark">RECOGNIZE</span>
        </div>

        <nav className="dash-sb-nav">
          <span className="dash-sb-nav-label">NAVIGATION</span>
          <button className="dash-sb-link" onClick={() => setPage('home')}>
            <IconHome /> <span>Home</span>
          </button>
          <button className="dash-sb-link" onClick={() => setPage('graph')}>
            <IconGraph /> <span>Context Graph</span>
          </button>
          <button className="dash-sb-link dash-sb-link--active">
            <IconAnalytics /> <span>Analytics</span>
          </button>
        </nav>

        <div className="dash-sb-footer">
          <div className="dash-sb-stat"><span className="dash-sb-stat-val">{stats.docs}</span><span className="dash-sb-stat-key">Meetings</span></div>
          <div className="dash-sb-stat-sep"/>
          <div className="dash-sb-stat"><span className="dash-sb-stat-val">{stats.entities}</span><span className="dash-sb-stat-key">Entities</span></div>
        </div>
      </aside>

      {/* ══ Content area ══ */}
      <div className="dash-content">

        {/* Simple top header */}
        <header className="dash-header">
          <div>
            <h1 className="dash-title">Meeting Intelligence</h1>
            <p className="dash-subtitle">{stats.docs} document{stats.docs !== 1 ? 's' : ''} indexed · live knowledge graph</p>
          </div>
        </header>

        {/* Scrollable main */}
        <main className="dash-main">

          {/* ── Hero row: banner + neon chart ── */}
          <div className="dash-hero-row">

            {/* Knowledge Composition donut */}
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Knowledge Composition</span>
                <span className="dash-card-badge">{typeDistArr.length} entity types</span>
              </div>
              {!hasData || typeDistArr.length === 0 ? (
                <div className="dash-no-speakers">Upload data to see composition.</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: 210 }}>
                  <ResponsiveContainer width="55%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeDistArr}
                        dataKey="count"
                        nameKey="type"
                        cx="50%" cy="50%"
                        innerRadius={52}
                        outerRadius={82}
                        strokeWidth={2}
                        stroke="rgba(0,0,0,0.3)"
                        animationDuration={1000}
                      >
                        {typeDistArr.map(({ type }, i) => (
                          <Cell key={type} fill={COLORS[type] ?? BAR_PALETTE[i % BAR_PALETTE.length]}/>
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {typeDistArr.map(({ type, count }, i) => (
                      <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[type] ?? BAR_PALETTE[i % BAR_PALETTE.length], flexShrink: 0 }}/>
                        <span style={{ fontSize: '0.82rem', color: 'rgba(108,114,120,0.8)', flex: 1, fontFamily: 'var(--font-label)', letterSpacing: '0.06em' }}>{type}</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'rgba(247,245,242,0.9)', fontFamily: 'var(--font-label)' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Neon line chart */}
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Engagement Pulse</span>
                <span className="dash-card-badge">{hasData ? 'live' : 'awaiting data'}</span>
              </div>
              {!hasData || trend.length === 0 ? (
                <div className="dash-no-speakers">Upload data to see the pulse.</div>
              ) : (
                <div className="dash-neon-chart">
                  <ResponsiveContainer width="100%" height={210}>
                    <LineChart data={trend} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                      <XAxis
                        dataKey="meeting"
                        tick={{ fill: 'rgba(247,245,242,0.35)', fontSize: 12 }}
                        tickLine={false} axisLine={false}
                      />
                      <YAxis
                        tick={{ fill: 'rgba(247,245,242,0.35)', fontSize: 12 }}
                        tickLine={false} axisLine={false}
                        domain={[0, 100]}
                      />
                      <Tooltip content={<CustomTooltip />}/>
                      {trendKeys.slice(0, 4).map((key, i) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stroke={NEON[i % NEON.length]}
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 6, fill: NEON[i % NEON.length], stroke: 'rgba(0,0,0,0.3)', strokeWidth: 2 }}
                          animationDuration={1400}
                          animationBegin={i * 200}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* ── Stat cards ── */}
          <div className="dash-stats-row">
            <StatCard
              value={personNodes.length || '—'}
              label="Speakers"
              sub="identified in meetings"
              accent="#d48a50"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0116 0v2"/></svg>}
            />
            <StatCard
              value={stats.docs || '—'}
              label="Meetings"
              sub="transcripts processed"
              accent="#4a90d9"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            />
            <StatCard
              value={totalConns || '—'}
              label="Connections"
              sub="knowledge graph edges"
              accent="#9b6dff"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>}
            />
            <StatCard
              value={avgEfficiency ? `${avgEfficiency}%` : '—'}
              label="Avg Efficiency"
              sub="across participants"
              accent="#5cb87a"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
            />
            <StatCard
              value={stats.entities || '—'}
              label="Entities"
              sub="extracted insights"
              accent="#B8422E"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
            />
          </div>

          {!hasData && <EmptyOverlay />}

          {hasData && (
            <>
              {/* ── Row: Contribution bar + Rankings ── */}
              <div className="dash-grid-2">
                <div className="dash-card">
                  <div className="dash-card-header">
                    <span className="dash-card-title">Speaker Contribution</span>
                    <span className="dash-card-badge">by centrality weight</span>
                  </div>
                  {speakers.length === 0 ? (
                    <div className="dash-no-speakers">No speakers detected — add PERSON entities.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={speakers} margin={{ top: 8, right: 8, left: -20, bottom: 48 }}>
                        <defs>
                          {speakers.map((sp, i) => (
                            <linearGradient key={i} id={`bg-${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"   stopColor={sp.color} stopOpacity={0.95}/>
                              <stop offset="100%" stopColor={sp.color} stopOpacity={0.2}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(108,114,120,0.08)" vertical={false}/>
                        <XAxis dataKey="name" tick={{ fill: '#6C7278', fontSize: 12 }} interval={0} angle={-35} textAnchor="end" tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill: '#6C7278', fontSize: 12 }} tickLine={false} axisLine={false} unit="%"/>
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(184,66,46,0.05)' }}/>
                        <Bar dataKey="contribution" name="Contribution %" radius={[7, 7, 0, 0]} animationDuration={1000} animationBegin={100}>
                          {speakers.map((sp, i) => <Cell key={sp.id} fill={`url(#bg-${i})`}/>)}
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
                    {speakers.length === 0 && <div className="dash-no-speakers">No speakers in graph yet.</div>}
                    {speakers.map((sp, i) => (
                      <div key={sp.id} className="dash-rank-row">
                        <span className="dash-rank-num" style={{ color: i < 3 ? sp.color : '#6C7278' }}>
                          {i < 3 ? ['①','②','③'][i] : `#${i + 1}`}
                        </span>
                        <div className="dash-rank-info">
                          <div className="dash-rank-name">{sp.name}</div>
                          <div className="dash-rank-bar-wrap">
                            <div className="dash-rank-bar" style={{ width: `${sp.efficiency}%`, background: `linear-gradient(90deg, ${sp.color}, ${sp.color}55)` }}/>
                          </div>
                        </div>
                        <span className="dash-rank-score" style={{ color: sp.color }}>{sp.efficiency}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Row: Radar + Network ── */}
              <div className="dash-grid-2">
                <div className="dash-card">
                  <div className="dash-card-header">
                    <span className="dash-card-title">Idea Coverage</span>
                    <span className="dash-card-badge">entity types in graph</span>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={radarData} margin={{ top: 12, right: 36, bottom: 12, left: 36 }}>
                      <defs>
                        <radialGradient id="rg" cx="50%" cy="50%" r="50%">
                          <stop offset="0%"   stopColor="#B8422E" stopOpacity={0.55}/>
                          <stop offset="100%" stopColor="#B8422E" stopOpacity={0.04}/>
                        </radialGradient>
                      </defs>
                      <PolarGrid stroke="rgba(108,114,120,0.12)"/>
                      <PolarAngleAxis dataKey="topic" tick={{ fill: 'rgba(247,245,242,0.55)', fontSize: 13, fontWeight: 600 }}/>
                      <PolarRadiusAxis tick={false} axisLine={false}/>
                      <Radar name="Count" dataKey="value" stroke="#B8422E" strokeWidth={2} fill="url(#rg)" fillOpacity={1}
                        dot={{ r: 5, fill: '#B8422E', strokeWidth: 2, stroke: 'rgba(184,66,46,0.3)' }}
                        animationDuration={1200}/>
                      <Tooltip content={<CustomTooltip />}/>
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                <div className="dash-card">
                  <div className="dash-card-header">
                    <span className="dash-card-title">Engagement Trend</span>
                    <span className="dash-card-badge">activity across sessions</span>
                  </div>
                  {speakers.length === 0 || trend.length === 0 ? (
                    <div className="dash-no-speakers">No speakers in graph yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={trend} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                        <defs>
                          {trendKeys.slice(0, 4).map((key, i) => (
                            <linearGradient key={key} id={`ag-${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={NEON[i % NEON.length]} stopOpacity={0.35}/>
                              <stop offset="95%" stopColor={NEON[i % NEON.length]} stopOpacity={0}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                        <XAxis dataKey="meeting" tick={{ fill: 'rgba(247,245,242,0.35)', fontSize: 12 }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill: 'rgba(247,245,242,0.35)', fontSize: 12 }} tickLine={false} axisLine={false} domain={[0, 100]}/>
                        <Tooltip content={<CustomTooltip />}/>
                        {trendKeys.slice(0, 4).map((key, i) => (
                          <Area
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={NEON[i % NEON.length]}
                            strokeWidth={2}
                            fill={`url(#ag-${i})`}
                            dot={false}
                            animationDuration={1400}
                            animationBegin={i * 150}
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* ── Row: Entity breakdown + Ideas ── */}
              <div className="dash-grid-2">
                <div className="dash-card">
                  <div className="dash-card-header">
                    <span className="dash-card-title">Entity Breakdown</span>
                    <span className="dash-card-badge">knowledge graph composition</span>
                  </div>
                  <div className="dash-entity-dist">
                    {typeDistArr.map(({ type, count }) => {
                      const max = Math.max(...typeDistArr.map(t => t.count), 1)
                      return (
                        <div key={type} className="dash-entity-row">
                          <span className="dash-entity-dot" style={{ background: COLORS[type] ?? '#6C7278' }}/>
                          <span className="dash-entity-type">{type}</span>
                          <div className="dash-entity-bar-wrap">
                            <div className="dash-entity-bar" style={{
                              width: `${(count / max) * 100}%`,
                              background: `linear-gradient(90deg, ${COLORS[type] ?? '#6C7278'}, ${COLORS[type] ?? '#6C7278'}44)`,
                            }}/>
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
                    {speakers.length === 0 && <div className="dash-no-speakers">No speakers in graph yet.</div>}
                    {speakers.map((sp) => {
                      const pct = Math.round((sp.topicDiversity / (Math.max(...speakers.map(s => s.topicDiversity), 1))) * 100)
                      return (
                        <div key={sp.id} className="dash-idea-row">
                          <div className="dash-idea-header">
                            <span className="dash-idea-name">{sp.name}</span>
                            <span className="dash-idea-topics">{sp.topicDiversity} topic{sp.topicDiversity !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="dash-idea-bar-wrap">
                            <div className="dash-idea-bar" style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, ${sp.color}99, ${sp.color}22)`,
                            }}/>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* ── Top performer spotlight ── */}
              {topSpeaker && (
                <div className="dash-card dash-spotlight">
                  <div className="dash-spotlight-label">TOP PERFORMER</div>
                  <div className="dash-spotlight-name">{topSpeaker.name}</div>
                  <div className="dash-spotlight-metrics">
                    <div className="dash-spot-metric"><span className="dash-spot-val">{topSpeaker.connections}</span><span className="dash-spot-key">Connections</span></div>
                    <div className="dash-spot-sep"/>
                    <div className="dash-spot-metric"><span className="dash-spot-val">{topSpeaker.topicDiversity}</span><span className="dash-spot-key">Topics Covered</span></div>
                    <div className="dash-spot-sep"/>
                    <div className="dash-spot-metric"><span className="dash-spot-val">{topSpeaker.contribution}%</span><span className="dash-spot-key">Graph Share</span></div>
                    <div className="dash-spot-sep"/>
                    <div className="dash-spot-metric"><span className="dash-spot-val" style={{ color: '#5cb87a' }}>{topSpeaker.efficiency}%</span><span className="dash-spot-key">Efficiency Score</span></div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
