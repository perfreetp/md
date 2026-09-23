import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WATERMARK_OPTIONS,
  normalizeWatermarkOptions,
  resolveWatermarkPoint,
} from './watermark'

describe(`normalizeWatermarkOptions`, () => {
  it(`falls back to defaults for missing input`, () => {
    expect(normalizeWatermarkOptions(null)).toEqual(DEFAULT_WATERMARK_OPTIONS)
    expect(normalizeWatermarkOptions({})).toEqual(DEFAULT_WATERMARK_OPTIONS)
  })

  it(`keeps valid values`, () => {
    expect(normalizeWatermarkOptions({ text: `demo`, position: `center`, opacity: 0.5 }))
      .toEqual({ text: `demo`, position: `center`, opacity: 0.5 })
  })

  it(`rejects unknown positions and clamps opacity`, () => {
    const result = normalizeWatermarkOptions({ position: `nowhere` as any, opacity: 5 })
    expect(result.position).toBe(DEFAULT_WATERMARK_OPTIONS.position)
    expect(result.opacity).toBe(1)
  })
})

describe(`resolveWatermarkPoint`, () => {
  const w = 1000
  const h = 500
  const textWidth = 200
  const fontSize = 20
  const margin = 30

  it(`places the watermark in each corner with the margin applied`, () => {
    expect(resolveWatermarkPoint(w, h, textWidth, fontSize, `top-left`, margin))
      .toEqual({ x: 30, y: 50 })
    expect(resolveWatermarkPoint(w, h, textWidth, fontSize, `top-right`, margin))
      .toEqual({ x: 770, y: 50 })
    expect(resolveWatermarkPoint(w, h, textWidth, fontSize, `bottom-left`, margin))
      .toEqual({ x: 30, y: 470 })
    expect(resolveWatermarkPoint(w, h, textWidth, fontSize, `bottom-right`, margin))
      .toEqual({ x: 770, y: 470 })
  })

  it(`centers the watermark`, () => {
    expect(resolveWatermarkPoint(w, h, textWidth, fontSize, `center`, margin))
      .toEqual({ x: 400, y: 260 })
  })
})
