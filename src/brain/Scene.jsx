import { useRef, useMemo, useCallback, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Billboard, Stars } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useForceGraph } from './useForceGraph'
import { useStore } from '../store'

const ENTITY_COLOR = {
  CONCEPT: new THREE.Color('#B8422E'),
  PERSON: new THREE.Color('#d48a50'),
  ORGANIZATION: new THREE.Color('#4a90d9'),
  PLACE: new THREE.Color('#5cb87a'),
  TECHNOLOGY: new THREE.Color('#50c8c8'),
  EVENT: new THREE.Color('#c8b840'),
  CHUNK: new THREE.Color('#9b6dff'),
}

function entityColor(node) {
  return ENTITY_COLOR[node?.type] ?? ENTITY_COLOR.CONCEPT
}

// ── Dragger ───────────────────────────────────────────────
function Dragger({ nodesRef, simRef, orbitRef, dragRef, dirtyRef }) {
  const { raycaster, pointer, camera } = useThree()
  const hitTarget = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const onUp = () => {
      if (!dragRef.current.active) return
      const node = nodesRef.current[dragRef.current.nodeIdx]
      if (node) { node.fx = null; node.fy = null }
      dragRef.current.active = false
      dragRef.current.nodeIdx = null
      simRef.current?.alphaTarget(0)
      if (orbitRef.current) orbitRef.current.enabled = true
      document.body.style.cursor = 'default'
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [])

  useFrame(() => {
    if (!dragRef.current.active || dragRef.current.nodeIdx == null) return
    raycaster.setFromCamera(pointer, camera)
    if (raycaster.ray.intersectPlane(dragRef.current.plane, hitTarget)) {
      const node = nodesRef.current[dragRef.current.nodeIdx]
      if (node) {
        node.fx = hitTarget.x
        node.fy = hitTarget.y
        dirtyRef.current = true
      }
    }
  })

  return null
}

// ── NodeMesh ──────────────────────────────────────────────
// Reusable instanced-mesh for one node category (entity or chunk).
// idxList maps local instance index → global nodesRef index.
function NodeMesh({
  idxList, nodesRef, simRef, orbitRef, dragRef, dirtyRef,
  geometryArgs, geometryType = 'sphere',
  material, rotateSpeed = 0,
}) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const selected = useStore(s => s.selectedNode)
  const setSelected = useStore(s => s.setSelectedNode)
  const prevSelId = useRef(null)
  const rotRef = useRef(0)
  const count = idxList.length

  const onPointerDown = useCallback(e => {
    const localIdx = e.instanceId
    if (localIdx == null) return
    e.stopPropagation()
    const globalIdx = idxList[localIdx]
    const node = nodesRef.current[globalIdx]
    if (!node) return
    const nodePos = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0)
    const normal = e.camera
      ? e.camera.position.clone().sub(nodePos).normalize()
      : new THREE.Vector3(0, 0, 1)
    dragRef.current.plane.setFromNormalAndCoplanarPoint(normal, nodePos)
    dragRef.current.active = true
    dragRef.current.nodeIdx = globalIdx
    node.fx = node.x; node.fy = node.y
    simRef.current?.alphaTarget(0.3).restart()
    if (orbitRef.current) orbitRef.current.enabled = false
    document.body.style.cursor = 'grabbing'
  }, [idxList, nodesRef, simRef, orbitRef, dragRef])

  const onClick = useCallback(e => {
    const localIdx = e.instanceId
    if (localIdx == null) return
    const globalIdx = idxList[localIdx]
    const n = nodesRef.current[globalIdx]
    if (!n) return
    setSelected(selected?.id === n.id ? null : n)
  }, [idxList, nodesRef, selected, setSelected])

  useFrame((_, dt) => {
    if (!meshRef.current || count === 0) return
    const selChanged = selected?.id !== prevSelId.current
    if (!dirtyRef.current && !selChanged && rotateSpeed === 0) return
    prevSelId.current = selected?.id
    if (rotateSpeed > 0) rotRef.current += dt * rotateSpeed
    const r = rotRef.current
    const nodes = nodesRef.current
    for (let i = 0; i < count; i++) {
      const n = nodes[idxList[i]]
      if (!n) continue
      dummy.position.set(n.x || 0, n.y || 0, n.z || 0)
      if (rotateSpeed > 0) {
        dummy.rotation.set(r * 0.6, r, r * 0.4)
      } else {
        dummy.rotation.set(0, 0, 0)
      }
      dummy.scale.setScalar((n.r || 7) / 7)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
      color.copy(n.id === selected?.id ? new THREE.Color('#ffffff') : entityColor(n))
      meshRef.current.setColorAt(i, color)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  })

  if (count === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, count]}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerEnter={() => { document.body.style.cursor = 'grab' }}
      onPointerLeave={() => { if (!dragRef.current.active) document.body.style.cursor = 'default' }}
    >
      {geometryType === 'icosahedron'
        ? <icosahedronGeometry args={geometryArgs} />
        : <sphereGeometry args={geometryArgs} />}
      {material}
    </instancedMesh>
  )
}

// ── SelectionRing ─────────────────────────────────────────
// Pulsing wireframe shell around the currently selected node.
function SelectionRing({ nodesRef }) {
  const ref = useRef()
  const selected = useStore(s => s.selectedNode)

  useFrame((state) => {
    if (!ref.current) return
    if (!selected) { ref.current.visible = false; return }
    const n = nodesRef.current.find(x => x.id === selected.id)
    if (!n) { ref.current.visible = false; return }
    ref.current.visible = true
    const t = state.clock.elapsedTime
    const pulse = 1 + Math.sin(t * 3) * 0.08
    const r = ((n.r || 7) + 4) * pulse / 7
    ref.current.position.set(n.x || 0, n.y || 0, n.z || 0)
    ref.current.scale.setScalar(r)
    ref.current.rotation.y += 0.01
    ref.current.rotation.x += 0.006
  })

  return (
    <mesh ref={ref} raycast={() => null} visible={false}>
      <icosahedronGeometry args={[7, 1]} />
      <meshBasicMaterial color="#fffaf2" wireframe transparent opacity={0.55} />
    </mesh>
  )
}

// ── GraphEdges ────────────────────────────────────────────
function GraphEdges({ graphData, nodesRef, dirtyRef }) {
  const ref = useRef()
  const count = graphData.links.length

  const positions = useMemo(() => new Float32Array(count * 6), [count])

  useFrame(() => {
    if (!ref.current || count === 0 || !dirtyRef.current) return
    const buf = ref.current.geometry.attributes.position.array
    const links = graphData.links
    let idx = 0
    for (const l of links) {
      const s = typeof l.source === 'object' ? l.source : nodesRef.current.find(n => n.id === l.source)
      const t = typeof l.target === 'object' ? l.target : nodesRef.current.find(n => n.id === l.target)
      buf[idx++] = s?.x || 0; buf[idx++] = s?.y || 0; buf[idx++] = s?.z || 0
      buf[idx++] = t?.x || 0; buf[idx++] = t?.y || 0; buf[idx++] = t?.z || 0
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  if (count === 0) return null

  return (
    <lineSegments ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#9ab0d0" transparent opacity={0.45} />
    </lineSegments>
  )
}

// ── NodeLabels ────────────────────────────────────────────
function NodeLabels({ graphData, nodesRef, dirtyRef }) {
  const groupRef = useRef()
  const count = graphData.nodes.length
  const selected = useStore(s => s.selectedNode)
  const setSelected = useStore(s => s.setSelectedNode)

  useFrame(() => {
    if (!groupRef.current || count === 0 || !dirtyRef.current) return
    const children = groupRef.current.children
    const nodes = nodesRef.current
    for (let i = 0; i < Math.min(nodes.length, children.length); i++) {
      const n = nodes[i]
      children[i].position.set(n.x || 0, (n.y || 0) + (n.r || 7) + 5, n.z || 0)
    }
  })

  if (count === 0) return null

  return (
    <group ref={groupRef}>
      {graphData.nodes.map((n, i) => {
        const label = (n.label || '').length > 22 ? (n.label || '').slice(0, 22) + '…' : (n.label || '')
        const isSelected = selected?.id === n.id
        return (
          <Billboard
            key={n.id || i}
            onClick={(e) => {
              e.stopPropagation()
              setSelected(selected?.id === n.id ? null : n)
            }}
            onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
            onPointerLeave={() => { document.body.style.cursor = 'default' }}
          >
            <Text
              fontSize={isSelected ? 4.2 : 3.4}
              color={isSelected ? '#fff7e8' : '#F7F5F2'}
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.18}
              outlineColor="#000000"
              outlineOpacity={0.95}
              maxWidth={50}
            >
              {label}
            </Text>
          </Billboard>
        )
      })}
    </group>
  )
}

// ── NeuralPulses ──────────────────────────────────────────
const PULSE_COUNT = 14

function NeuralPulses({ graphData, nodesRef }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tsRef = useRef(Array.from({ length: PULSE_COUNT }, () => Math.random()))
  const linkIdxRef = useRef(Array.from({ length: PULSE_COUNT }, () =>
    Math.floor(Math.random() * Math.max(1, graphData.links.length))
  ))

  useFrame((_, delta) => {
    if (!meshRef.current || graphData.links.length === 0) return
    const ts = tsRef.current
    const idxs = linkIdxRef.current

    for (let i = 0; i < PULSE_COUNT; i++) {
      ts[i] = (ts[i] + delta * (0.32 + i * 0.05)) % 1

      const link = graphData.links[idxs[i] % graphData.links.length]
      if (!link) continue
      const s = typeof link.source === 'object' ? link.source : nodesRef.current.find(n => n.id === link.source)
      const t = typeof link.target === 'object' ? link.target : nodesRef.current.find(n => n.id === link.target)
      if (!s || !t) continue

      const tt = ts[i]
      dummy.position.set(
        (s.x || 0) + ((t.x || 0) - (s.x || 0)) * tt,
        (s.y || 0) + ((t.y || 0) - (s.y || 0)) * tt,
        (s.z || 0) + ((t.z || 0) - (s.z || 0)) * tt,
      )
      const fade = Math.sin(tt * Math.PI)
      dummy.scale.setScalar(fade * 0.75 + 0.15)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  if (graphData.links.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[null, null, PULSE_COUNT]} raycast={() => null}>
      <sphereGeometry args={[2.8, 8, 8]} />
      <meshStandardMaterial color="#ff6644" emissive="#ff4422" emissiveIntensity={4} roughness={0} />
    </instancedMesh>
  )
}

// ── Scene root ────────────────────────────────────────────
export function Scene({ graphData }) {
  const orbitRef = useRef()
  const dragRef = useRef({ active: false, nodeIdx: null, plane: new THREE.Plane() })
  const { nodesRef, simRef, mouseRef, dirtyRef } = useForceGraph(graphData)
  const { mouse } = useThree()

  useFrame(() => {
    mouseRef.current.x = mouse.x * 240
    mouseRef.current.y = mouse.y * 240
  })

  // Split node indices by type so we can render chunks with their own geometry
  const { entityIdxs, chunkIdxs } = useMemo(() => {
    const e = [], c = []
    graphData.nodes.forEach((n, i) => {
      if (n.type === 'CHUNK') c.push(i)
      else e.push(i)
    })
    return { entityIdxs: e, chunkIdxs: c }
  }, [graphData.nodes])

  const sharedProps = { nodesRef, simRef, orbitRef, dragRef, dirtyRef }

  return (
    <>
      <color attach="background" args={['#060810']} />
      <fog attach="fog" args={['#060810', 380, 760]} />

      <Stars radius={500} depth={250} count={2500} factor={5} saturation={0} fade speed={0.4} />

      <ambientLight intensity={0.12} />
      <hemisphereLight args={['#4a90d9', '#1a0a14', 0.25]} />
      <pointLight position={[0, 0, 120]} intensity={0.7} color="#B8422E" distance={420} />
      <pointLight position={[0, 0, -120]} intensity={0.25} color="#4a90d9" distance={320} />
      <pointLight position={[150, 60, 0]} intensity={0.35} color="#9b6dff" distance={300} />

      <GraphEdges graphData={graphData} nodesRef={nodesRef} dirtyRef={dirtyRef} />
      <NeuralPulses graphData={graphData} nodesRef={nodesRef} />

      <NodeMesh
        idxList={entityIdxs}
        {...sharedProps}
        geometryType="sphere"
        geometryArgs={[7, 24, 24]}
        material={
          <meshStandardMaterial
            vertexColors
            emissive="#ffffff"
            emissiveIntensity={0.65}
            roughness={0.32}
            metalness={0.18}
          />
        }
      />
      <NodeMesh
        idxList={chunkIdxs}
        {...sharedProps}
        geometryType="icosahedron"
        geometryArgs={[7, 0]}
        rotateSpeed={0.45}
        material={
          <meshStandardMaterial
            vertexColors
            emissive="#ffffff"
            emissiveIntensity={1.25}
            roughness={0.15}
            metalness={0.7}
            flatShading
          />
        }
      />

      <SelectionRing nodesRef={nodesRef} />
      <NodeLabels graphData={graphData} nodesRef={nodesRef} dirtyRef={dirtyRef} />
      <Dragger {...sharedProps} />

      <EffectComposer>
        <Bloom
          intensity={2.2}
          luminanceThreshold={0.05}
          luminanceSmoothing={0.85}
          mipmapBlur
        />
        <Vignette offset={0.3} darkness={0.7} eskil={false} />
      </EffectComposer>

      <OrbitControls
        ref={orbitRef}
        enableDamping
        dampingFactor={0.08}
        autoRotate={false}
        enablePan={true}
        panSpeed={0.6}
        minDistance={60}
        maxDistance={700}
      />
    </>
  )
}
