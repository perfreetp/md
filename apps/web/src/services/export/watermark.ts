/** Text watermark drawing for long-image exports. */

export type WatermarkPosition
  = | `top-left`
    | `top-right`
    | `bottom-left`
    | `bottom-right`
    | `center`
    | `tile`

export interface WatermarkOptions {
  text: string
  position: WatermarkPosition
  /** 0–1 */
  opacity: number
}

export const DEFAULT_WATERMARK_OPTIONS: WatermarkOptions = {
  text: ``,
  position: `bottom-right`,
  opacity: 0.3,
}

export const WATERMARK_POSITIONS: WatermarkPosition[] = [
  `top-left`,
  `top-right`,
  `bottom-left`,
  `bottom-right`,
  `center`,
  `tile`,
]

export function normalizeWatermarkOptions(raw?: Partial<WatermarkOptions> | null): WatermarkOptions {
  const position = raw?.position && WATERMARK_POSITIONS.includes(raw.position)
    ? raw.position
    : DEFAULT_WATERMARK_OPTIONS.position
  const opacity = typeof raw?.opacity === `number` && Number.isFinite(raw.opacity)
    ? Math.min(1, Math.max(0.05, raw.opacity))
    : DEFAULT_WATERMARK_OPTIONS.opacity
  return {
    text: typeof raw?.text === `string` ? raw.text : ``,
    position,
    opacity,
  }
}

export interface WatermarkPoint {
  x: number
  y: number
}

/**
 * Anchor point of a single (non-tiled) watermark, in canvas pixels.
 * Kept DOM-free so it can be unit-tested.
 */
export function resolveWatermarkPoint(
  canvasWidth: number,
  canvasHeight: number,
  textWidth: number,
  fontSize: number,
  position: Exclude<WatermarkPosition, `tile`>,
  margin: number,
): WatermarkPoint {
  switch (position) {
    case `top-left`:
      return { x: margin, y: margin + fontSize }
    case `top-right`:
      return { x: canvasWidth - margin - textWidth, y: margin + fontSize }
    case `bottom-left`:
      return { x: margin, y: canvasHeight - margin }
    case `bottom-right`:
      return { x: canvasWidth - margin - textWidth, y: canvasHeight - margin }
    case `center`:
      return { x: (canvasWidth - textWidth) / 2, y: (canvasHeight + fontSize) / 2 }
  }
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (error) => {
      URL.revokeObjectURL(url)
      reject(error)
    }
    img.src = url
  })
}

function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, options: WatermarkOptions) {
  const fontSize = Math.max(16, Math.round(width / 32))
  ctx.font = `${fontSize}px sans-serif`
  ctx.globalAlpha = options.opacity
  // A mid-gray stays readable on both light and dark article backgrounds.
  ctx.fillStyle = `#808080`

  if (options.position === `tile`) {
    const textWidth = ctx.measureText(options.text).width
    const gapX = textWidth + fontSize * 4
    const gapY = fontSize * 6
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.rotate(-Math.PI / 6)
    ctx.translate(-width / 2, -height / 2)
    for (let y = -height; y < height * 2; y += gapY) {
      for (let x = -width; x < width * 2; x += gapX)
        ctx.fillText(options.text, x, y)
    }
    ctx.restore()
  }
  else {
    const margin = Math.round(fontSize * 1.5)
    const textWidth = ctx.measureText(options.text).width
    const point = resolveWatermarkPoint(width, height, textWidth, fontSize, options.position, margin)
    ctx.fillText(options.text, point.x, point.y)
  }

  ctx.globalAlpha = 1
}

/**
 * Draw the watermark onto an image blob. Returns the original blob when the
 * watermark text is empty so callers can apply it unconditionally.
 */
export async function applyWatermarkToBlob(blob: Blob, options: WatermarkOptions): Promise<Blob> {
  const text = options.text.trim()
  if (!text)
    return blob

  const img = await loadImage(blob)
  const canvas = document.createElement(`canvas`)
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext(`2d`)
  if (!ctx)
    return blob

  ctx.drawImage(img, 0, 0)
  drawWatermark(ctx, canvas.width, canvas.height, { ...options, text })

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result)
        resolve(result)
      else
        reject(new Error(`Failed to encode watermarked image`))
    }, `image/png`)
  })
}
