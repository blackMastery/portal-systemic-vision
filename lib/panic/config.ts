import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { logger } from '@/lib/logger'
import { normalizeToE164Guyana } from '@/lib/sms/twilio'

export const PANIC_HOLD_MS = 3000

export const PANIC_CONFIG_KEYS = {
  enabled: 'panic_button_enabled',
  supportNumbers: 'panic_support_numbers',
  testMode: 'panic_test_mode',
} as const

export type PanicConfig = {
  enabled: boolean
  supportNumbers: string[]
  supportDisplay: string
  testMode: boolean
  testNumber: string | null
  holdMs: number
}

function envSupportNumbers(): string[] {
  const raw = process.env.PANIC_SUPPORT_NUMBERS ?? ''
  return raw
    .split(',')
    .map((n) => normalizeToE164Guyana(n))
    .filter((n): n is string => !!n)
}

function asObject(v: Json | null | undefined): Record<string, Json | undefined> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, Json | undefined>
  return null
}

/**
 * Loads the panic configuration: `system_config` rows override env vars,
 * env vars override built-in defaults. Malformed values fail open
 * (button enabled) and are logged, matching the trip-requests flag.
 */
export async function loadPanicConfig(
  service: SupabaseClient<Database>
): Promise<PanicConfig> {
  const defaults: PanicConfig = {
    enabled: true,
    supportNumbers: envSupportNumbers(),
    supportDisplay: '',
    testMode: (process.env.PANIC_TEST_MODE ?? '').toLowerCase() === 'true',
    testNumber: normalizeToE164Guyana(process.env.PANIC_TEST_NUMBER) ?? null,
    holdMs: PANIC_HOLD_MS,
  }

  const { data, error } = await service
    .from('system_config')
    .select('key, value')
    .in('key', Object.values(PANIC_CONFIG_KEYS))

  if (error) {
    logger.warn('panic system_config read failed; using env defaults', { error })
    return finalize(defaults)
  }

  const cfg = { ...defaults }
  for (const row of data ?? []) {
    const v = row.value as Json
    if (row.key === PANIC_CONFIG_KEYS.enabled) {
      const o = asObject(v)
      if (typeof v === 'boolean') cfg.enabled = v
      else if (o && typeof o.enabled === 'boolean') cfg.enabled = o.enabled
      else logger.warn('panic_button_enabled malformed; failing open', { value: v })
    } else if (row.key === PANIC_CONFIG_KEYS.supportNumbers) {
      const o = asObject(v)
      const list = o && Array.isArray(o.numbers) ? o.numbers : Array.isArray(v) ? v : null
      if (list) {
        const numbers = list
          .map((n) => normalizeToE164Guyana(typeof n === 'string' ? n : null))
          .filter((n): n is string => !!n)
        if (numbers.length > 0) cfg.supportNumbers = numbers
      }
      if (o && typeof o.display === 'string' && o.display.trim()) {
        cfg.supportDisplay = o.display.trim()
      }
    } else if (row.key === PANIC_CONFIG_KEYS.testMode) {
      const o = asObject(v)
      if (o) {
        if (typeof o.enabled === 'boolean') cfg.testMode = cfg.testMode || o.enabled
        if (typeof o.test_number === 'string') {
          const n = normalizeToE164Guyana(o.test_number)
          if (n) cfg.testNumber = n
        }
      }
    }
  }
  return finalize(cfg)
}

function finalize(cfg: PanicConfig): PanicConfig {
  return {
    ...cfg,
    supportDisplay: cfg.supportDisplay || cfg.supportNumbers[0] || '',
  }
}
