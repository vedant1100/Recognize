import { useStore } from './store'

const EDGE_COLORS = ['#9b6dff','#4a90d9','#5cb87a','#50c8c8','#c8b840','#d48a50','#B8422E']

function BrandLogo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
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
  )
}

/* ── Neo4j-style knowledge graph for hero ─────────── */
function HeroGraphVisual() {
  const nodes = [
    { x: 225, y: 185, r: 22, color: '#B8422E', label: ['Meeting', 'Memory'],  hub: true },
    { x: 88,  y: 72,  r: 13, color: '#d48a50', label: ['John Smith'],          hub: false },
    { x: 340, y: 60,  r: 12, color: '#50c8c8', label: ['TensorFlow'],          hub: false },
    { x: 422, y: 192, r: 14, color: '#4a90d9', label: ['Acme Corp'],           hub: false },
    { x: 360, y: 330, r: 11, color: '#c8b840', label: ['AI Summit'],           hub: false },
    { x: 183, y: 350, r: 10, color: '#5cb87a', label: ['San Francisco'],       hub: false },
    { x: 50,  y: 218, r: 12, color: '#d48a50', label: ['Sarah Lee'],           hub: false },
    { x: 158, y: 46,  r: 11, color: '#9b6dff', label: ['Q3 Roadmap'],          hub: false },
    { x: 358, y: 205, r: 13, color: '#9b6dff', label: ['Knowledge', 'Graph'],  hub: false },
    { x: 76,  y: 322, r: 10, color: '#50c8c8', label: ['Neural Net'],          hub: false },
    { x: 248, y: 48,  r: 10, color: '#B8422E', label: ['Diarization'],         hub: false },
    { x: 115, y: 160, r: 9,  color: '#5cb87a', label: ['Team Sync'],           hub: false },
  ]

  const edges = [
    [0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[0,10],[0,11],
    [1,6],[1,7],[2,8],[3,4],[4,5],[5,6],[7,10],[8,3],[9,5],[11,6],[11,1],
  ]

  return (
    <svg viewBox="0 0 470 390" className="home-hero-graph" fill="none" aria-hidden>
      <defs>
        {nodes.map((n, i) => (
          <radialGradient key={i} id={`hgn-${i}`} cx="38%" cy="32%" r="65%">
            <stop offset="0%"   stopColor={n.color} stopOpacity="0.95"/>
            <stop offset="100%" stopColor={n.color} stopOpacity="0.45"/>
          </radialGradient>
        ))}
        <filter id="hg-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="hg-glow-hub" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Edges */}
      {edges.map(([a, b], i) => {
        const isHub = nodes[a].hub || nodes[b].hub
        return (
          <line key={i}
            x1={nodes[a].x} y1={nodes[a].y}
            x2={nodes[b].x} y2={nodes[b].y}
            stroke={isHub ? `${nodes[a].hub ? nodes[b].color : nodes[a].color}50` : 'rgba(108,114,120,0.22)'}
            strokeWidth={isHub ? 1.4 : 0.8}
          />
        )
      })}

      {/* Pulse rings on hub */}
      <circle cx={225} cy={185} r="34" stroke="#B8422E" strokeWidth="1.2"
        fill="none" opacity="0.35" className="hg-pulse hg-pulse--1"/>
      <circle cx={225} cy={185} r="50" stroke="#B8422E" strokeWidth="0.7"
        fill="none" opacity="0.18" className="hg-pulse hg-pulse--2"/>

      {/* Nodes */}
      {nodes.map((n, i) => (
        <g key={i} filter={n.hub ? 'url(#hg-glow-hub)' : 'url(#hg-glow)'}>
          {/* Aura */}
          <circle cx={n.x} cy={n.y} r={n.r + 6} fill={n.color} opacity="0.1"/>
          {/* Body */}
          <circle cx={n.x} cy={n.y} r={n.r} fill={`url(#hgn-${i})`}/>
          {/* Specular */}
          <ellipse
            cx={n.x - n.r * 0.22} cy={n.y - n.r * 0.28}
            rx={n.r * 0.32} ry={n.r * 0.22}
            fill="rgba(255,255,255,0.22)"
            transform={`rotate(-20,${n.x - n.r * 0.22},${n.y - n.r * 0.28})`}
          />
        </g>
      ))}

      {/* Labels */}
      {nodes.map((n, i) => (
        <g key={`lbl-${i}`}>
          {n.label.map((line, li) => (
            <text key={li}
              x={n.x} y={n.y + n.r + 13 + li * 11}
              textAnchor="middle"
              fill="rgba(247,245,242,0.72)"
              fontSize="9.5"
              fontFamily="'Space Grotesk', sans-serif"
              fontWeight="600"
              letterSpacing="0.02em"
            >
              {line}
            </text>
          ))}
        </g>
      ))}
    </svg>
  )
}

/* ── Mini graph illustration ─────────────────────── */
function GraphIllustration() {
  return (
    <svg className="home-card-art" viewBox="0 0 320 170" fill="none">
      {/* Deep glow halos behind center */}
      <circle cx="160" cy="85" r="60" fill="rgba(184,66,46,0.07)" />
      <circle cx="160" cy="85" r="38" fill="rgba(184,66,46,0.09)" />
      <circle cx="160" cy="85" r="20" fill="rgba(184,66,46,0.1)" />

      {/* Edges — more of them, spread wider */}
      {[
        [160,85,  52,28],  [160,85, 270,30], [160,85, 262,140],
        [160,85,  55,135], [160,85, 160,10], [160,85, 300,85],
        [52,28,   18,65],  [270,30, 305,65], [262,140,220,162],
        [55,135,  88,162], [52,28,  90,12],  [270,30, 230,12],
        [160,10,  210,10], [300,85, 300,120],
      ].map(([x1,y1,x2,y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={EDGE_COLORS[i % EDGE_COLORS.length]}
          strokeWidth="1" opacity="0.4" />
      ))}

      {/* Outer nodes — more, bigger */}
      {[
        [52,28,   8,  '#9b6dff'], [270,30, 7,  '#4a90d9'],
        [262,140, 9,  '#5cb87a'], [55,135, 7,  '#50c8c8'],
        [18,65,   6,  '#c8b840'], [305,65, 5.5,'#d48a50'],
        [220,162, 6,  '#9b6dff'], [88,162, 5,  '#5cb87a'],
        [90,12,   5,  '#B8422E'], [230,12, 5,  '#4a90d9'],
        [160,10,  6,  '#50c8c8'], [300,120,5,  '#c8b840'],
      ].map(([cx,cy,r,fill], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r * 1.8} fill={fill} opacity="0.08" />
          <circle cx={cx} cy={cy} r={r} fill={fill} opacity="0.9" />
        </g>
      ))}

      {/* Outer pulse rings */}
      <circle cx="160" cy="85" r="28" stroke="#B8422E" strokeWidth="0.8"
        fill="none" opacity="0.25" strokeDasharray="5 4" className="home-graph-ring" />
      <circle cx="160" cy="85" r="44" stroke="#B8422E" strokeWidth="0.5"
        fill="none" opacity="0.12" strokeDasharray="3 6" className="home-graph-ring home-graph-ring--outer" />

      {/* Center node layers */}
      <circle cx="160" cy="85" r="22" fill="#4a0f08" opacity="0.6" />
      <circle cx="160" cy="85" r="16" fill="#B8422E" opacity="0.95" />
      <circle cx="160" cy="85" r="8"  fill="#ff8866" opacity="1" />
      <circle cx="160" cy="85" r="3"  fill="#ffffff" opacity="0.9" />
    </svg>
  )
}

/* ── Mini analytics illustration ─────────────────── */
function AnalyticsIllustration() {
  const bars = [
    { x: 22,  h: 72,  c: '#B8422E' },
    { x: 68,  h: 100, c: '#4a90d9' },
    { x: 114, h: 52,  c: '#9b6dff' },
    { x: 160, h: 84,  c: '#5cb87a' },
    { x: 206, h: 62,  c: '#50c8c8' },
    { x: 252, h: 90,  c: '#c8b840' },
  ]
  const top = bars.map(b => [b.x + 14, 130 - b.h])
  const polyPts = top.map(p => p.join(',')).join(' ')

  return (
    <svg className="home-card-art" viewBox="0 0 300 160" fill="none">
      {/* Grid lines */}
      {[0,1,2,3,4].map(i => (
        <line key={i} x1="16" y1={130 - i*30} x2="290" y2={130 - i*30}
          stroke="rgba(108,114,120,0.1)" strokeWidth="0.8" />
      ))}
      <line x1="16" y1="16" x2="16"  y2="132" stroke="rgba(108,114,120,0.18)" strokeWidth="0.9" />
      <line x1="16" y1="132" x2="292" y2="132" stroke="rgba(108,114,120,0.18)" strokeWidth="0.9" />

      {/* Bar glows */}
      {bars.map((b, i) => (
        <rect key={`glow-${i}`} x={b.x - 4} y={130 - b.h - 8} width="36" height={b.h + 8} rx="4"
          fill={b.c} opacity="0.06" />
      ))}

      {/* Bars */}
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={130 - b.h} width="28" height={b.h} rx="3.5"
          fill={b.c} opacity="0.8" />
      ))}

      {/* Trend line + dots */}
      <polyline points={polyPts}
        stroke="rgba(247,245,242,0.3)" strokeWidth="1.6"
        fill="none" strokeDasharray="5 3" strokeLinecap="round" />
      {top.map(([x,y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill={bars[i].c} opacity="0.25" />
          <circle cx={x} cy={y} r="2.5" fill="rgba(247,245,242,0.7)" />
        </g>
      ))}

      {/* Radar in top-right corner */}
      <g transform="translate(248, 14)">
        <polygon points="18,0 34,14 18,28 2,14" stroke="#B8422E" strokeWidth="1.2"
          fill="rgba(184,66,46,0.12)" />
        <polygon points="18,5 28,14 18,23 8,14" stroke="#4a90d9" strokeWidth="0.8"
          fill="rgba(74,144,217,0.1)" />
        <polygon points="18,9 23,14 18,19 13,14" stroke="#9b6dff" strokeWidth="0.6"
          fill="rgba(155,109,255,0.1)" />
        <circle cx="18" cy="14" r="2.5" fill="#B8422E" opacity="0.9" />
      </g>
    </svg>
  )
}

/* ── Google Meet mockup ──────────────────────────── */
function MeetMockup() {
  const tiles = [
    { initials: 'JS', name: 'John Smith',  color: '#4a90d9', speaking: true  },
    { initials: 'SL', name: 'Sarah Lee',   color: '#9b6dff', speaking: false },
    { initials: 'AK', name: 'Aryan K.',    color: '#5cb87a', speaking: false },
    { initials: 'MP', name: 'Miguel P.',   color: '#d48a50', speaking: false },
  ]
  const lines = [
    { speaker: 'John Smith',  color: '#4a90d9', text: '"the diarization pipeline attributes at the word level — no hardware required."', active: true  },
    { speaker: 'Sarah Lee',   color: '#9b6dff', text: '"tested across 6-person calls with overlapping speech, accuracy held at 91%."',  active: false },
    { speaker: 'Aryan K.',    color: '#5cb87a', text: '"graph query latency is under 800ms with Neo4j full-text indexing."',           active: false },
  ]
  return (
    <div className="home-meet-mockup">
      <div className="home-meet-chrome">
        <div className="home-meet-dots">
          <span className="home-meet-dot" style={{background:'#ff5f57'}}/>
          <span className="home-meet-dot" style={{background:'#febc2e'}}/>
          <span className="home-meet-dot" style={{background:'#28c840'}}/>
        </div>
        <div className="home-meet-url">
          <span className="home-meet-lock">🔒</span>
          meet.google.com/xyz-abc-def
        </div>
      </div>
      <div className="home-meet-body">
        <div className="home-meet-grid">
          {tiles.map((t, i) => (
            <div key={i} className={`home-meet-tile${t.speaking ? ' home-meet-tile--active' : ''}`}
              style={t.speaking ? {'--tile-color': t.color} : {}}>
              <div className="home-meet-avatar" style={{background:`linear-gradient(135deg,${t.color}cc,${t.color}44)`}}>
                {t.initials}
              </div>
              <div className="home-meet-tile-name">{t.name}</div>
              {t.speaking && (
                <div className="home-meet-badge">
                  <span className="home-meet-badge-dot"/>SPEAKING
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="home-meet-sidebar">
          <div className="home-meet-sidebar-header">
            <span className="home-meet-rec-dot"/>
            <span>RECOGNIZE LIVE</span>
          </div>
          <div className="home-meet-transcript">
            {lines.map((l, i) => (
              <div key={i} className={`home-meet-line${l.active ? ' home-meet-line--active' : ''}`}>
                <span className="home-meet-line-dot" style={{background:l.color}}/>
                <div>
                  <div className="home-meet-line-speaker" style={{color:l.color}}>{l.speaker}</div>
                  <div className="home-meet-line-text">{l.text}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="home-meet-sidebar-footer">
            478 landmarks · 24 fps · &lt;200ms latency
          </div>
        </div>
      </div>
      <div className="home-meet-bottombar">
        <div className="home-meet-ctrls">
          <div className="home-meet-ctrl-btn">🎤</div>
          <div className="home-meet-ctrl-btn">📷</div>
          <div className="home-meet-ctrl-btn home-meet-ctrl-end">✕</div>
        </div>
        <div className="home-meet-live-status">
          <span className="home-meet-rec-dot"/>
          Recognize capturing — 4 entities extracted this session
        </div>
      </div>
    </div>
  )
}

/* ── Data nodes mockup ───────────────────────────── */
function DataNodesMockup() {
  const groups = [
    { type:'PERSON',        color:'#d48a50', nodes:[
      { label:'John Smith',        mentions:45, links:12, pct:78 },
      { label:'Sarah Lee',         mentions:31, links:8,  pct:54 },
    ]},
    { type:'TOPIC',         color:'#9b6dff', nodes:[
      { label:'Machine Learning',  mentions:38, links:6,  pct:66 },
      { label:'GraphRAG Queries',  mentions:22, links:5,  pct:38 },
    ]},
    { type:'ORGANIZATION',  color:'#4a90d9', nodes:[
      { label:'Acme Corp',         mentions:17, links:8,  pct:30 },
      { label:'Neo4j Inc.',        mentions:14, links:4,  pct:24 },
    ]},
    { type:'DECISION',      color:'#5cb87a', nodes:[
      { label:'Q3 Roadmap Final',  mentions:23, links:9,  pct:40 },
      { label:'Adopt GraphRAG',    mentions:11, links:3,  pct:19 },
    ]},
  ]
  return (
    <div className="home-nodes-mockup">
      <div className="home-nodes-grid">
        {groups.map((g, i) => (
          <div key={i} className="home-nodes-col">
            <div className="home-nodes-type" style={{color:g.color}}>{g.type}</div>
            {g.nodes.map((n, j) => (
              <div key={j} className="home-node-card" style={{'--nc': g.color}}>
                <div className="home-node-header">
                  <span className="home-node-dot" style={{background:g.color}}/>
                  <span className="home-node-name">{n.label}</span>
                </div>
                <div className="home-node-meta">
                  <span>{n.mentions} mentions</span><span>{n.links} links</span>
                </div>
                <div className="home-node-bar">
                  <div className="home-node-fill" style={{width:`${n.pct}%`, background:`linear-gradient(90deg,${g.color},${g.color}66)`}}/>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="home-nodes-query">
        <div className="home-nodes-query-label">GraphRAG · Ask anything</div>
        <div className="home-nodes-query-input">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9b6dff" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          What did John Smith say about machine learning?
        </div>
        <div className="home-nodes-answer">
          <span className="home-nodes-answer-tag">Cited · 0.6 s</span>
          <p>"John Smith proposed using a transformer-based embedding layer for node deduplication (AI Summit, 14 May). He referenced TensorFlow's sparse attention as a baseline and flagged inference latency as a production concern."</p>
        </div>
      </div>
    </div>
  )
}

/* ── Feature card ────────────────────────────────── */
function FeatureCard({ icon, title, body, accent = '#B8422E' }) {
  return (
    <div className="home-dark-card home-feature-card" style={{ '--feat-accent': accent }}>
      <div className="home-feat-icon">{icon}</div>
      <div className="home-feat-title">{title}</div>
      <p className="home-feat-body">{body}</p>
    </div>
  )
}

/* ── Main homepage ───────────────────────────────── */
export function Home() {
  const setPage = useStore(s => s.setPage)

  return (
    <div className="home-root">

      {/* ── Nav bar ── */}
      <header className="home-nav">
        <div className="home-nav-brand">
          <BrandLogo />
          <span className="home-nav-wordmark">RECOGNIZE</span>
          <span className="home-nav-badge">BETA</span>
        </div>
        <nav className="home-nav-links">
          <button className="home-nav-link" onClick={() => setPage('graph')}>Context Graph</button>
          <button className="home-nav-link" onClick={() => setPage('dashboard')}>Analytics</button>
        </nav>
      </header>

      <main className="home-main">
        {/* ── Hero ── */}
        <section className="home-hero">

          {/* Left column — all the text */}
          <div className="home-hero-left">
            <div className="home-hero-status">
              <span className="home-hero-status-dot" />
              <span>Live Beta · Real-time speaker diarization active</span>
            </div>

            <div className="home-hero-eyebrow">Real-time meeting intelligence</div>

            <h1 className="home-hero-title">
              Every word attributed.<br />
              Every idea mapped.<br />
              <span className="home-hero-accent">Nothing forgotten.</span>
            </h1>

            <p className="home-hero-sub">
              Recognize identifies who is speaking in Google Meet at the word level,
              transcribes everything, and builds a persistent 3D knowledge graph of
              your team's institutional memory.
            </p>

            <div className="home-hero-ctas">
              <button className="home-btn-primary" onClick={() => setPage('graph')}>
                Open Context Graph
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
              <button className="home-btn-secondary" onClick={() => setPage('dashboard')}>
                View Analytics
              </button>
            </div>
          </div>

          {/* Right column — recognize.ai + Neo4j graph visual */}
          <div className="home-hero-right">
            <div className="home-hero-domain">recognize.ai</div>
            <HeroGraphVisual />
          </div>

        </section>

        {/* ── App cards ── */}
        <section className="home-cards-row">
          <button className="home-app-card home-app-card--graph" onClick={() => setPage('graph')}>
            <div className="home-app-card-art">
              <GraphIllustration />
            </div>
            <div className="home-app-card-body">
              <div className="home-app-card-tag">CONTEXT GRAPH</div>
              <div className="home-app-card-title">3D Knowledge Graph</div>
              <p className="home-app-card-desc">
                Explore your organisation's institutional memory as a live, force-directed 3D graph.
                Upload meeting transcripts, click nodes, drag entities, and query everything in plain language.
              </p>
              <div className="home-app-card-footer">
                <span className="home-app-card-pills">
                  <span className="home-pill">Entity extraction</span>
                  <span className="home-pill">GraphRAG queries</span>
                  <span className="home-pill">3D visualization</span>
                </span>
                <span className="home-app-card-cta">
                  Open Graph
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </span>
              </div>
            </div>
          </button>

          <button className="home-app-card home-app-card--analytics" onClick={() => setPage('dashboard')}>
            <div className="home-app-card-art">
              <AnalyticsIllustration />
            </div>
            <div className="home-app-card-body">
              <div className="home-app-card-tag">ANALYTICS</div>
              <div className="home-app-card-title">Meeting Dashboard</div>
              <p className="home-app-card-desc">
                Contribution maps, efficiency rankings, network connections, idea weightages,
                and entity breakdowns — derived live from your knowledge graph data.
              </p>
              <div className="home-app-card-footer">
                <span className="home-app-card-pills">
                  <span className="home-pill">Speaker rankings</span>
                  <span className="home-pill">Idea coverage</span>
                  <span className="home-pill">Efficiency scores</span>
                </span>
                <span className="home-app-card-cta home-app-card-cta--alt">
                  Open Dashboard
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </span>
              </div>
            </div>
          </button>
        </section>

        {/* ── What it solves ── */}
        <section className="home-section">
          <div className="home-section-label">WHAT IT SOLVES</div>
          <h2 className="home-section-title">Two open problems. Both closed.</h2>
          <div className="home-solves-grid">
            <div className="home-dark-card home-solve-card">
              <div className="home-solve-num">01</div>
              <div className="home-solve-title">The speaker attribution problem</div>
              <p className="home-solve-body">
                Attributing speech to specific people in a real-time multi-person conversation
                from a single camera has been open since the 1990s. Classical solutions require
                microphone arrays, pre-enrolled voice profiles, or batch-processing latency.
              </p>
              <div className="home-solve-answer">
                <span className="home-solve-answer-label">Recognize solves it</span>
                <p>
                  By tracking lip-movement variance per face using MediaPipe's 478-landmark model
                  and correlating the MAR signal with Whisper's word timestamps — speech attributed
                  geometrically, not acoustically.
                </p>
              </div>
            </div>
            <div className="home-dark-card home-solve-card">
              <div className="home-solve-num">02</div>
              <div className="home-solve-title">The institutional memory problem</div>
              <p className="home-solve-body">
                Companies lose knowledge every time a meeting ends. There is no system that
                automatically captures, connects, and preserves what was discussed —
                decisions decay in notes apps and inboxes.
              </p>
              <div className="home-solve-answer">
                <span className="home-solve-answer-label">Recognize solves it</span>
                <p>
                  By treating the knowledge graph as the durable artifact rather than the transcript.
                  Entities deduplicate. Relationships accumulate weight. Communities of related concepts
                  emerge bottom-up from everything your organization has ever said.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="home-section">
          <div className="home-section-label">HOW IT WORKS</div>
          <h2 className="home-section-title">Three systems. One unified picture.</h2>
          <div className="home-features-grid">
            <FeatureCard
              accent="#d48a50"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
                </svg>
              }
              title="Real-Time Diarization"
              body="A Chrome extension captures your Google Meet tab's audio and video. MediaPipe tracks lip movement per face frame-by-frame. Groq Whisper transcribes every word with timestamps. The sync layer matches words to faces geometrically — no voice enrollment, no special hardware."
            />
            <FeatureCard
              accent="#4a90d9"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="5"  r="3"/><circle cx="5"  cy="19" r="3"/><circle cx="19" cy="19" r="3"/>
                  <line x1="12" y1="8" x2="5"  y2="16"/><line x1="12" y1="8" x2="19" y2="16"/>
                </svg>
              }
              title="Persistent Knowledge Graph"
              body="Every meeting auto-ingests into Neo4j. Claude extracts typed entities and relationships from every chunk. Embeddings deduplicate — 'ML' and 'machine learning' merge into one node. Communities emerge. The graph accumulates across every session your team has ever had."
            />
            <FeatureCard
              accent="#9b6dff"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              }
              title="3D Graph Visualization"
              body="A force-directed D3 simulation drives a Three.js scene with instanced meshes, bloom post-processing, depth fog, neural pulse animations, and a starfield. Nodes scale with mention count. Click to select, drag to pin, orbit to explore the full topology."
            />
          </div>
        </section>

        {/* ── Google Meet showcase ── */}
        <section className="home-section">
          <div className="home-section-label">IN ACTION</div>
          <h2 className="home-section-title">Live inside Google Meet.</h2>
          <p className="home-showcase-sub">A Chrome extension — no hardware, no voice enrollment. Just join your meeting.</p>
          <MeetMockup />
        </section>

        {/* ── Data nodes showcase ── */}
        <section className="home-section">
          <div className="home-section-label">KNOWLEDGE GRAPH</div>
          <h2 className="home-section-title">Every meeting becomes a node.</h2>
          <p className="home-showcase-sub">Entities, decisions, and relationships — extracted by Claude, deduplicated, queryable in plain language.</p>
          <DataNodesMockup />
        </section>

        {/* ── Sponsors ── */}
        <section className="home-section">
          <div className="home-section-label">BUILT WITH</div>
          <h2 className="home-section-title">Powered by the best.</h2>
          <div className="home-sponsors-grid">
            {[
              { name:'Groq',           sub:'Whisper + Llama 3.3 at inhuman speed' },
              { name:'Whisper',        sub:'Millisecond word timestamps' },
              { name:'Neo4j',          sub:'Persistent knowledge graph across every meeting' },
              { name:'TokenRouter',    sub:'Smart LLM routing and cost control' },
              { name:'VoiceOS',        sub:'Voice input seeded from your team\'s graph' },
              { name:'AdaL by Sylph', sub:'The AI coding agent that built this with us' },
            ].map((s, i) => (
              <div key={i} className="home-sponsor-card">
                <div className="home-sponsor-name">{s.name}</div>
                <div className="home-sponsor-sub">{s.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Closing statement ── */}
        <section className="home-closing">
          <p className="home-closing-text">
            Every tool before us gave you a transcript.<br/>
            We give you your organisation's brain.<br/>
            <span className="home-closing-accent">It knows who said what, why it mattered — and it never forgets.</span>
          </p>
        </section>

        {/* ── Footer ── */}
        <footer className="home-footer">
          <div className="home-footer-brand">
            <BrandLogo size={14} />
            <span>RECOGNIZE</span>
          </div>
          <span className="home-footer-copy">Meeting intelligence for teams that think in graphs.</span>
        </footer>
      </main>
    </div>
  )
}
