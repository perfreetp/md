<script setup lang="ts">
import type { ExportRecord } from '@/stores/export'
import { Download, FileArchive, Image, Trash2 } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatLocalDateTime } from '@/i18n/translate'
import { useExportStore } from '@/stores/export'

const { t, locale } = useI18n()
const exportStore = useExportStore()
const { exportRecords } = storeToRefs(exportStore)

const previewRecord = ref<ExportRecord | null>(null)

function formatTime(timestamp: number) {
  void locale.value
  return formatLocalDateTime(timestamp)
}

function deviceLabel(record: ExportRecord) {
  void locale.value
  return t(`pngExport.device.${record.device}`)
}

function removeRecord(id: string) {
  exportStore.removeExportRecord(id)
  if (previewRecord.value?.id === id)
    previewRecord.value = null
}
</script>

<template>
  <div class="flex-1 overflow-y-auto px-1.5 py-0.5 thin-scrollbar">
    <div v-if="exportRecords.length" class="px-2 py-1 text-xs text-muted-foreground/60">
      {{ t('post.exportRecordsCount', { count: exportRecords.length }) }}
    </div>

    <template v-if="exportRecords.length">
      <div
        v-for="record in exportRecords"
        :key="record.id"
        class="group relative mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/50"
      >
        <button
          type="button"
          class="flex size-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded border border-border/60 bg-muted/40"
          :disabled="record.kind !== 'png'"
          :title="record.kind === 'png' ? t('post.exportRecordPreview') : undefined"
          @click="record.kind === 'png' && (previewRecord = record)"
        >
          <img
            v-if="record.kind === 'png'"
            :src="record.dataUrl"
            :alt="record.title"
            class="h-full w-full object-cover object-top"
            loading="lazy"
          >
          <FileArchive v-else class="size-4 text-muted-foreground/60" />
        </button>

        <div class="min-w-0 flex-1">
          <p class="truncate text-[13px] leading-snug text-foreground/80">
            {{ record.title }}
          </p>
          <p class="truncate text-[11px] text-muted-foreground/60">
            {{ formatTime(record.createdAt) }} · {{ deviceLabel(record) }}<template v-if="record.kind === 'zip'">
              · ZIP
            </template>
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            v-if="record.kind === 'png'"
            type="button"
            class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground"
            :title="t('post.exportRecordPreview')"
            :aria-label="t('post.exportRecordPreview')"
            @click="previewRecord = record"
          >
            <Image class="size-3.5" />
          </button>
          <button
            type="button"
            class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground"
            :title="t('post.exportRecordDownload')"
            :aria-label="t('post.exportRecordDownload')"
            @click="exportStore.downloadExportRecord(record)"
          >
            <Download class="size-3.5" />
          </button>
          <button
            type="button"
            class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/60 hover:text-destructive"
            :title="t('post.exportRecordDelete')"
            :aria-label="t('post.exportRecordDelete')"
            @click="removeRecord(record.id)"
          >
            <Trash2 class="size-3.5" />
          </button>
        </div>
      </div>
    </template>

    <div v-else class="flex flex-col items-center justify-center gap-2 py-12 px-6">
      <Image class="size-5 text-muted-foreground/30" />
      <p class="text-xs text-muted-foreground/50">
        {{ t('post.exportRecordsEmpty') }}
      </p>
    </div>

    <Dialog :open="!!previewRecord" @update:open="(v) => !v && (previewRecord = null)">
      <DialogContent class="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ previewRecord?.title }}</DialogTitle>
          <DialogDescription>{{ t('post.exportRecordPreview') }}</DialogDescription>
        </DialogHeader>
        <img
          v-if="previewRecord"
          :src="previewRecord.dataUrl"
          :alt="previewRecord.title"
          class="mx-auto max-w-full rounded border"
        >
      </DialogContent>
    </Dialog>
  </div>
</template>
