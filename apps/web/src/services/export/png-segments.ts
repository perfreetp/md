import type { PreviewDevice, WatermarkOptions } from './png-capture'
import { sanitizeTitle } from '@md/shared/utils/basicHelpers'
import { downloadFile } from '@md/shared/utils/fileHelpers'
import { delay } from '@/lib/delay'
import { waitForPreviewReady } from '@/lib/preview/preview-ready'
import { createOffScreenPreview, getPngCaptureOptions } from './png-capture'

/** Presets offered in the export menu, in CSS pixels. */
export const PNG_SEGMENT_HEIGHTS = [2000, 4000, 6000, 8000] as const

export const DEFAULT_PNG_SEGMENT_HEIGHT = 4000

export interface BlockBounds {
  top: number
  bottom: number
}

export interface ExportPNGSegmentsOptions {
  previewDevice: PreviewDevice
  /** Soft ceiling in CSS pixels; a single block taller than this is not split. */
  maxSegmentHeight: number
  watermark?: WatermarkOptions
  onProgress?: (done: number, total: number) => void
}

export interface ExportPNGSegmentsResult {
  count: number
  /** Data URL of the downloaded file (single PNG or zip), for export records. */
  dataUrl: string | null
  kind: `png` | `zip`
}

/**
 * Group block indices into segments that stay under `maxSegmentHeight`.
 *
 * Bounds are absolute viewport offsets, so a segment's height is measured from
 * the first block's top to the last block's bottom. That accounts for the
 * margins between blocks, which summing `offsetHeight` would miss.
 *
 * Kept free of DOM access so it can be tested without a layout engine.
 */
export function planSegments(bounds: BlockBounds[], maxSegmentHeight: number): number[][] {
  if (bounds.length === 0)
    return []

  const segments: number[][] = []
  let current: number[] = []
  let segmentTop = bounds[0].top

  for (let i = 0; i < bounds.length; i++) {
    const wouldOverflow = bounds[i].bottom - segmentTop > maxSegmentHeight

    // A block taller than the ceiling on its own still gets a whole segment:
    // splitting it is exactly what this export exists to avoid.
    if (wouldOverflow && current.length > 0) {
      segments.push(current)
      current = []
      segmentTop = bounds[i].top
    }

    current.push(i)
  }

  if (current.length > 0)
    segments.push(current)

  return segments
}

function measureBlocks(blocks: HTMLElement[]): BlockBounds[] {
  return blocks.map((block) => {
    const rect = block.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  })
}

/**
 * Descend past wrapper elements to the level whose children are the article's
 * blocks.
 *
 * The renderer wraps the whole document in a single `<section>`, so the clone's
 * own children are one wrapper rather than the headings and paragraphs we want
 * to split on.
 */
function resolveBlockContainer(root: HTMLElement): HTMLElement {
  let container = root
  while (container.children.length === 1) {
    const child = container.firstElementChild as HTMLElement
    if (child.tagName !== `SECTION` && child.tagName !== `DIV`)
      break
    container = child
  }
  return container
}

/**
 * Blocks that can be hidden per segment, in document order.
 *
 * `<style>` tags and other non-rendered children are left out: they carry the
 * theme CSS for every segment and must never be touched.
 */
function collectBlocks(container: HTMLElement): HTMLElement[] {
  return (Array.from(container.children) as HTMLElement[]).filter((child) => {
    const rect = child.getBoundingClientRect()
    return rect.width > 0 || rect.height > 0
  })
}

async function downloadSegmentsAsZip(segments: Blob[], baseName: string): Promise<string> {
  const { zip } = await import(`fflate`)

  const files: Record<string, Uint8Array> = {}
  const pad = String(segments.length).length
  for (let i = 0; i < segments.length; i++) {
    const index = String(i + 1).padStart(pad, `0`)
    files[`${baseName}-${index}.png`] = new Uint8Array(await segments[i].arrayBuffer())
  }

  const archive = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) =>
    zip(files, (err, out) => (err ? reject(err) : resolve(out as Uint8Array<ArrayBuffer>))))

  const url = URL.createObjectURL(new Blob([archive], { type: `application/zip` }))
  try {
    downloadFile(url, `${baseName}.zip`, `application/zip`)
  }
  finally {
    URL.revokeObjectURL(url)
  }
  return blobToDataUrl(new Blob([archive], { type: `application/zip` }))
}

function downloadSingleSegment(segment: Blob, baseName: string): Promise<string> {
  const url = URL.createObjectURL(segment)
  try {
    downloadFile(url, `${baseName}.png`, `image/png`)
  }
  finally {
    URL.revokeObjectURL(url)
  }
  return blobToDataUrl(segment)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Export the preview as several PNGs split on block boundaries.
 *
 * Each segment is captured separately rather than slicing one tall canvas,
 * because a full-length capture is what hits the browser's canvas size limit on
 * long articles — the very case this export is for.
 *
 * @returns the images produced and the downloaded file, or 0 count if empty.
 */
export async function exportPNGSegments(
  title: string = `untitled`,
  options: ExportPNGSegmentsOptions,
): Promise<ExportPNGSegmentsResult> {
  await waitForPreviewReady()

  const offScreen = await createOffScreenPreview(options.previewDevice, options.watermark)
  if (!offScreen)
    return { count: 0, dataUrl: null, kind: `png` }

  try {
    await delay(100)

    const blocks = collectBlocks(resolveBlockContainer(offScreen.content))
    if (blocks.length === 0)
      return { count: 0, dataUrl: null, kind: `png` }

    const segments = planSegments(measureBlocks(blocks), options.maxSegmentHeight)
    const captureOptions = getPngCaptureOptions()
    const { toBlob } = await import(`html-to-image`)

    // Inline display values come from the renderer (code blocks use flex), so
    // the originals are restored rather than cleared.
    const originalDisplay = blocks.map(block => block.style.display)
    const images: Blob[] = []

    try {
      for (let i = 0; i < segments.length; i++) {
        const visible = new Set(segments[i])
        blocks.forEach((block, index) => {
          block.style.display = visible.has(index) ? originalDisplay[index] : `none`
        })

        const blob = await toBlob(offScreen.el, captureOptions)
        if (blob)
          images.push(blob)

        options.onProgress?.(i + 1, segments.length)
      }
    }
    finally {
      blocks.forEach((block, index) => {
        block.style.display = originalDisplay[index]
      })
    }

    if (images.length === 0)
      return { count: 0, dataUrl: null, kind: `png` }

    const baseName = sanitizeTitle(title)
    if (images.length === 1)
      return { count: 1, dataUrl: await downloadSingleSegment(images[0], baseName), kind: `png` }

    return { count: images.length, dataUrl: await downloadSegmentsAsZip(images, baseName), kind: `zip` }
  }
  finally {
    offScreen.cleanup()
  }
}
