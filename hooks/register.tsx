import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item, Limit, Snapshot, Task } from '../types'

const STORE_KEY = 'last-limits'
const snapshot = atom({ plugin: 'usage-rings', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})

const task = atom({ plugin: 'usage-rings', key: 'task' } as const, null, {
  shape: 'task-2',
})

const DURATIONS_KEY = 'turn-durations'
const PLAN_TOOL = 'mcp__ccd_turn__update_plan'

const NAMES: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: 'Weekly',
  seven_day_opus: 'Weekly Opus',
  seven_day_sonnet: 'Weekly Sonnet',
  spend_limit: 'Spend',
}

const label = (kind: string) => NAMES[kind] ?? kind.replace(/_/g, ' ')

const colorFor = (percent: number) =>
  percent >= 90 ? '#e5534b' : percent >= 70 ? '#e0a030' : '#4caf7a'

const clamp = (n: number) => Math.max(0, Math.min(100, n))

const resetIn = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const minutes = Math.round((new Date(resetsAt).getTime() - now) / 60000)
  if (Number.isNaN(minutes) || minutes <= 0) return 'resetting'
  if (minutes < 60) return `resets ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `resets ${hours}h ${minutes % 60}m`
  return `resets ${Math.round(hours / 24)}d`
}

const ringSvg = (percent: number) => {
  const r = 12
  const c = 2 * Math.PI * r
  const dash = (c * clamp(percent)) / 100
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    `<circle cx="16" cy="16" r="${r}" fill="none" stroke="#888" stroke-opacity="0.3" stroke-width="4"/>` +
    `<circle cx="16" cy="16" r="${r}" fill="none" stroke="${colorFor(percent)}" stroke-width="4" ` +
    `stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 16 16)"/>` +
    '</svg>'
  )
}


const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// The task list as the model last wrote it. `update_plan` sends either the
// whole list (`items`) or a change to it (`advance`, `done`, `start`).
const applyPlan = (items: Item[], input: Record<string, unknown>): Item[] => {
  if (Array.isArray(input.items)) {
    return (input.items as Item[]).map(i => ({ content: String(i.content), status: i.status }))
  }
  const next = items.map(i => ({ ...i }))
  if (input.advance === true) {
    const at = next.findIndex(i => i.status === 'in_progress')
    if (at >= 0) next[at].status = 'completed'
    const up = next.findIndex(i => i.status === 'pending')
    if (up >= 0) next[up].status = 'in_progress'
  }
  if (Array.isArray(input.done)) {
    for (const n of input.done as number[]) if (next[n - 1]) next[n - 1].status = 'completed'
  }
  if (typeof input.start === 'number' && next[input.start - 1]) {
    next[input.start - 1].status = 'in_progress'
  }
  return next
}

type Progress = { fraction: number | null; label: string; eta: string }

const progressOf = (t: Task, now: number): Progress => {
  const elapsed = now - t.startedAt
  const total = t.items.length
  if (total > 0) {
    const done = t.items.filter(i => i.status === 'completed').length
    const fraction = done / total
    const lastDone = t.doneAt.length > 0 ? t.doneAt[t.doneAt.length - 1] : t.startedAt
    const perStep = done > 0 ? (lastDone - t.startedAt) / done : t.typicalMs > 0 ? t.typicalMs / total : 0
    const label = `Task ${done}/${total}`
    if (perStep === 0) return { fraction, label, eta: `${fmt(elapsed)} elapsed` }
    const left = perStep * (total - done) - (now - lastDone)
    return {
      fraction,
      label,
      eta: left > 0 ? `~${fmt(left)} left` : 'taking longer than estimated',
    }
  }
  if (t.typicalMs > 0) {
    const fraction = Math.min(elapsed / t.typicalMs, 0.95)
    const left = t.typicalMs - elapsed
    return {
      fraction,
      label: 'Working',
      eta: left > 0 ? `~${fmt(left)} left` : 'taking longer than usual',
    }
  }
  return { fraction: null, label: 'Working', eta: `${fmt(elapsed)} elapsed` }
}

const textBar = (fraction: number | null) => {
  const width = 12
  if (fraction === null) return '·'.repeat(width)
  const on = Math.round(fraction * width)
  return '█'.repeat(on) + '░'.repeat(width - on)
}

const barSvg = (fraction: number | null) => {
  const w = 72
  const fill = fraction === null ? 0 : Math.round(w * fraction)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="8" viewBox="0 0 ${w} 8">` +
    `<rect width="${w}" height="8" rx="4" fill="#888" fill-opacity="0.3"/>` +
    (fill > 0 ? `<rect width="${fill}" height="8" rx="4" fill="#5b8def"/>` : '') +
    '</svg>'
  )
}

const GLYPHS = ['○', '◔', '◑', '◕', '●']
const glyph = (percent: number) => GLYPHS[Math.round(clamp(percent) / 25)]

const pct = (n: number) => `${Math.round(n)}%`

async function save($: EngineInterface, limits: Limit[]) {
  const next: Snapshot = { limits, isLive: true }
  await update($, snapshot, () => next)
  await $.store.set(STORE_KEY, limits)
}

export const register: Register = on => {
  // Show the last figures any session saw at once; replace them with this
  // session's the moment the engine has a reading.
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(STORE_KEY)
    if (Array.isArray(saved) && saved.length > 0) {
      await update($, snapshot, () => ({ limits: saved as Limit[], isLive: false }))
    }
    const { rateLimits } = await $.session.usage()
    if (rateLimits.length > 0) await save($, rateLimits)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0) await save($, e.rateLimits)

    return next(e)
  })

  let ticker: { cancel: () => void } | undefined

  on('prompt.submit', async ($, e, next) => {
    try {
      if (!e.command) {
        const saved = await $.store.get(DURATIONS_KEY)
        const typicalMs = Array.isArray(saved) ? median(saved as number[]) : 0
        const startedAt = await $.clock.now()
        await update($, task, () => ({ startedAt, items: [], doneAt: [], typicalMs, lastMs: 0 }))
        ticker?.cancel()
        ticker = $.clock.every(1000, () => $.ui.invalidate('ui.render'))
      }
    } catch {
      // The progress bar is optional; never hold up the prompt.
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    try {
      const input = e as unknown as Record<string, unknown>
      const isPlan = e.tool === PLAN_TOOL
      const isTodos = e.tool === 'TodoWrite'
      if (!e.agentId && (isPlan || isTodos)) {
        const now = await $.clock.now()
        await update($, task, t => {
          if (t === null) return t
          const items = isTodos
            ? applyPlan(t.items, { items: input.todos })
            : applyPlan(t.items, input)
          const doneNow = items.filter(i => i.status === 'completed').length
          const doneAt = [...t.doneAt]
          while (doneAt.length < doneNow) doneAt.push(now)
          return { ...t, items, doneAt: doneAt.slice(0, doneNow) }
        })
      }

    } catch {
      // Never hold up a tool call over a progress bar.
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    ticker?.cancel()
    ticker = undefined
    const t = await read($, task)
    if (t !== null && !e.agentId) {
      const took = (await $.clock.now()) - t.startedAt
      if (took > 5000) {
        const saved = await $.store.get(DURATIONS_KEY)
        const history = Array.isArray(saved) ? (saved as number[]) : []
        await $.store.set(DURATIONS_KEY, [...history, took].slice(-20))
      }
      await update($, task, cur => (cur === null ? cur : { ...cur, lastMs: took }))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    const t = await read($, task)
    const hasLimits = snap !== null && snap.limits.length > 0
    if (e.props.hasSurvey) {
      return next(e)
    }
    const now = await $.clock.now()
    let prog: Progress
    if (e.props.isWorking && t !== null) {
      prog = progressOf(t, now)
    } else {
      // Idle: an empty bar, with how long the last turn took where known.
      let last = t === null ? 0 : t.lastMs
      if (last === 0) {
        const saved = await $.store.get(DURATIONS_KEY)
        if (Array.isArray(saved) && saved.length > 0) last = Number(saved[saved.length - 1])
      }
      prog = {
        fraction: 0,
        label: 'Idle',
        eta: last > 0 ? `last task ${fmt(last)}` : 'no task running',
      }
    }

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box width="100%" flexWrap="wrap" gap={4} justifyContent={hasLimits ? 'space-between' : 'flex-end'}>
          {hasLimits ? (
            <Box paddingX={1} gap={3}>
              {snap.limits.map(l => (
                <Text key={l.kind} dimColor={!snap.isLive}>
                  {glyph(l.percentUsed)} {label(l.kind)} {pct(l.percentUsed)}{' '}
                  <Text dimColor>{resetIn(l.resetsAt, now)}</Text>
                </Text>
              ))}
              {snap.isLive ? null : <Text dimColor>(last seen)</Text>}
            </Box>
          ) : null}
                      <Box paddingX={1} gap={2}>
              <Text>{prog.label}</Text>
              <Text color="blue">{textBar(prog.fraction)}</Text>
              <Text dimColor>{prog.eta}</Text>
            </Box>
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)
    return (
      <Box width="100%" flexWrap="wrap" gap={3} alignItems="center" justifyContent={hasLimits ? 'space-between' : 'flex-end'}>
        {hasLimits ? (
          <Box paddingX={1} gap={3} alignItems="center">
            {snap.limits.map(l => (
              <Box key={l.kind} gap={2} alignItems="center">
                <Svg
                  source={ringSvg(l.percentUsed)}
                  alt={`${label(l.kind)} ${pct(l.percentUsed)} used`}
                  width={32}
                  height={32}
                />
                <Box flexDirection="column">
                  <Text>
                    {label(l.kind)} {pct(l.percentUsed)}
                  </Text>
                  <Text dimColor>{resetIn(l.resetsAt, now)}</Text>
                </Box>
              </Box>
            ))}
            {snap.isLive ? null : <Text dimColor>last seen</Text>}
          </Box>
        ) : null}
                  <Box paddingX={1} gap={2} alignItems="center">
            <Text>{prog.label}</Text>
            <Svg
              source={barSvg(prog.fraction)}
              alt={prog.fraction === null ? prog.label : `${prog.label}, ${Math.round(prog.fraction * 100)}%`}
              width={72}
              height={8}
            />
            <Text dimColor>{prog.eta}</Text>
          </Box>
      </Box>
    )
  })
}
