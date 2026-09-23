<script setup lang="ts">
import { CheckCircle2, Clock, Link2, Loader2, UploadCloud, X, XCircle } from '@lucide/vue'
import { imageUploadCacheKey, UPLOADED_IMAGE_MAP_KEY, useImageUploader } from '@/composables/useImageUploader'
import { useLocalizedUploadHostOptions } from '@/composables/useLocalizedUploadHosts'
import { validateImageFile } from '@/lib/upload/validate-image'
import {
  isConfigurableUploadProvider,
  isUploadProviderConfigured,
  UPLOAD_PROVIDERS,
} from '@/services/upload/provider-registry'
import { store } from '@/storage'
import { useEditorStore } from '@/stores/editor'
import { useUIStore } from '@/stores/ui'
import { UPLOAD_PROVIDER_CONFIG_COMPONENTS } from './upload-providers'

const { t } = useI18n()

const uiStore = useUIStore()
const { enableImageReupload } = storeToRefs(uiStore)
const { toggleImageReupload } = uiStore

const editorStore = useEditorStore()
const { upload } = useImageUploader()

const uploadHostOptions = useLocalizedUploadHostOptions()
const configurableProviders = UPLOAD_PROVIDERS.filter(isConfigurableUploadProvider)

const imgHost = store.reactive(`imgHost`, `default`)
const useCompression = store.reactive(`useCompression`, false)
const activeName = ref(`upload`)

function providerLabel(providerId: string): string {
  return uploadHostOptions.value.find(option => option.value === providerId)?.label ?? providerId
}

function changeImgHost() {
  toast.success(t(`upload.hostSwitched`))
}

function changeCompression() {
}

// ---------- Upload queue ----------

type QueueStatus = `pending` | `uploading` | `success` | `failed` | `duplicate`

interface QueueItem {
  id: string
  file: File
  name: string
  size: number
  status: QueueStatus
  url?: string
  error?: string
}

const queue = ref<QueueItem[]>([])
const isProcessing = ref(false)
/** Links were already inserted for the current queue; avoids double inserts. */
const hasInserted = ref(false)

let queueItemSeq = 0

const successItems = computed(() => queue.value.filter(item => item.status === `success` || item.status === `duplicate`))
const hasActiveItems = computed(() => queue.value.some(item => item.status === `pending` || item.status === `uploading`))
const hasFailedItems = computed(() => queue.value.some(item => item.status === `failed`))

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024)
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

async function calculateHash(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest(`SHA-256`, buffer)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, `0`)).join(``)
}

async function compressImage(file: File) {
  const { default: imageCompression } = await import(`browser-image-compression`)
  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
  }
  return await imageCompression(file, options)
}

/** Dedup by file size + content hash: identical images reuse the stored link. */
async function findExistingUrl(file: File): Promise<string | null> {
  const hash = await calculateHash(file)
  const providerId = imgHost.value || `default`

  const cache = (await store.getJSON<Record<string, string>>(UPLOADED_IMAGE_MAP_KEY, {})) ?? {}
  const cached = cache[imageUploadCacheKey(providerId, hash)]
  if (cached)
    return cached

  for (const item of queue.value) {
    if ((item.status === `success` || item.status === `duplicate`) && item.url && item.size === file.size) {
      const itemHash = await calculateHash(item.file)
      if (itemHash === hash)
        return item.url
    }
  }
  return null
}

async function addFiles(files: File[]) {
  if (files.length === 0)
    return

  const providerId = imgHost.value || `default`
  if (!await isUploadProviderConfigured(providerId)) {
    toast.error(t(`upload.configureHostFirst`, { host: providerLabel(providerId) }))
    return
  }

  // Previous batch was already inserted; start a fresh queue.
  if (hasInserted.value) {
    queue.value = []
    hasInserted.value = false
  }

  for (const file of files) {
    const checkResult = validateImageFile(file, t)
    if (!checkResult.ok) {
      toast.error(checkResult.msg)
      continue
    }

    const existingUrl = await findExistingUrl(file)
    queue.value.push({
      id: `upload-${++queueItemSeq}`,
      file,
      name: file.name || `image-${Date.now()}.png`,
      size: file.size,
      status: existingUrl ? `duplicate` : `pending`,
      url: existingUrl ?? undefined,
    })
  }

  void processQueue()
}

async function processQueue() {
  if (isProcessing.value)
    return
  isProcessing.value = true

  try {
    for (const item of queue.value) {
      if (item.status !== `pending`)
        continue

      item.status = `uploading`
      try {
        let file = item.file
        if (useCompression.value)
          file = await compressImage(file)
        const url = await upload(file)
        if (!url)
          throw new Error(t(`store.uploader.uploadFailed`))
        item.url = url
        item.status = `success`
      }
      catch (err) {
        item.status = `failed`
        item.error = err instanceof Error ? err.message : t(`store.uploader.uploadFailed`)
      }
    }
  }
  finally {
    isProcessing.value = false
  }

  maybeAutoInsert()
}

function insertSuccessfulLinks(): boolean {
  const items = successItems.value
  if (items.length === 0)
    return false
  const markdown = items.map(item => `![](${item.url})`).join(`\n`)
  editorStore.insertAtCursor(`\n${markdown}\n`)
  return true
}

/** Auto-insert once every queued item has finished successfully. */
function maybeAutoInsert() {
  if (hasInserted.value || queue.value.length === 0 || hasActiveItems.value || hasFailedItems.value)
    return
  if (insertSuccessfulLinks()) {
    hasInserted.value = true
    toast.success(t(`upload.queue.inserted`, { count: successItems.value.length }))
  }
}

function retryItem(item: QueueItem) {
  if (item.status !== `failed`)
    return
  item.status = `pending`
  item.error = undefined
  void processQueue()
}

function removeItem(id: string) {
  const index = queue.value.findIndex(item => item.id === id)
  if (index !== -1)
    queue.value.splice(index, 1)
  if (queue.value.length > 0)
    maybeAutoInsert()
}

function clearQueue() {
  queue.value = []
  hasInserted.value = false
}

function insertNow() {
  if (insertSuccessfulLinks()) {
    hasInserted.value = true
    toast.success(t(`upload.queue.inserted`, { count: successItems.value.length }))
  }
}

// ---------- File selection ----------

const dragover = ref(false)

const { open, reset, onChange } = useFileDialog({
  accept: `image/*`,
  multiple: true,
})

onChange(async (files) => {
  if (files == null)
    return
  await addFiles([...files])
  reset()
})

async function onDrop(e: DragEvent) {
  dragover.value = false
  e.stopPropagation()
  const files = [...(e.dataTransfer?.files ?? [])]
  await addFiles(files)
}

function onTabScroll(e: WheelEvent) {
  if (e.deltaY !== 0) {
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.scrollLeft += e.deltaY
  }
}
</script>

<template>
  <Dialog v-model:open="uiStore.isShowUploadImgDialog">
    <DialogContent class="md:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" @pointer-down-outside="ev => ev.preventDefault()">
      <DialogHeader>
        <DialogTitle>{{ t('upload.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('upload.description') }}
        </DialogDescription>
      </DialogHeader>
      <Tabs v-model="activeName" class="w-full md:w-full flex flex-col flex-1 overflow-hidden">
        <TabsList
          class="flex w-full justify-start overflow-x-auto flex-nowrap gap-1 pb-1 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          @wheel="onTabScroll"
        >
          <TabsTrigger value="upload" class="text-xs md:text-sm whitespace-nowrap">
            {{ t('upload.selectUpload') }}
          </TabsTrigger>
          <TabsTrigger
            v-for="provider in configurableProviders"
            :key="provider.id"
            :value="provider.id"
            class="text-xs md:text-sm whitespace-nowrap"
          >
            {{ providerLabel(provider.id) }}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" class="flex-1 overflow-y-auto p-1 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <Select v-model="imgHost" class="my-4" @update:model-value="changeImgHost">
            <SelectTrigger>
              <SelectValue :placeholder="t('upload.selectHostPlaceholder')" />
            </SelectTrigger>
            <SelectContent class="max-h-64 md:max-h-96">
              <SelectItem
                v-for="item in uploadHostOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              >
                {{ item.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <div class="space-y-3 my-4">
            <div class="flex items-center justify-between gap-4">
              <span class="text-sm">
                {{ t('upload.enableCompression') }}
              </span>
              <Switch
                v-model="useCompression"
                name="UseCompression"
                @update:model-value="changeCompression"
              />
            </div>

            <div class="flex items-center justify-between gap-4">
              <span class="text-sm">
                {{ t('upload.autoReuploadOnPaste') }}
              </span>
              <Switch
                v-model="enableImageReupload"
                name="EnableImageReupload"
                @update:model-value="toggleImageReupload"
              />
            </div>
            <p class="text-xs text-muted-foreground mt-1.5">
              {{ t('upload.autoReuploadMdHint') }}
            </p>
          </div>

          <div
            role="button"
            tabindex="0"
            class="bg-clip-padding mt-4 h-50 relative flex flex-col cursor-pointer items-center justify-evenly border-2 rounded border-dashed transition-colors hover:border-gray-700 hover:bg-gray-400/50 dark:hover:border-gray-200 dark:hover:bg-gray-500/50"
            :class="{
              'border-gray-700 bg-gray-400/50 dark:border-gray-200 dark:bg-gray-500/50': dragover,
            }"
            @click="open()"
            @keydown.enter.prevent="open()"
            @keydown.space.prevent="open()"
            @drop.prevent="onDrop"
            @dragover.prevent="dragover = true"
            @dragleave.prevent="dragover = false"
          >
            <Progress v-if="isProcessing" indeterminate class="absolute left-0 right-0 rounded-none" style="top: -24px; height: 2px;" />
            <UploadCloud class="size-16 md:size-20" />
            <p class="text-center text-sm md:text-base px-4">
              {{ t('upload.dragOrClick') }}
              <strong>{{ t('upload.clickToUpload') }}</strong>
            </p>
            <p class="text-xs text-muted-foreground px-4">
              {{ t('upload.queue.multiSelectHint') }}
            </p>
          </div>

          <div v-if="queue.length" class="mt-4 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">
                {{ t('upload.queue.title') }}
                <span class="text-muted-foreground font-normal">
                  ({{ successItems.length }}/{{ queue.length }})
                </span>
              </span>
              <button
                type="button"
                class="text-xs text-muted-foreground hover:text-foreground transition-colors"
                @click="clearQueue"
              >
                {{ t('upload.queue.clear') }}
              </button>
            </div>

            <ul class="space-y-1.5">
              <li
                v-for="item in queue"
                :key="item.id"
                class="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
              >
                <Loader2 v-if="item.status === 'uploading'" class="size-4 shrink-0 animate-spin text-primary" />
                <Clock v-else-if="item.status === 'pending'" class="size-4 shrink-0 text-muted-foreground" />
                <CheckCircle2 v-else-if="item.status === 'success'" class="size-4 shrink-0 text-green-500" />
                <Link2 v-else-if="item.status === 'duplicate'" class="size-4 shrink-0 text-blue-500" />
                <XCircle v-else class="size-4 shrink-0 text-destructive" />

                <span class="truncate flex-1" :title="item.name">{{ item.name }}</span>
                <span class="shrink-0 text-muted-foreground">{{ formatFileSize(item.size) }}</span>

                <span v-if="item.status === 'pending'" class="shrink-0 text-muted-foreground">
                  {{ t('upload.queue.statusPending') }}
                </span>
                <span v-else-if="item.status === 'uploading'" class="shrink-0 text-primary">
                  {{ t('upload.queue.statusUploading') }}
                </span>
                <span v-else-if="item.status === 'success'" class="shrink-0 text-green-600 dark:text-green-400">
                  {{ t('upload.queue.statusSuccess') }}
                </span>
                <span v-else-if="item.status === 'duplicate'" class="shrink-0 text-blue-600 dark:text-blue-400">
                  {{ t('upload.queue.statusDuplicate') }}
                </span>
                <span v-else class="shrink-0 max-w-[140px] truncate text-destructive" :title="item.error">
                  {{ t('upload.queue.statusFailed') }}
                </span>

                <button
                  v-if="item.status === 'failed'"
                  type="button"
                  class="shrink-0 rounded px-1.5 py-0.5 text-primary hover:bg-accent transition-colors"
                  @click="retryItem(item)"
                >
                  {{ t('upload.queue.retry') }}
                </button>
                <button
                  v-if="item.status !== 'uploading'"
                  type="button"
                  class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  :aria-label="t('common.delete')"
                  @click="removeItem(item.id)"
                >
                  <X class="size-3.5" />
                </button>
              </li>
            </ul>

            <div v-if="hasFailedItems && successItems.length && !hasActiveItems && !hasInserted" class="flex justify-end">
              <Button size="sm" @click="insertNow">
                {{ t('upload.queue.insertSuccessful', { count: successItems.length }) }}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent
          v-for="provider in configurableProviders"
          :key="provider.id"
          :value="provider.id"
          class="flex-1 flex flex-col overflow-hidden"
        >
          <component :is="UPLOAD_PROVIDER_CONFIG_COMPONENTS[provider.id]" />
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
