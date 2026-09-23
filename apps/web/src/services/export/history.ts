import { getDatabase } from '@/storage/db'
import { STORE_SETTINGS } from '@/storage/keys'
import { addPrefix } from '@/storage/prefix'

/** How many recent exports are kept in the history. */
export const MAX_EXPORT_HISTORY_RECORDS = 6

const INDEX_KEY = addPrefix(`export_history:index`)
const FILE_KEY_PREFIX = addPrefix(`export_history:file:`)

export interface ExportHistoryRecord {
  id: string
  title: string
  createdAt: number
  device: string
  width: number
  mode: `single` | `segments`
  /** Number of images produced. */
  count: number
  fileName: string
  mime: string
}

export interface ExportHistoryFile {
  /** Small preview image (first segment) as a data URL. */
  previewDataUrl: string
  /** Downloadable artifact: the PNG itself, or a zip for multi-segment exports. */
  fileDataUrl: string
}

async function readIndex(): Promise<ExportHistoryRecord[]> {
  const db = await getDatabase()
  const row = await db.get(STORE_SETTINGS, INDEX_KEY)
  if (!row?.value)
    return []
  try {
    const parsed = JSON.parse(row.value)
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

async function writeIndex(records: ExportHistoryRecord[]): Promise<void> {
  const db = await getDatabase()
  await db.put(STORE_SETTINGS, { key: INDEX_KEY, value: JSON.stringify(records) })
}

export async function loadExportHistory(): Promise<ExportHistoryRecord[]> {
  return await readIndex()
}

export async function addExportHistoryRecord(
  record: ExportHistoryRecord,
  file: ExportHistoryFile,
): Promise<ExportHistoryRecord[]> {
  const db = await getDatabase()
  const records = [record, ...(await readIndex()).filter(r => r.id !== record.id)]
  const dropped = records.splice(MAX_EXPORT_HISTORY_RECORDS)
  await db.put(STORE_SETTINGS, { key: `${FILE_KEY_PREFIX}${record.id}`, value: JSON.stringify(file) })
  for (const stale of dropped)
    await db.delete(STORE_SETTINGS, `${FILE_KEY_PREFIX}${stale.id}`)
  await writeIndex(records)
  return records
}

export async function removeExportHistoryRecord(id: string): Promise<ExportHistoryRecord[]> {
  const db = await getDatabase()
  const records = (await readIndex()).filter(r => r.id !== id)
  await db.delete(STORE_SETTINGS, `${FILE_KEY_PREFIX}${id}`)
  await writeIndex(records)
  return records
}

export async function getExportHistoryFile(id: string): Promise<ExportHistoryFile | null> {
  const db = await getDatabase()
  const row = await db.get(STORE_SETTINGS, `${FILE_KEY_PREFIX}${id}`)
  if (!row?.value)
    return null
  try {
    return JSON.parse(row.value) as ExportHistoryFile
  }
  catch {
    return null
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
