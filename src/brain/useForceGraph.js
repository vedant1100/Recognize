import { useRef, useEffect } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force'

export function useForceGraph(graphData) {
  const nodesRef  = useRef([])
  const linksRef  = useRef([])
  const simRef    = useRef(null)
  const mouseRef  = useRef({ x: 0, y: 0 })
  const dirtyRef  = useRef(true)  // true while simulation is ticking

  useEffect(() => {
    if (!graphData) return

    const posMap = new Map(nodesRef.current.map(n => [n.id, { x: n.x, y: n.y, z: n.z, vx: n.vx, vy: n.vy }]))

    const deg = {}
    for (const l of graphData.links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      deg[s] = (deg[s] || 0) + 1
      deg[t] = (deg[t] || 0) + 1
    }

    nodesRef.current = graphData.nodes.map(n => {
      const old = posMap.get(n.id)
      return {
        ...n,
        x:  old?.x  ?? (Math.random() - 0.5) * 180,
        y:  old?.y  ?? (Math.random() - 0.5) * 180,
        z:  n.z     ?? (Math.random() - 0.5) * 80,
        vx: old?.vx ?? 0,
        vy: old?.vy ?? 0,
        vz: n.vz    ?? 0,
        connections: deg[n.id] || 0,
        r:  5 + Math.min(11, (deg[n.id] || 0) * 1.5),
      }
    })

    linksRef.current = graphData.links.map(l => ({ ...l }))
    simRef.current?.stop()

    simRef.current = forceSimulation(nodesRef.current)
      .force('link',    forceLink(linksRef.current).id(d => d.id).distance(65).strength(0.7))
      .force('charge',  forceManyBody().strength(n => -40 - n.r * 2.5))
      .force('center',  forceCenter(0, 0).strength(0.08))
      .force('collide', forceCollide().radius(n => n.r + 6).strength(0.8))
      .force('mouse', alpha => {
        const { x: mx, y: my } = mouseRef.current
        for (const n of nodesRef.current) {
          const dx = mx - (n.x || 0)
          const dy = my - (n.y || 0)
          const d  = Math.hypot(dx, dy)
          if (d < 150 && d > 1) {
            const f = ((150 - d) / 150) * 0.08 * alpha
            n.vx = (n.vx || 0) + (dx / d) * f * 6
            n.vy = (n.vy || 0) + (dy / d) * f * 6
          }
        }
      })
      .alphaDecay(0.018)
      .velocityDecay(0.55)
      .on('tick', () => {
        dirtyRef.current = true
        for (const n of nodesRef.current) {
          n.vz = ((n.vz || 0) * 0.92) - (n.z || 0) * 0.012
          n.z  = (n.z  || 0) + n.vz
        }
      })
      .on('end', () => { dirtyRef.current = false })

    dirtyRef.current = true // kick off initial render

    return () => { simRef.current?.stop() }
  }, [graphData])

  return { nodesRef, linksRef, simRef, mouseRef, dirtyRef }
}
