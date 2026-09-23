import type { HeadingLevel, HeadingStyles, HeadingStyleType, PerThemeSettings } from '@md/shared/configs'

/** Shareable theme payload: custom CSS + per-theme settings + render options. */
export interface ThemeSharePayload {
  version: 1
  name: string
  css: string
  settings?: Partial<PerThemeSettings>
  options?: {
    isCiteStatus?: boolean
    isCountStatus?: boolean
    isUseIndent?: boolean
    isUseJustify?: boolean
    legend?: string
  }
}

export type ThemeShareErrorReason = `empty` | `invalidFormat` | `checksum` | `invalidContent`

export class ThemeShareError extends Error {
  constructor(public reason: ThemeShareErrorReason) {
    super(reason)
    this.name = `ThemeShareError`
  }
}

const SHARE_PREFIX = `MDTHEME1.`
/** Guard against pathological inputs (e.g. multi-MB paste). */
const MAX_SHARE_TEXT_LENGTH = 512 * 1024
const MAX_NAME_LENGTH = 100

const HEADING_LEVELS: HeadingLevel[] = [`h1`, `h2`, `h3`, `h4`, `h5`, `h6`]
const HEADING_STYLE_TYPES: HeadingStyleType[] = [`default`, `color-only`, `border-bottom`, `border-left`, `custom`]

const STRING_SETTING_KEYS = [
  `primaryColor`,
  `fontFamily`,
  `fontSize`,
  `lineHeight`,
  `blockSpacing`,
  `linkColor`,
  `blockquoteBackground`,
  `codeBlockTheme`,
] as const

const BOOLEAN_SETTING_KEYS = [`isShowLineNumber`, `isMacCodeBlock`] as const

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ``
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, `-`).replace(/\//g, `_`).replace(/=+$/, ``)
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, `+`).replace(/_/g, `/`)
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** FNV-1a 32-bit checksum — enough to detect truncation / corruption in transit. */
function checksum(text: string): string {
  let hash = 0x811C9DC5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, `0`)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === `object` && value !== null && !Array.isArray(value)
}

function validateSettings(raw: unknown): Partial<PerThemeSettings> {
  if (raw === undefined)
    return {}
  if (!isPlainObject(raw))
    throw new ThemeShareError(`invalidContent`)

  const settings: Partial<PerThemeSettings> = {}
  for (const key of STRING_SETTING_KEYS) {
    const value = raw[key]
    if (value === undefined)
      continue
    if (typeof value !== `string` || value.length > 500) {
      throw new ThemeShareError(`invalidContent`)
    }(settings as Record<string, unknown>)[key] = value
  }
  for (const key of BOOLEAN_SETTING_KEYS) {
    const value = raw[key]
    if (value === undefined)
      continue
    if (typeof value !== `boolean`) {
      throw new ThemeShareError(`invalidContent`)
    }(settings as Record<string, unknown>)[key] = value
  }
  if (raw.headingStyles !== undefined) {
    if (!isPlainObject(raw.headingStyles))
      throw new ThemeShareError(`invalidContent`)
    const headingStyles: HeadingStyles = {}
    for (const level of HEADING_LEVELS) {
      const style = raw.headingStyles[level]
      if (style === undefined)
        continue
      if (!HEADING_STYLE_TYPES.includes(style as HeadingStyleType))
        throw new ThemeShareError(`invalidContent`)
      headingStyles[level] = style as HeadingStyleType
    }
    settings.headingStyles = headingStyles
  }
  return settings
}

function validateOptions(raw: unknown): ThemeSharePayload[`options`] {
  if (raw === undefined)
    return undefined
  if (!isPlainObject(raw))
    throw new ThemeShareError(`invalidContent`)

  const options: NonNullable<ThemeSharePayload[`options`]> = {}
  for (const key of [`isCiteStatus`, `isCountStatus`, `isUseIndent`, `isUseJustify`] as const) {
    const value = raw[key]
    if (value === undefined)
      continue
    if (typeof value !== `boolean`)
      throw new ThemeShareError(`invalidContent`)
    options[key] = value
  }
  if (raw.legend !== undefined) {
    if (typeof raw.legend !== `string` || raw.legend.length > 200)
      throw new ThemeShareError(`invalidContent`)
    options.legend = raw.legend
  }
  return options
}

export function encodeThemeShare(payload: ThemeSharePayload): string {
  const body = toBase64Url(JSON.stringify(payload))
  return `${SHARE_PREFIX}${body}.${checksum(body)}`
}

/** Decode and validate a share text. Throws ThemeShareError on any corruption. */
export function decodeThemeShare(text: string): ThemeSharePayload {
  const trimmed = text.trim()
  if (!trimmed)
    throw new ThemeShareError(`empty`)
  if (trimmed.length > MAX_SHARE_TEXT_LENGTH || !trimmed.startsWith(SHARE_PREFIX))
    throw new ThemeShareError(`invalidFormat`)

  const rest = trimmed.slice(SHARE_PREFIX.length)
  const dotIndex = rest.lastIndexOf(`.`)
  if (dotIndex <= 0 || dotIndex === rest.length - 1)
    throw new ThemeShareError(`invalidFormat`)

  const body = rest.slice(0, dotIndex)
  const digest = rest.slice(dotIndex + 1)
  if (!/^[0-9a-f]{8}$/.test(digest) || !/^[\w-]+$/.test(body))
    throw new ThemeShareError(`invalidFormat`)
  if (checksum(body) !== digest)
    throw new ThemeShareError(`checksum`)

  let raw: unknown
  try {
    raw = JSON.parse(fromBase64Url(body))
  }
  catch {
    throw new ThemeShareError(`invalidFormat`)
  }
  if (!isPlainObject(raw) || raw.version !== 1)
    throw new ThemeShareError(`invalidContent`)
  if (typeof raw.name !== `string` || !raw.name.trim() || raw.name.length > MAX_NAME_LENGTH)
    throw new ThemeShareError(`invalidContent`)
  if (typeof raw.css !== `string`)
    throw new ThemeShareError(`invalidContent`)

  return {
    version: 1,
    name: raw.name.trim(),
    css: raw.css,
    settings: validateSettings(raw.settings),
    options: validateOptions(raw.options),
  }
}
