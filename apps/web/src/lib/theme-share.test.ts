import { describe, expect, it } from 'vitest'
import { decodeThemeShare, encodeThemeShare, ThemeShareError } from '@/lib/theme-share'

function makePayload() {
  return {
    version: 1 as const,
    name: `我的主题`,
    css: `#output h1 { color: red; }`,
    settings: {
      primaryColor: `#0f4c81`,
      fontSize: `16px`,
      isMacCodeBlock: true,
      headingStyles: { h1: `border-left` as const },
    },
    options: {
      isCiteStatus: true,
      isUseIndent: false,
      legend: `alt`,
    },
  }
}

describe(`theme-share codec`, () => {
  it(`round-trips a full payload`, () => {
    const payload = makePayload()
    const decoded = decodeThemeShare(encodeThemeShare(payload))
    expect(decoded).toEqual(payload)
  })

  it(`round-trips a minimal payload`, () => {
    const payload = { version: 1 as const, name: `simple`, css: `` }
    expect(decodeThemeShare(encodeThemeShare(payload))).toEqual({
      ...payload,
      settings: {},
      options: undefined,
    })
  })

  it(`rejects empty input`, () => {
    expect(() => decodeThemeShare(`   `)).toThrowError(ThemeShareError)
    expect(() => decodeThemeShare(``)).toThrowError(expect.objectContaining({ reason: `empty` }))
  })

  it(`rejects text without the prefix`, () => {
    expect(() => decodeThemeShare(`hello world`)).toThrowError(
      expect.objectContaining({ reason: `invalidFormat` }),
    )
  })

  it(`rejects corrupted payload (checksum mismatch)`, () => {
    const text = encodeThemeShare(makePayload())
    const flipped = `${text.slice(0, 20)}${text[20] === `a` ? `b` : `a`}${text.slice(21)}`
    expect(() => decodeThemeShare(flipped)).toThrowError(
      expect.objectContaining({ reason: `checksum` }),
    )
  })

  it(`rejects truncated share text`, () => {
    const text = encodeThemeShare(makePayload())
    expect(() => decodeThemeShare(text.slice(0, -3))).toThrowError(ThemeShareError)
  })

  it(`rejects payloads with illegal field types`, () => {
    const payload = { ...makePayload(), settings: { primaryColor: 123 } }
    const bytes = new TextEncoder().encode(JSON.stringify(payload))
    let binary = ``
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const body = btoa(binary).replace(/\+/g, `-`).replace(/\//g, `_`).replace(/=+$/, ``)
    // Recompute a valid checksum so validation reaches the schema check.
    let hash = 0x811C9DC5
    for (let i = 0; i < body.length; i++) {
      hash ^= body.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    const digest = (hash >>> 0).toString(16).padStart(8, `0`)
    expect(() => decodeThemeShare(`MDTHEME1.${body}.${digest}`)).toThrowError(
      expect.objectContaining({ reason: `invalidContent` }),
    )
  })

  it(`rejects unknown heading style values`, () => {
    const payload = { ...makePayload(), settings: { headingStyles: { h1: `rainbow` } } }
    const encoded = encodeThemeShare(payload as never)
    expect(() => decodeThemeShare(encoded)).toThrowError(
      expect.objectContaining({ reason: `invalidContent` }),
    )
  })

  it(`strips unknown extra fields instead of failing`, () => {
    const payload = { ...makePayload(), hacker: `alert(1)` }
    const decoded = decodeThemeShare(encodeThemeShare(payload as never))
    expect((decoded as unknown as Record<string, unknown>).hacker).toBeUndefined()
  })
})
