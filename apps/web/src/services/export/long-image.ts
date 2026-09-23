import type { WatermarkOptions } from './watermark'
import { delay } from '@/lib/delay'
import { waitForPreviewReady } from '@/lib/preview/preview-ready'
import { createOffScreenPreview, getPngCaptureOptions } from './png-capture'
import { captureSegmentBlobs } from './png-segments'
import { applyWatermarkToBlob } from './watermark'

/** Simulated device widths (CSS pixels) offered by the long-image export. */
export const LONG_IMAGE_DEVICES = [
  { id: `mobile`, width: 375 },
  { id: `tablet`, width: 768 },
  { id: `desktop`, width: 1024 },
] as const

export type LongImageDeviceId = typeof LONG_IMAGE_DEVICES[number][`id`]

export type LongImageExportMode = `single` | `segments`

export interface LongImageExportOptions {
  device: LongImageDeviceId
  mode: LongImageExportMode
  /** Soft ceiling per segment in CSS pixels; only used in `segments` mode. */
  segmentHeight: number
  watermark: WatermarkOptions
}

export const DEFAULT_LONG_IMAGE_EXPORT_OPTIONS: LongImageExportOptions = {
  device: `mobile`,
  mode: `single`,
  segmentHeight: 4000,
  watermark: {
    text: ``,
    position: `bottom-right`,
    opacity: 0.3,
  },
}

export function deviceWidthOf(device: LongImageDeviceId): number {
  return LONG_IMAGE_DEVICES.find(d => d.id === device)?.width ?? LONG_IMAGE_DEVICES[0].width
}

export function normalizeLongImageExportOptions(raw?: Partial<LongImageExportOptions> | null): LongImageExportOptions {
  const device = LONG_IMAGE_DEVICES.some(d => d.id === raw?.device)
    ? raw!.device as LongImageDeviceId
    : DEFAULT_LONG_IMAGE_EXPORT_OPTIONS.device
  const mode = raw?.mode === `segments` ? `segments` : `single`
  const segmentHeight = typeof raw?.segmentHeight === `number` && raw.segmentHeight >= 500
    ? raw.segmentHeight
    : DEFAULT_LONG_IMAGE_EXPORT_OPTIONS.segmentHeight
  const watermark = raw?.watermark
    ? { ...DEFAULT_LONG_IMAGE_EXPORT_OPTIONS.watermark, ...raw.watermark }
    : { ...DEFAULT_LONG_IMAGE_EXPORT_OPTIONS.watermark }
  return { device, mode, segmentHeight, watermark }
}

export interface CaptureLongImageOptions {
  width: number
  mode: LongImageExportMode
  segmentHeight: number
  watermark: WatermarkOptions
  onProgress?: (done: number, total: number) => void
}

/**
 * Capture the current preview as PNG blobs at the given width, applying the
 * watermark to every image. Returns one blob in `single` mode.
 */
export async function captureLongImage(options: CaptureLongImageOptions): Promise<Blob[]> {
  await waitForPreviewReady()

  const offScreen = await createOffScreenPreview(`mobile`, options.width)
  if (!offScreen)
    return []

  try {
    await delay(100)

    let blobs: Blob[]
    if (options.mode === `segments`) {
      blobs = await captureSegmentBlobs(offScreen, options.segmentHeight, options.onProgress)
    }
    else {
      const { toBlob } = await import(`html-to-image`)
      const blob = await toBlob(offScreen.el, getPngCaptureOptions())
      blobs = blob ? [blob] : []
      options.onProgress?.(1, 1)
    }

    if (options.watermark.text.trim())
      blobs = await Promise.all(blobs.map(blob => applyWatermarkToBlob(blob, options.watermark)))

    return blobs
  }
  finally {
    offScreen.cleanup()
  }
}
