import { uuidv4 } from '@md/shared/utils/uuid'
import { calculateImageHash, getUploadedImageMap, imageUploadCacheKey, useImageUploader } from '@/composables/useImageUploader'
import { t } from '@/i18n/translate'
import { store } from '@/storage'

export type UploadQueueItemStatus = `pending` | `uploading` | `success` | `failed` | `reused`

export interface UploadQueueItem {
  id: string
  name: string
  size: number
  status: UploadQueueItemStatus
  url?: string
  error?: string
  /** Link already inserted into the editor. */
  inserted?: boolean
  /** Batch-level duplicate of another item (same size + content hash). */
  duplicateOf?: string
  /** SHA-256 of the (possibly compressed) file content, used for dedupe. */
  hash?: string
}

async function compressImage(file: File): Promise<File> {
  const { default: imageCompression } = await import(`browser-image-compression`)
  return await imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
  })
}

/**
 * Sequential image upload queue. Items are uploaded one at a time; completed
 * links are handed to the registered insert handler in enqueue order once the
 * queue drains. Deduplicates by file size + content hash, reusing previously
 * uploaded links.
 */
export const useUploadQueueStore = defineStore(`uploadQueue`, () => {
  const items = ref<UploadQueueItem[]>([])
  /** Files kept in memory for upload / retry (not persisted). */
  const files = new Map<string, File>()

  let processing = false
  let insertHandler: ((urls: string[]) => void) | null = null

  const isActive = computed(() => items.value.some(item => item.status === `pending` || item.status === `uploading`))
  const doneCount = computed(() => items.value.filter(item => [`success`, `reused`].includes(item.status)).length)

  function registerInsertHandler(handler: (urls: string[]) => void) {
    insertHandler = handler
  }

  function unregisterInsertHandler() {
    insertHandler = null
  }

  /** Hand finished-but-not-yet-inserted links to the editor in enqueue order. */
  function flushInserted() {
    if (isActive.value || !insertHandler)
      return
    const ready = items.value.filter(item => !item.inserted && (item.status === `success` || item.status === `reused`) && item.url)
    if (!ready.length)
      return
    ready.forEach(item => (item.inserted = true))
    insertHandler(ready.map(item => item.url!))
  }

  async function processQueue() {
    if (processing)
      return
    processing = true
    try {
      const { upload } = useImageUploader()
      while (true) {
        const item = items.value.find(entry => entry.status === `pending`)
        if (!item)
          break

        // Batch-level duplicate: reuse the earlier item's link when available.
        if (item.duplicateOf) {
          const source = items.value.find(entry => entry.id === item.duplicateOf)
          if (source?.url) {
            item.status = `reused`
            item.url = source.url
            continue
          }
        }

        const file = files.get(item.id)
        if (!file) {
          item.status = `failed`
          item.error = t(`store.uploader.uploadFailed`)
          continue
        }

        item.status = `uploading`
        item.error = undefined
        try {
          const url = await upload(file)
          if (!url)
            throw new Error(t(`store.uploader.uploadFailed`))
          item.status = `success`
          item.url = url
        }
        catch (error) {
          item.status = `failed`
          item.error = error instanceof Error ? error.message : t(`store.uploader.uploadFailed`)
        }
      }
    }
    finally {
      processing = false
      flushInserted()
    }
  }

  async function enqueue(fileList: File[]) {
    if (!fileList.length)
      return

    const useCompression = (await store.get(`useCompression`)) === `true`
    const imgHost = (await store.get(`imgHost`)) || `default`
    const uploadedMap = await getUploadedImageMap()
    // Size + content hash of items already in this queue run.
    const batchKeys = new Map<string, string>()
    for (const existing of items.value) {
      if (existing.hash)
        batchKeys.set(`${existing.size}:${existing.hash}`, existing.id)
    }

    for (const rawFile of fileList) {
      let file = rawFile
      if (useCompression) {
        try {
          file = await compressImage(rawFile)
        }
        catch (error) {
          console.warn(`[uploadQueue] Compression failed, uploading original:`, error)
        }
      }

      const hash = await calculateImageHash(file)
      const batchKey = `${file.size}:${hash}`
      const item: UploadQueueItem = {
        id: uuidv4(),
        name: file.name || `image.png`,
        size: file.size,
        status: `pending`,
        hash,
      }

      const cachedUrl = uploadedMap[imageUploadCacheKey(imgHost, hash)]
      const duplicateId = batchKeys.get(batchKey)
      if (cachedUrl) {
        item.status = `reused`
        item.url = cachedUrl
      }
      else if (duplicateId) {
        item.duplicateOf = duplicateId
        files.set(item.id, file)
      }
      else {
        files.set(item.id, file)
        batchKeys.set(batchKey, item.id)
      }

      items.value.push(item)
    }

    void processQueue()
  }

  function retry(id: string) {
    const item = items.value.find(entry => entry.id === id)
    if (!item || item.status !== `failed`)
      return
    // A duplicate whose source failed uploads on its own now.
    item.duplicateOf = undefined
    item.status = `pending`
    item.error = undefined
    void processQueue()
  }

  function remove(id: string) {
    const index = items.value.findIndex(entry => entry.id === id)
    if (index === -1)
      return
    const [item] = items.value.splice(index, 1)
    files.delete(item.id)
  }

  /** Clear finished items; uploading/pending items keep running. */
  function clearFinished() {
    items.value = items.value.filter((item) => {
      if (item.status === `pending` || item.status === `uploading`)
        return true
      files.delete(item.id)
      return false
    })
  }

  return {
    items,
    isActive,
    doneCount,
    enqueue,
    retry,
    remove,
    clearFinished,
    registerInsertHandler,
    unregisterInsertHandler,
  }
})
