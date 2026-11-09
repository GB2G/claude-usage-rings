import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Snapshot } from '../types'

const STORE_KEY = 'last-limits'
const snapshot = atom({ plugin: 'usage-rings', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})

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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || snap === null || snap.limits.length === 0) {
      return next(e)
    }
    const now = await $.clock.now()

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box paddingX={1} gap={3}>
          {snap.limits.map(l => (
            <Text key={l.kind} dimColor={!snap.isLive}>
              {glyph(l.percentUsed)} {label(l.kind)} {pct(l.percentUsed)}{' '}
              <Text dimColor>{resetIn(l.resetsAt, now)}</Text>
            </Text>
          ))}
          {snap.isLive ? null : <Text dimColor>(last seen)</Text>}
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)
    return (
      <Box paddingX={1} gap={4} alignItems="center">
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
    )
  })
}
