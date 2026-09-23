<script setup lang="ts">
import type { ExportHistoryRecord } from '@/services/export'
import { Download, Eye, History, ImageOff, Trash2 } from '@lucide/vue'
import { downloadFile } from '@md/shared/utils/fileHelpers'
import PanelDialog from '@/components/shared/panel-dialog/PanelDialog.vue'
import { formatLocalDateTime } from '@/i18n/translate'
import { useExportHistoryStore } from '@/stores/exportHistory'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t, locale } = useI18n()
const historyStore = useExportHistoryStore()
const { records } = storeToRefs(historyStore)

const dialogOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit(`update:open`, value),
})

watch(dialogOpen, (open) => {
  if (open)
    void historyStore.ensureLoaded()
})

function formatTime(timestamp: number) {
  void locale.value
  return formatLocalDateTime(timestamp)
}

const previewRecord = ref<ExportHistoryRecord | null>(null)
const previewUrl = ref(``)

async function openPreview(record: ExportHistoryRecord) {
  const file = await historyStore.getFile(record.id)
  if (!file)
    return
  previewRecord.value = record
  previewUrl.value = file.previewDataUrl
}

function closePreview() {
  previewRecord.value = null
  previewUrl.value = ``
}

async function downloadRecord(record: ExportHistoryRecord) {
  const file = await historyStore.getFile(record.id)
  if (!file) {
    toast.error(t(`exportHistory.missing`))
    return
  }
  downloadFile(file.fileDataUrl, record.fileName, record.mime)
  toast.success(t(`exportHistory.downloaded`))
}

async function removeRecord(record: ExportHistoryRecord) {
  await historyStore.removeRecord(record.id)
  if (previewRecord.value?.id === record.id)
    closePreview()
  toast.success(t(`exportHistory.deleted`))
}

const deviceLabel = computed(() => {
  void locale.value
  return (device: string) => t(`longImageExport.device.${device}`)
})
</script>

<template>
  <PanelDialog
    v-model:open="dialogOpen"
    :title="t('exportHistory.title')"
    :description="t('exportHistory.description')"
    :icon="History"
    size="2xl"
  >
    <div class="px-4 py-4 sm:px-6">
      <div v-if="previewRecord" class="mb-4">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="min-w-0 truncate text-sm font-medium">
            {{ previewRecord.title }}
          </p>
          <Button variant="outline" size="sm" @click="closePreview">
            {{ t('exportHistory.closePreview') }}
          </Button>
        </div>
        <div class="max-h-[50vh] overflow-y-auto rounded-lg border bg-muted/40">
          <img :src="previewUrl" :alt="previewRecord.title" class="mx-auto max-w-full">
        </div>
      </div>

      <div v-if="records.length" class="space-y-2">
        <div
          v-for="record in records"
          :key="record.id"
          class="flex items-center gap-3 rounded-lg border px-3 py-2"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">
              {{ record.title }}
            </p>
            <p class="truncate text-xs text-muted-foreground">
              {{ formatTime(record.createdAt) }}
              · {{ deviceLabel(record.device) }} · {{ record.width }}px
              · {{ record.mode === 'segments' ? t('exportHistory.segments', { count: record.count }) : t('exportHistory.single') }}
            </p>
          </div>
          <Button
            variant="ghost"
            size="xs"
            :title="t('exportHistory.preview')"
            :aria-label="t('exportHistory.preview')"
            class="h-7 w-7 p-0"
            @click="openPreview(record)"
          >
            <Eye class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            :title="t('exportHistory.download')"
            :aria-label="t('exportHistory.download')"
            class="h-7 w-7 p-0"
            @click="downloadRecord(record)"
          >
            <Download class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            :title="t('exportHistory.delete')"
            :aria-label="t('exportHistory.delete')"
            class="h-7 w-7 p-0 text-destructive hover:text-destructive"
            @click="removeRecord(record)"
          >
            <Trash2 class="size-4" />
          </Button>
        </div>
      </div>

      <div v-else class="flex flex-col items-center justify-center gap-2 py-12">
        <ImageOff class="size-6 text-muted-foreground/40" />
        <p class="text-sm text-muted-foreground">
          {{ t('exportHistory.empty') }}
        </p>
      </div>
    </div>
  </PanelDialog>
</template>
