import type { HeadingLevel, HeadingStyles, HeadingStyleType, PerThemeSettings } from '@md/shared/configs'

/**
 * Theme share text codec.
 *
 * Format: `MDTHEME1.<base64url(JSON payload)>.<fnv1a-32 hex checksum>`
 * The checksum covers the base64 payload so corrupted / truncated share text
 * is rejected before JSON parsing.
 */

export const THEME_SHARE_PREFIX = `MDTHEME1`

/** Render / style settings bundled into a theme share payload. */
export interface ThemeShareSettings extends Partial<PerThemeSettings> {
  legend?: string
  isCiteStatus?: boolean
  isCountStatus?: boolean
  isUseIndent?: boolean
  isUseJustify?: boolean
}

export interface ThemeSharePayload {
  v: 1
  name: string
  css: string
  settings?: ThemeShareSettings
}

export type ThemeShareDecodeError
  = | 'empty'
    | 'badFormat'
    | 'badChecksum'
    | 'badPayload'

export type ThemeShareDecodeResult
  = | { ok: true, payload: ThemeSharePayload }
    | { ok: false, error: ThemeShareDecodeError }

const MAX_NAME_LENGTH = 100
const MAX_CSS_LENGTH = 500 * 1024

const HEADING_LEVELS: HeadingLevel[] = [`h1`, `h2`, `h3`, `h4`, `h5`, `h6`]
const HEADING_STYLE_TYPES: HeadingStyleType[] = [`default`, `color-only`, `border-bottom`, `border-left`, `custom`]

/** FNV-1a 32-bit, hex-encoded. Synchronous integrity check for share text. */
function fnv1a(input: string): string {
  let hash = 0x811C9DC5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, `0`)
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ``
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, `-`).replace(/\//g, `_`).replace(/=+$/, ``)
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, `+`).replace(/_/g, `/`)
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), `=`)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === `object` && value !== null && !Array.isArray(value)
}

function isValidHeadingStyles(value: unknown): value is HeadingStyles {
  if (!isPlainObject(value))
    return false
  return Object.entries(value).every(([key, style]) =>
    (HEADING_LEVELS as string[]).includes(key)
    && typeof style === `string`
    && (HEADING_STYLE_TYPES as string[]).includes(style),
  )
}

const STRING_SETTING_KEYS = [
  `primaryColor`,
  `fontFamily`,
  `fontSize`,
  `lineHeight`,
  `blockSpacing`,
  `linkColor`,
  `blockquoteBackground`,
  `codeBlockTheme`,
  `legend`,
] as const

const BOOLEAN_SETTING_KEYS = [
  `isShowLineNumber`,
  `isMacCodeBlock`,
  `isCiteStatus`,
  `isCountStatus`,
  `isUseIndent`,
  `isUseJustify`,
] as const

function sanitizeSettings(raw: unknown): ThemeShareSettings | null {
  if (raw === undefined)
    return {}
  if (!isPlainObject(raw))
    return null

  const settings: ThemeShareSettings = {}
  for (const key of STRING_SETTING_KEYS) {
    const value = raw[key]
    if (value === undefined)
      continue
    if (typeof value !== `string` || value.length > 2048) {
      return null
    }(settings as Record<string, unknown>)[key] = value
  }
  for (const key of BOOLEAN_SETTING_KEYS) {
    const value = raw[key]
    if (value === undefined)
      continue
    if (typeof value !== `boolean`) {
      return null
    }(settings as Record<string, unknown>)[key] = value
  }
  if (raw.headingStyles !== undefined) {
    if (!isValidHeadingStyles(raw.headingStyles))
      return null
    settings.headingStyles = raw.headingStyles
  }
  return settings
}

export function encodeThemeShare(payload: ThemeSharePayload): string {
  const body = toBase64Url(JSON.stringify(payload))
  return `${THEME_SHARE_PREFIX}.${body}.${fnv1a(body)}`
}

export function decodeThemeShare(text: string): ThemeShareDecodeResult {
  const trimmed = text.trim()
  if (!trimmed)
    return { ok: false, error: `empty` }

  const parts = trimmed.split(`.`)
  if (parts.length !== 3 || parts[0] !== THEME_SHARE_PREFIX || !parts[1] || !parts[2])
    return { ok: false, error: `badFormat` }

  const [, body, checksum] = parts
  if (!/^[0-9a-f]{8}$/i.test(checksum) || fnv1a(body) !== checksum.toLowerCase())
    return { ok: false, error: `badChecksum` }

  let raw: unknown
  try {
    raw = JSON.parse(fromBase64Url(body))
  }
  catch {
    return { ok: false, error: `badPayload` }
  }

  if (!isPlainObject(raw) || raw.v !== 1)
    return { ok: false, error: `badPayload` }
  if (typeof raw.name !== `string` || !raw.name.trim() || raw.name.length > MAX_NAME_LENGTH)
    return { ok: false, error: `badPayload` }
  if (typeof raw.css !== `string` || raw.css.length > MAX_CSS_LENGTH)
    return { ok: false, error: `badPayload` }

  const settings = sanitizeSettings(raw.settings)
  if (settings === null)
    return { ok: false, error: `badPayload` }

  return {
    ok: true,
    payload: {
      v: 1,
      name: raw.name.trim(),
      css: raw.css,
      settings,
    },
  }
}
