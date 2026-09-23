import type { PdfExportOptions, PreviewDevice, WatermarkOptions } from '@/services/export'
import { sanitizeTitle } from '@md/shared/utils/basicHelpers'
import { downloadFile } from '@md/shared/utils/fileHelpers'
import { uuidv4 } from '@md/shared/utils/uuid'
import { t } from '@/i18n/translate'
import {
  DEFAULT_PNG_SEGMENT_HEIGHT,
  downloadMD,
  exportHTML,
  exportPDF,
  exportPNG,
  exportPNGSegments,
  exportPureHTML,
  getHtmlContent,
} from '@/services/export'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { usePostStore } from './post'
import { useUIStore } from './ui'

/** A finished long-image export kept for preview / re-download. */
export interface ExportRecord {
  id: string
  title: string
  createdAt: number
  kind: `png` | `zip`
  device: PreviewDevice
  /** Data URL of the exported file. */
  dataUrl: string
}

const MAX_EXPORT_RECORDS = 6
/** Skip persisting records whose data URL is huge to protect storage quota. */
const MAX_RECORD_DATA_URL_LENGTH = 12_000_000

/** Export helpers: HTML, PDF, Markdown, card image, etc. */
export const useExportStore = defineStore(`export`, () => {
  const postStore = usePostStore()
  const uiStore = useUIStore()

  const editorContent2HTML = () => getHtmlContent()

  const exportRecords = store.reactive<ExportRecord[]>(addPrefix(`png_export_records`), [])

  function addExportRecord(record: Omit<ExportRecord, `id` | `createdAt`>) {
    if (!record.dataUrl || record.dataUrl.length > MAX_RECORD_DATA_URL_LENGTH)
      return
    exportRecords.value = [
      { ...record, id: uuidv4(), createdAt: Date.now() },
      ...exportRecords.value,
    ].slice(0, MAX_EXPORT_RECORDS)
  }

  function removeExportRecord(id: string) {
    exportRecords.value = exportRecords.value.filter(record => record.id !== id)
  }

  function downloadExportRecord(record: ExportRecord) {
    const mime = record.kind === `zip` ? `application/zip` : `image/png`
    downloadFile(record.dataUrl, `${sanitizeTitle(record.title)}.${record.kind}`, mime)
  }

  function currentWatermarkOptions(): WatermarkOptions {
    const options = uiStore.pngExportOptions
    return {
      enabled: options.watermarkEnabled,
      text: options.watermarkText,
      position: options.watermarkPosition,
      opacity: options.watermarkOpacity,
    }
  }

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

    const device = uiStore.pngExportOptions.device ?? uiStore.previewDevice
    const dataUrl = await exportPNG(currentPost.title, {
      previewDevice: device,
      watermark: currentWatermarkOptions(),
    })
    if (dataUrl) {
      addExportRecord({
        title: currentPost.title,
        kind: `png`,
        device,
        dataUrl,
      })
    }
  }

  const downloadAsSegmentedImages = async (maxSegmentHeight = DEFAULT_PNG_SEGMENT_HEIGHT) => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    const device = uiStore.pngExportOptions.device ?? uiStore.previewDevice
    const toastId = toast.loading(t(`store.png.segmentsStart`))
    try {
      const { count, dataUrl, kind } = await exportPNGSegments(currentPost.title, {
        previewDevice: device,
        maxSegmentHeight,
        watermark: currentWatermarkOptions(),
        onProgress: (done, total) => {
          toast.loading(t(`store.png.segmentsProgress`, { done, total }), { id: toastId })
        },
      })

      if (count === 0) {
        toast.error(t(`store.png.segmentsEmpty`), { id: toastId })
      }
      else {
        toast.success(t(`store.png.segmentsDone`, { count }), { id: toastId })
        if (dataUrl) {
          addExportRecord({
            title: currentPost.title,
            kind,
            device,
            dataUrl,
          })
        }
      }
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

  return {
    editorContent2HTML,
    exportEditorContent2HTML,
    exportEditorContent2PureHTML,
    downloadAsCardImage,
    downloadAsSegmentedImages,
    exportEditorContent2PDF,
    exportEditorContent2MD,
    exportRecords,
    addExportRecord,
    removeExportRecord,
    downloadExportRecord,
  }
})
