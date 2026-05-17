import { useMemo } from 'react'
import { useStore } from './store'

/* ── Animated star field ─────────────────────────── */
function Starfield() {
  const stars = useMemo(() => Array.from({ length: 220 }, (_, i) => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    r: Math.random() * 1.2 + 0.15,
    op: Math.random() * 0.55 + 0.08,
    dur: (Math.random() * 3 + 2).toFixed(1),
    delay: (Math.random() * 5).toFixed(1),
  })), [])

  return (
    <svg className="home-starfield" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {stars.map((s, i) => (
        <circle
          key={i} cx={s.x} cy={s.y} r={s.r} fill="white"
          style={{
            opacity: s.op,
            animation: `twinkle ${s.dur}s ${s.delay}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </svg>
  )
}

/* ── Mini graph illustration ─────────────────────── */
function GraphIllustration() {
  return (
    <svg className="home-card-art" viewBox="0 0 220 130" fill="none">
      {/* Glow halos */}
      <circle cx="110" cy="65" r="38" fill="rgba(184,66,46,0.07)" />
      <circle cx="110" cy="65" r="22" fill="rgba(184,66,46,0.08)" />

      {/* Edges */}
      {[
        [110,65, 38,22],  [110,65, 185,28], [110,65, 178,102],
        [110,65, 42,98],  [38,22,  15,52],  [185,28, 205,62],
        [178,102,152,120],[42,98,  68,120],  [38,22,  68,14],
      ].map(([x1,y1,x2,y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={['#9b6dff','#4a90d9','#5cb87a','#50c8c8','#c8b840','#d48a50','#9b6dff','#5cb87a','#B8422E'][i % 9]}
          strokeWidth="0.9" opacity="0.45" />
      ))}

      {/* Outer nodes */}
      {[
        [38,22,  6.5,'#9b6dff'], [185,28, 5.5,'#4a90d9'],
        [178,102,7.5,'#5cb87a'], [42,98,  5.5,'#50c8c8'],
        [15,52,  4.5,'#c8b840'], [205,62, 4,  '#d48a50'],
        [152,120,4.5,'#9b6dff'], [68,120, 4,  '#5cb87a'],
        [68,14,  4,  '#B8422E'],
      ].map(([cx,cy,r,fill], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={fill} opacity="0.85" />
      ))}

      {/* Pulse ring */}
      <circle cx="110" cy="65" r="17" stroke="#B8422E" strokeWidth="0.8"
        fill="none" opacity="0.35" strokeDasharray="4 3" className="home-graph-ring" />

      {/* Center node layers */}
      <circle cx="110" cy="65" r="13" fill="#7a1c10" opacity="0.7" />
      <circle cx="110" cy="65" r="9"  fill="#B8422E" opacity="0.95" />
      <circle cx="110" cy="65" r="4"  fill="#ff8866" opacity="1" />
    </svg>
  )
}

/* ── Mini analytics illustration ─────────────────── */
function AnalyticsIllustration() {
  const bars = [
    { x: 28, h: 56, c: '#B8422E' },
    { x: 58, h: 76, c: '#4a90d9' },
    { x: 88, h: 40, c: '#9b6dff' },
    { x: 118,h: 64, c: '#5cb87a' },
    { x: 148,h: 48, c: '#50c8c8' },
  ]
  const top = bars.map(b => [b.x + 10, 110 - b.h])
  const polyPts = top.map(p => p.join(',')).join(' ')

  return (
    <svg className="home-card-art" viewBox="0 0 200 130" fill="none">
      {/* Grid */}
      {[0,1,2,3].map(i => (
        <line key={i} x1="18" y1={110 - i*28} x2="185" y2={110 - i*28}
          stroke="rgba(108,114,120,0.12)" strokeWidth="0.7" />
      ))}
      <line x1="18" y1="18" x2="18" y2="112" stroke="rgba(108,114,120,0.18)" strokeWidth="0.8" />
      <line x1="18" y1="112" x2="186" y2="112" stroke="rgba(108,114,120,0.18)" strokeWidth="0.8" />

      {/* Bars */}
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={110 - b.h} width="20" height={b.h} rx="2.5"
          fill={b.c} opacity="0.75" />
      ))}

      {/* Trend line */}
      <polyline points={polyPts}
        stroke="rgba(247,245,242,0.35)" strokeWidth="1.4"
        fill="none" strokeDasharray="4 2.5" strokeLinecap="round" />
      {top.map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r="2.2" fill="rgba(247,245,242,0.5)" />
      ))}

      {/* Radar polygon in corner */}
      <g transform="translate(162, 22)">
        <polygon points="12,0 22,10 12,20 2,10" stroke="#B8422E" strokeWidth="1"
          fill="rgba(184,66,46,0.15)" />
        <polygon points="12,4 18,10 12,16 6,10" stroke="#4a90d9" strokeWidth="0.7"
          fill="rgba(74,144,217,0.1)" />
        <circle cx="12" cy="10" r="2" fill="#B8422E" opacity="0.8" />
      </g>
    </svg>
  )
}

/* ── Feature card ────────────────────────────────── */
function FeatureCard({ icon, title, body, accent = '#B8422E' }) {
  return (
    <div className="home-feature-card" style={{ '--feat-accent': accent }}>
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
      <Starfield />

      {/* Nebula glows */}
      <div className="home-nebula home-nebula-1" />
      <div className="home-nebula home-nebula-2" />
      <div className="home-nebula home-nebula-3" />

      {/* ── Nav bar ── */}
      <header className="home-nav">
        <div className="home-nav-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
          <div className="home-hero-eyebrow">Real-time meeting intelligence</div>
          <h1 className="home-hero-title">
            Every word attributed.<br />
            Every idea mapped.<br />
            <span className="home-hero-accent">Nothing forgotten.</span>
          </h1>
          <p className="home-hero-sub">
            Recognize identifies who is speaking in Google Meet at the word level, transcribes everything,
            and feeds it all into a persistent 3D knowledge graph that accumulates your team's
            institutional memory across every session.
          </p>
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

        {/* ── What it solves ── */}
        <section className="home-section">
          <div className="home-section-label">WHAT IT SOLVES</div>
          <h2 className="home-section-title">Two open problems. Both closed.</h2>
          <div className="home-solves-grid">
            <div className="home-solve-card">
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
            <div className="home-solve-card">
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

        {/* ── Pipeline strip ── */}
        <section className="home-pipeline">
          {[
            { label: 'Chrome Extension', sub: 'tab capture + overlay' },
            { label: 'Diarization Server', sub: 'MediaPipe + Whisper' },
            { label: 'GraphRAG Backend', sub: 'FastAPI + Neo4j' },
            { label: 'Claude', sub: 'extraction + answers' },
            { label: '3D Interface', sub: 'Three.js + React' },
          ].map((step, i, arr) => (
            <div key={i} className="home-pipeline-step">
              <div className="home-pipeline-dot" />
              <div className="home-pipeline-label">{step.label}</div>
              <div className="home-pipeline-sub">{step.sub}</div>
              {i < arr.length - 1 && <div className="home-pipeline-arrow">→</div>}
            </div>
          ))}
        </section>

        {/* ── Footer ── */}
        <footer className="home-footer">
          <div className="home-footer-brand">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
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
            <span>RECOGNIZE</span>
          </div>
          <span className="home-footer-copy">Meeting intelligence for teams that think in graphs.</span>
        </footer>
      </main>
    </div>
  )
}
