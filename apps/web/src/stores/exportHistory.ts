import type { ExportHistoryRecord } from '@/services/export'
import {
  addExportHistoryRecord,
  getExportHistoryFile,
  loadExportHistory,
  removeExportHistoryRecord,
} from '@/services/export'

/** Recent long-image export records, persisted in IndexedDB. */
export const useExportHistoryStore = defineStore(`exportHistory`, () => {
  const records = ref<ExportHistoryRecord[]>([])
  const loaded = ref(false)

  async function ensureLoaded() {
    if (loaded.value)
      return
    try {
      records.value = await loadExportHistory()
    }
    catch (error) {
      console.error(`[ExportHistory] Failed to load records`, error)
    }
    finally {
      loaded.value = true
    }
  }

  async function addRecord(
    record: ExportHistoryRecord,
    file: { previewDataUrl: string, fileDataUrl: string },
  ) {
    records.value = await addExportHistoryRecord(record, file)
  }

  async function removeRecord(id: string) {
    records.value = await removeExportHistoryRecord(id)
  }

  async function getFile(id: string) {
    return await getExportHistoryFile(id)
  }

  return {
    records,
    ensureLoaded,
    addRecord,
    removeRecord,
    getFile,
  }
})
