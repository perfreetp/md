<script setup lang="ts">
import type { LongImageDeviceId, WatermarkPosition } from '@/services/export'
import { ImageDown, Loader2 } from '@lucide/vue'
import PanelDialog from '@/components/shared/panel-dialog/PanelDialog.vue'
import {
  deviceWidthOf,
  LONG_IMAGE_DEVICES,
  PNG_SEGMENT_HEIGHTS,
  WATERMARK_POSITIONS,
} from '@/services/export'
import { buildPreviewShell } from '@/services/export/png-capture'
import { useExportStore } from '@/stores/export'
import { useUIStore } from '@/stores/ui'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t, locale } = useI18n()
const uiStore = useUIStore()
const exportStore = useExportStore()

const { longImageExportOptions } = storeToRefs(uiStore)

const dialogOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit(`update:open`, value),
})

const isExporting = ref(false)

const deviceOptions = computed(() => {
  void locale.value
  return LONG_IMAGE_DEVICES.map(device => ({
    value: device.id,
    width: device.width,
    label: t(`longImageExport.device.${device.id}`),
  }))
})

const modeOptions = computed(() => [
  { value: `single` as const, label: t(`longImageExport.mode.single`) },
  { value: `segments` as const, label: t(`longImageExport.mode.segments`) },
])

const watermarkPositionOptions = computed(() => {
  void locale.value
  return WATERMARK_POSITIONS.map(position => ({
    value: position,
    label: t(`longImageExport.watermark.positions.${position}`),
  }))
})

const previewWidth = computed(() => deviceWidthOf(longImageExportOptions.value.device))

// --- Live preview ---
const previewViewportRef = ref<HTMLDivElement | null>(null)
const previewMountRef = ref<HTMLDivElement | null>(null)
const previewBoxWidth = ref(0)
const previewContentHeight = ref(0)
let previewGeneration = 0

const previewScale = computed(() => {
  if (!previewBoxWidth.value)
    return 1
  return Math.min(1, previewBoxWidth.value / previewWidth.value)
})

const scaledPreviewHeight = computed(() => Math.ceil(previewContentHeight.value * previewScale.value))

async function rebuildPreview() {
  const mount = previewMountRef.value
  if (!mount)
    return

  const generation = ++previewGeneration
  const shell = await buildPreviewShell(previewWidth.value)
  if (!shell || generation !== previewGeneration)
    return

  mount.replaceChildren(shell.host)
  await nextTick()
  if (generation !== previewGeneration)
    return
  previewContentHeight.value = shell.host.scrollHeight
}

let resizeObserver: ResizeObserver | null = null

watch(dialogOpen, async (open) => {
  if (!open)
    return
  await nextTick()
  previewBoxWidth.value = previewViewportRef.value?.clientWidth ?? 0
  void rebuildPreview()
})

watch(previewWidth, () => {
  if (dialogOpen.value)
    void rebuildPreview()
})

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry)
      previewBoxWidth.value = entry.contentRect.width
  })
  if (previewViewportRef.value)
    resizeObserver.observe(previewViewportRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

// --- Watermark preview overlay ---
const showWatermarkPreview = computed(() => !!longImageExportOptions.value.watermark.text.trim())

const watermarkPreviewStyle = computed(() => ({
  fontSize: `${Math.max(10, Math.round(previewWidth.value / 32 * previewScale.value))}px`,
  opacity: longImageExportOptions.value.watermark.opacity,
}))

const watermarkPositionClass = computed(() => {
  switch (longImageExportOptions.value.watermark.position) {
    case `top-left`:
      return `items-start justify-start`
    case `top-right`:
      return `items-start justify-end`
    case `bottom-left`:
      return `items-end justify-start`
    case `bottom-right`:
      return `items-end justify-end`
    default:
      return `items-center justify-center`
  }
})

const tileWatermarkCount = 24

function setDevice(device: LongImageDeviceId) {
  longImageExportOptions.value.device = device
}

function setWatermarkPosition(position: WatermarkPosition) {
  longImageExportOptions.value.watermark.position = position
}

function optionButtonClass(active: boolean) {
  return active
    ? `border-primary bg-primary/5 font-medium text-primary ring-1 ring-primary/20`
    : `text-muted-foreground hover:bg-muted/50`
}

async function handleExport() {
  if (isExporting.value)
    return

  isExporting.value = true
  try {
    await exportStore.exportLongImage(longImageExportOptions.value)
    dialogOpen.value = false
  }
  finally {
    isExporting.value = false
  }
}
</script>

<template>
  <PanelDialog
    v-model:open="dialogOpen"
    :title="t('longImageExport.title')"
    :description="t('longImageExport.description')"
    :icon="ImageDown"
    size="4xl"
  >
    <div class="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_260px] sm:px-6">
      <!-- Live preview at the selected device width -->
      <div class="relative min-w-0">
        <div
          ref="previewViewportRef"
          class="max-h-[60vh] overflow-y-auto rounded-lg border bg-muted/40"
        >
          <div :style="{ height: `${scaledPreviewHeight}px` }">
            <div
              ref="previewMountRef"
              class="origin-top-left"
              :style="{ width: `${previewWidth}px`, transform: `scale(${previewScale})` }"
            />
          </div>
        </div>

        <div
          v-if="showWatermarkPreview"
          class="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
        >
          <div
            v-if="longImageExportOptions.watermark.position === 'tile'"
            class="absolute -inset-10 flex rotate-[-20deg] flex-wrap content-center justify-center gap-x-10 gap-y-8"
          >
            <span
              v-for="i in tileWatermarkCount"
              :key="i"
              class="whitespace-nowrap text-neutral-500"
              :style="watermarkPreviewStyle"
            >{{ longImageExportOptions.watermark.text }}</span>
          </div>
          <div v-else class="absolute inset-0 flex p-4" :class="watermarkPositionClass">
            <span class="whitespace-nowrap text-neutral-500" :style="watermarkPreviewStyle">
              {{ longImageExportOptions.watermark.text }}
            </span>
          </div>
        </div>
      </div>

      <!-- Settings -->
      <div class="min-w-0 space-y-4">
        <div class="space-y-2">
          <Label class="text-sm">{{ t('longImageExport.device.label') }}</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in deviceOptions"
              :key="option.value"
              type="button"
              class="rounded-md border px-3 py-1.5 text-sm transition-colors"
              :class="optionButtonClass(longImageExportOptions.device === option.value)"
              @click="setDevice(option.value)"
            >
              {{ option.label }} · {{ option.width }}px
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <Label class="text-sm">{{ t('longImageExport.mode.label') }}</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in modeOptions"
              :key="option.value"
              type="button"
              class="rounded-md border px-3 py-1.5 text-sm transition-colors"
              :class="optionButtonClass(longImageExportOptions.mode === option.value)"
              @click="longImageExportOptions.mode = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div v-if="longImageExportOptions.mode === 'segments'" class="space-y-2">
          <Label class="text-sm">{{ t('longImageExport.segmentHeight') }}</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="height in PNG_SEGMENT_HEIGHTS"
              :key="height"
              type="button"
              class="rounded-md border px-3 py-1.5 text-sm transition-colors"
              :class="optionButtonClass(longImageExportOptions.segmentHeight === height)"
              @click="longImageExportOptions.segmentHeight = height"
            >
              {{ height }}px
            </button>
          </div>
        </div>

        <div class="space-y-2 border-t pt-3">
          <Label for="long-image-watermark" class="text-sm">
            {{ t('longImageExport.watermark.text') }}
          </Label>
          <Input
            id="long-image-watermark"
            v-model="longImageExportOptions.watermark.text"
            :placeholder="t('longImageExport.watermark.textPlaceholder')"
            class="h-8 text-sm"
          />
        </div>

        <template v-if="longImageExportOptions.watermark.text.trim()">
          <div class="space-y-2">
            <Label class="text-sm">{{ t('longImageExport.watermark.position') }}</Label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in watermarkPositionOptions"
                :key="option.value"
                type="button"
                class="rounded-md border px-2.5 py-1 text-xs transition-colors"
                :class="optionButtonClass(longImageExportOptions.watermark.position === option.value)"
                @click="setWatermarkPosition(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="long-image-watermark-opacity" class="text-sm">
              {{ t('longImageExport.watermark.opacity') }}
              <span class="ml-1 text-muted-foreground">{{ Math.round(longImageExportOptions.watermark.opacity * 100) }}%</span>
            </Label>
            <input
              id="long-image-watermark-opacity"
              v-model.number="longImageExportOptions.watermark.opacity"
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              class="w-full accent-primary"
            >
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <Button variant="outline" @click="dialogOpen = false">
          {{ t('common.cancel') }}
        </Button>
        <Button :disabled="isExporting" @click="handleExport">
          <Loader2 v-if="isExporting" class="mr-2 size-4 animate-spin" />
          <ImageDown v-else class="mr-2 size-4" />
          {{ isExporting ? t('longImageExport.exporting') : t('longImageExport.export') }}
        </Button>
      </div>
    </template>
  </PanelDialog>
</template>
