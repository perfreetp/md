import { describe, expect, it } from 'vitest'
import { decodeThemeShare, encodeThemeShare, THEME_SHARE_PREFIX } from './theme-share'

const samplePayload = {
  v: 1 as const,
  name: `我的主题`,
  css: `#output h1 { color: red; }`,
  settings: {
    primaryColor: `#ff0000`,
    fontSize: `16px`,
    isMacCodeBlock: false,
    legend: `alt`,
    headingStyles: { h1: `border-bottom` as const },
  },
}

describe(`theme-share codec`, () => {
  it(`round-trips a payload`, () => {
    const text = encodeThemeShare(samplePayload)
    expect(text.startsWith(`${THEME_SHARE_PREFIX}.`)).toBe(true)
    const result = decodeThemeShare(text)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.name).toBe(samplePayload.name)
      expect(result.payload.css).toBe(samplePayload.css)
      expect(result.payload.settings?.primaryColor).toBe(`#ff0000`)
    }
  })

  it(`rejects empty input`, () => {
    expect(decodeThemeShare(``)).toEqual({ ok: false, error: `empty` })
    expect(decodeThemeShare(`   `)).toEqual({ ok: false, error: `empty` })
  })

  it(`rejects malformed text`, () => {
    expect(decodeThemeShare(`hello world`)).toEqual({ ok: false, error: `badFormat` })
    expect(decodeThemeShare(`MDTHEME2.abc.12345678`)).toEqual({ ok: false, error: `badFormat` })
  })

  it(`rejects corrupted payloads via checksum`, () => {
    const text = encodeThemeShare(samplePayload)
    const parts = text.split(`.`)
    // Flip a character in the body
    const body = parts[1]
    const flipped = `${body.slice(0, 4)}${body[4] === `a` ? `b` : `a`}${body.slice(5)}`
    const result = decodeThemeShare([parts[0], flipped, parts[2]].join(`.`))
    expect(result).toEqual({ ok: false, error: `badChecksum` })
  })

  it(`rejects invalid payload schema`, () => {
    const body = btoa(JSON.stringify({ v: 1, name: ``, css: 123 }))
      .replace(/\+/g, `-`)
      .replace(/\//g, `_`)
      .replace(/=+$/, ``)
    // Compute a valid checksum for the invalid payload so schema validation runs
    const text = encodeThemeShare({ v: 1, name: `x`, css: `` })
    void text
    let hash = 0x811C9DC5
    for (let i = 0; i < body.length; i++) {
      hash ^= body.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    const checksum = (hash >>> 0).toString(16).padStart(8, `0`)
    const result = decodeThemeShare(`${THEME_SHARE_PREFIX}.${body}.${checksum}`)
    expect(result).toEqual({ ok: false, error: `badPayload` })
  })

  it(`rejects settings with wrong types`, () => {
    const text = encodeThemeShare({
      v: 1,
      name: `x`,
      css: ``,
      // @ts-expect-error intentionally wrong type
      settings: { fontSize: 16 },
    })
    expect(decodeThemeShare(text)).toEqual({ ok: false, error: `badPayload` })
  })
})
