import type { LongImageExportOptions, PdfExportOptions } from '@/services/export'
import { sanitizeTitle } from '@md/shared/utils/basicHelpers'
import { downloadFile } from '@md/shared/utils/fileHelpers'
import { uuidv4 } from '@md/shared/utils/uuid'
import { t } from '@/i18n/translate'
import {
  blobToDataUrl,
  captureLongImage,
  createSegmentsZip,
  DEFAULT_PNG_SEGMENT_HEIGHT,
  deviceWidthOf,
  downloadMD,
  exportHTML,
  exportPDF,
  exportPNG,
  exportPNGSegments,
  exportPureHTML,
  getHtmlContent,
} from '@/services/export'
import { useExportHistoryStore } from './exportHistory'
import { usePostStore } from './post'
import { useUIStore } from './ui'

/** Export helpers: HTML, PDF, Markdown, card image, etc. */
export const useExportStore = defineStore(`export`, () => {
  const postStore = usePostStore()
  const uiStore = useUIStore()

  const editorContent2HTML = () => getHtmlContent()

  const exportEditorContent2HTML = async () => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    await exportHTML(currentPost.title)
  }

  const exportEditorContent2PureHTML = (content: string) => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    exportPureHTML(content, currentPost.title)
  }

  const downloadAsCardImage = async () => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    await exportPNG(currentPost.title, {
      previewDevice: uiStore.previewDevice,
    })
  }

  const downloadAsSegmentedImages = async (maxSegmentHeight = DEFAULT_PNG_SEGMENT_HEIGHT) => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    const toastId = toast.loading(t(`store.png.segmentsStart`))
    try {
      const count = await exportPNGSegments(currentPost.title, {
        previewDevice: uiStore.previewDevice,
        maxSegmentHeight,
        onProgress: (done, total) => {
          toast.loading(t(`store.png.segmentsProgress`, { done, total }), { id: toastId })
        },
      })

      if (count === 0)
        toast.error(t(`store.png.segmentsEmpty`), { id: toastId })
      else
        toast.success(t(`store.png.segmentsDone`, { count }), { id: toastId })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(t(`store.png.segmentsFailed`, { message }), { id: toastId })
    }
  }

  const exportEditorContent2PDF = async (options?: Partial<PdfExportOptions>) => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    await exportPDF(currentPost.title, options)
  }

  const exportEditorContent2MD = (content: string) => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    downloadMD(content, currentPost.title)
  }

  /**
   * Long-image export from the dedicated dialog: captures at the configured
   * device width, applies the watermark, downloads, and keeps a history record.
   */
  const exportLongImage = async (options: LongImageExportOptions) => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    const toastId = toast.loading(t(`longImageExport.progressPreparing`))
    try {
      const width = deviceWidthOf(options.device)
      const blobs = await captureLongImage({
        width,
        mode: options.mode,
        segmentHeight: options.segmentHeight,
        watermark: options.watermark,
        onProgress: (done, total) => {
          toast.loading(t(`longImageExport.progress`, { done, total }), { id: toastId })
        },
      })

      if (blobs.length === 0) {
        toast.error(t(`longImageExport.empty`), { id: toastId })
        return
      }

      const baseName = sanitizeTitle(currentPost.title)
      const isZip = blobs.length > 1
      const artifact = isZip ? await createSegmentsZip(blobs, baseName) : blobs[0]
      const fileName = isZip ? `${baseName}.zip` : `${baseName}.png`

      const url = URL.createObjectURL(artifact)
      try {
        downloadFile(url, fileName, artifact.type)
      }
      finally {
        URL.revokeObjectURL(url)
      }

      const historyStore = useExportHistoryStore()
      await historyStore.ensureLoaded()
      await historyStore.addRecord(
        {
          id: uuidv4(),
          title: currentPost.title,
          createdAt: Date.now(),
          device: options.device,
          width,
          mode: options.mode,
          count: blobs.length,
          fileName,
          mime: artifact.type,
        },
        {
          previewDataUrl: await blobToDataUrl(blobs[0]),
          fileDataUrl: await blobToDataUrl(artifact),
        },
      )

      toast.success(t(`longImageExport.done`, { count: blobs.length }), { id: toastId })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(t(`longImageExport.failed`, { message }), { id: toastId })
    }
  }

  return {
    editorContent2HTML,
    exportEditorContent2HTML,
    exportEditorContent2PureHTML,
    downloadAsCardImage,
    downloadAsSegmentedImages,
    exportEditorContent2PDF,
    exportEditorContent2MD,
    exportLongImage,
  }
})
