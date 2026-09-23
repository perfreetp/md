import { stripUnresolvedAsyncPlaceholders } from '@/lib/preview/preview-ready'
import {
  applyExportLayout,
  getPngCaptureBackgroundColor,
  getPngCaptureStyles,
  PNG_CAPTURE_ROOT_CLASS,
} from './apply-export-layout'

export type PreviewDevice = `desktop` | `tablet` | `mobile`

/** Simulated device widths in CSS pixels, used by both preview and export. */
export const PREVIEW_DEVICE_WIDTHS: Record<PreviewDevice, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1080,
}

export type WatermarkPosition = `topLeft` | `topRight` | `center` | `bottomLeft` | `bottomRight`

export interface WatermarkOptions {
  enabled: boolean
  text: string
  position: WatermarkPosition
  /** 0–1 */
  opacity: number
}

export interface OffScreenPreview {
  /** The `.preview` shell handed to html-to-image; includes the export padding. */
  el: HTMLElement
  /** The cloned `#output` root. Its direct children are the atomic content blocks. */
  content: HTMLElement
  cleanup: () => void
}

const WATERMARK_POSITION_STYLES: Record<WatermarkPosition, string> = {
  topLeft: `top:16px;left:16px;`,
  topRight: `top:16px;right:16px;`,
  center: `top:50%;left:50%;transform:translate(-50%,-50%);`,
  bottomLeft: `bottom:16px;left:16px;`,
  bottomRight: `bottom:16px;right:16px;`,
}

function clampOpacity(value: number): number {
  if (Number.isNaN(value))
    return 0.3
  return Math.min(1, Math.max(0.05, value))
}

/** Overlay a text watermark on the capture shell so it appears in every segment. */
function applyWatermark(preview: HTMLElement, watermark: WatermarkOptions) {
  const text = watermark.text.trim()
  if (!watermark.enabled || !text)
    return

  preview.style.position = `relative`

  const overlay = document.createElement(`div`)
  overlay.setAttribute(`data-png-watermark`, ``)
  overlay.style.cssText = `position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:10;`

  const label = document.createElement(`div`)
  label.textContent = text
  label.style.cssText = `position:absolute;${WATERMARK_POSITION_STYLES[watermark.position]}opacity:${clampOpacity(watermark.opacity)};font-size:14px;line-height:1.4;color:#888;white-space:nowrap;`

  overlay.appendChild(label)
  preview.appendChild(overlay)
}

/**
 * Clone the live preview into a fixed-width off-screen host.
 *
 * Capturing a clone rather than the live preview keeps the on-screen editor
 * untouched while the export rewrites scroll containers and drops unresolved
 * async placeholders.
 */
export async function createOffScreenPreview(
  previewDevice: PreviewDevice,
  watermark?: WatermarkOptions,
): Promise<OffScreenPreview | null> {
  const output = document.getElementById(`output`)
  if (!output)
    return null

  const isDarkApp = document.documentElement.classList.contains(`dark`)
  const useNightPreview = isDarkApp
    && document.getElementById(`output-wrapper`)?.classList.contains(`output_night`)
  const width = `${PREVIEW_DEVICE_WIDTHS[previewDevice]}px`

  const host = document.createElement(`div`)
  host.setAttribute(`data-png-export-host`, ``)
  host.style.cssText = `position:fixed;left:-99999px;top:0;z-index:-1;visibility:visible;pointer-events:none;`
  host.innerHTML = await getPngCaptureStyles()

  const wrapper = document.createElement(`div`)
  wrapper.className = useNightPreview ? `output_night` : ``
  wrapper.style.width = width

  const preview = document.createElement(`div`)
  preview.className = `preview border-x shadow-xl mx-auto`
  preview.style.width = width
  preview.style.margin = `0`

  const content = output.cloneNode(true) as HTMLElement
  content.removeAttribute(`id`)
  content.classList.add(PNG_CAPTURE_ROOT_CLASS)
  content.style.width = `100%`
  content.querySelectorAll(`.diagram-download-bar`).forEach(el => el.remove())
  stripUnresolvedAsyncPlaceholders(content)
  applyExportLayout(content)

  preview.appendChild(content)
  wrapper.appendChild(preview)
  host.appendChild(wrapper)
  document.body.appendChild(host)

  if (watermark)
    applyWatermark(preview, watermark)

  return {
    el: preview,
    content,
    cleanup: () => host.remove(),
  }
}

export function getPngCaptureOptions() {
  return {
    backgroundColor: getPngCaptureBackgroundColor(),
    skipFonts: true,
    pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
    style: { margin: `0` },
  }
}
