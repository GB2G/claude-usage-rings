export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  limits: Limit[]
  // false while the figures are the last ones a session saw, not this one's.
  isLive: boolean
}

export type Item = { content: string; status: 'pending' | 'in_progress' | 'completed' }
export type Task = {
  // When the running prompt began, in clock milliseconds.
  startedAt: number
  // The task list the model keeps, empty when it keeps none.
  items: Item[]
  // When each completed step finished, in order.
  doneAt: number[]
  // Median length of this person's recent turns, 0 until there is a history.
  typicalMs: number
  // How long the last finished turn took, 0 until one has.
  lastMs: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-rings': {
      snapshot: Shaped<Snapshot | null>
      task: Shaped<Task | null>
    }
  }
}
