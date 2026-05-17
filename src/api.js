const BASE = '/api'

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, opts)
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${r.status}`)
  }
  return r.json()
}

export const api = {
  stats:        ()             => req('/stats'),
  graph:        ()             => req('/graph'),
  communities:  ()             => req('/communities'),

  upload: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return req('/upload', { method: 'POST', body: fd })
  },

  // Local GraphRAG: entity vector search → graph traversal → Claude
  query: (query, k = 8) => req('/query', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, k, mode: 'local' }),
  }),

  // Global GraphRAG: community summaries → holistic Claude answer
  queryGlobal: (query) => req('/query', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, k: 8, mode: 'global' }),
  }),

  // Run Louvain community detection + generate summaries (slow, call once after upload)
  buildCommunities: () => req('/communities/build', { method: 'POST' }),

  transcribe: (file, personNames = []) => {
    const fd = new FormData()
    fd.append('file', file, 'query.webm')
    fd.append('language', 'en')
    if (personNames.length > 0) {
      fd.append('custom_dictionary', JSON.stringify(personNames))
    }
    return req('/transcribe', { method: 'POST', body: fd })
  },

  deleteDocument: (id) => req(`/documents/${id}`, { method: 'DELETE' }),
}
