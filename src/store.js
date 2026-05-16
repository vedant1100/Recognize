import { create } from 'zustand'

export const useStore = create((set, get) => ({
  graphData:    { nodes: [], links: [] },
  selectedNode: null,
  messages:     [],
  backendOk:    false,

  setGraphData:    data => set({ graphData: data }),
  setSelectedNode: node => set({ selectedNode: node }),
  setBackendOk:    ok   => set({ backendOk: ok }),

  addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),
  replaceLastMessage: (msg) => set(s => ({
    messages: [...s.messages.slice(0, -1), msg],
  })),
}))
