export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  limits: Limit[]
  // false while the figures are the last ones a session saw, not this one's.
  isLive: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'usage-rings': { snapshot: Shaped<Snapshot | null> }
  }
}
