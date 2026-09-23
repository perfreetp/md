<script setup lang="ts">
import type { UploadQueueItemStatus } from '@/stores/uploadQueue'
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, RotateCcw, Trash2, X, XCircle } from '@lucide/vue'
import { useUploadQueueStore } from '@/stores/uploadQueue'

const { t } = useI18n()
const uploadQueueStore = useUploadQueueStore()
const { items, isActive, doneCount } = storeToRefs(uploadQueueStore)

const isCollapsed = ref(false)

const statusIcon: Record<UploadQueueItemStatus, typeof Loader2> = {
  pending: Loader2,
  uploading: Loader2,
  success: CheckCircle2,
  reused: CheckCircle2,
  failed: XCircle,
}

function statusText(status: UploadQueueItemStatus): string {
  return t(`uploadQueue.status.${status}`)
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
</script>

<template>
  <div
    v-if="items.length"
    class="fixed bottom-4 right-4 z-50 w-72 rounded-lg border border-border bg-background shadow-lg"
  >
    <div class="flex items-center gap-2 border-b border-border px-3 py-2">
      <Loader2 v-if="isActive" class="size-3.5 animate-spin text-primary" />
      <CheckCircle2 v-else class="size-3.5 text-green-500" />
      <span class="flex-1 text-xs font-medium">
        {{ t('uploadQueue.title') }}
        <span class="text-muted-foreground">{{ doneCount }}/{{ items.length }}</span>
      </span>
      <button
        type="button"
        class="inline-flex items-center justify-center size-5 rounded text-muted-foreground hover:text-foreground transition-colors"
        :title="t('uploadQueue.clearFinished')"
        :aria-label="t('uploadQueue.clearFinished')"
        @click="uploadQueueStore.clearFinished()"
      >
        <Trash2 class="size-3" />
      </button>
      <button
        type="button"
        class="inline-flex items-center justify-center size-5 rounded text-muted-foreground hover:text-foreground transition-colors"
        :title="isCollapsed ? t('common.expand') : t('common.collapse')"
        :aria-label="isCollapsed ? t('common.expand') : t('common.collapse')"
        @click="isCollapsed = !isCollapsed"
      >
        <ChevronUp v-if="!isCollapsed" class="size-3" />
        <ChevronDown v-else class="size-3" />
      </button>
    </div>

    <ul v-if="!isCollapsed" class="max-h-56 overflow-y-auto thin-scrollbar px-2 py-1.5 space-y-1">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
        :class="item.status === 'failed' ? 'bg-destructive/5' : ''"
      >
        <component
          :is="statusIcon[item.status]"
          class="size-3.5 shrink-0"
          :class="{
            'animate-spin text-primary': item.status === 'uploading',
            'text-muted-foreground': item.status === 'pending',
            'text-green-500': item.status === 'success' || item.status === 'reused',
            'text-destructive': item.status === 'failed',
          }"
        />
        <div class="flex-1 min-w-0">
          <p class="truncate">
            {{ item.name }}
            <span class="text-muted-foreground">{{ formatSize(item.size) }}</span>
          </p>
          <p
            class="text-[11px]"
            :class="item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'"
            :title="item.error"
          >
            {{ item.status === 'failed' && item.error ? item.error : statusText(item.status) }}
          </p>
          <div v-if="item.status === 'uploading'" class="mt-1 h-0.5 w-full overflow-hidden rounded bg-muted">
            <div class="upload-queue-progress h-full w-1/3 rounded bg-primary" />
          </div>
        </div>
        <button
          v-if="item.status === 'failed'"
          type="button"
          class="inline-flex shrink-0 items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          :title="t('uploadQueue.retry')"
          :aria-label="t('uploadQueue.retry')"
          @click="uploadQueueStore.retry(item.id)"
        >
          <RotateCcw class="size-3" />
        </button>
        <button
          v-if="item.status === 'failed' || item.inserted"
          type="button"
          class="inline-flex shrink-0 items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          :title="t('common.delete')"
          :aria-label="t('common.delete')"
          @click="uploadQueueStore.remove(item.id)"
        >
          <X class="size-3" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.thin-scrollbar {
  scrollbar-width: thin;
}

.upload-queue-progress {
  animation: upload-queue-slide 1.2s ease-in-out infinite;
}

@keyframes upload-queue-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(300%);
  }
}
</style>
