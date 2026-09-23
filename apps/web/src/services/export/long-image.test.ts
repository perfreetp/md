import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LONG_IMAGE_EXPORT_OPTIONS,
  deviceWidthOf,
  normalizeLongImageExportOptions,
} from './long-image'

describe(`deviceWidthOf`, () => {
  it(`maps each device to its preset width`, () => {
    expect(deviceWidthOf(`mobile`)).toBe(375)
    expect(deviceWidthOf(`tablet`)).toBe(768)
    expect(deviceWidthOf(`desktop`)).toBe(1024)
  })
})

describe(`normalizeLongImageExportOptions`, () => {
  it(`falls back to defaults for missing input`, () => {
    expect(normalizeLongImageExportOptions(null)).toEqual(DEFAULT_LONG_IMAGE_EXPORT_OPTIONS)
  })

  it(`keeps valid values`, () => {
    const result = normalizeLongImageExportOptions({
      device: `tablet`,
      mode: `segments`,
      segmentHeight: 2000,
      watermark: { text: `demo`, position: `tile`, opacity: 0.5 },
    })
    expect(result.device).toBe(`tablet`)
    expect(result.mode).toBe(`segments`)
    expect(result.segmentHeight).toBe(2000)
    expect(result.watermark.text).toBe(`demo`)
  })

  it(`rejects unknown devices and absurd segment heights`, () => {
    const result = normalizeLongImageExportOptions({
      device: `watch` as any,
      segmentHeight: 10,
    })
    expect(result.device).toBe(DEFAULT_LONG_IMAGE_EXPORT_OPTIONS.device)
    expect(result.segmentHeight).toBe(DEFAULT_LONG_IMAGE_EXPORT_OPTIONS.segmentHeight)
  })
})
