<script setup lang="ts">
import type { PreviewDevice, WatermarkPosition } from '@/services/export'
import { Image, Loader2 } from '@lucide/vue'
import PanelDialog from '@/components/shared/panel-dialog/PanelDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PNG_SEGMENT_HEIGHTS, PREVIEW_DEVICE_WIDTHS } from '@/services/export'
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

const { pngExportOptions } = storeToRefs(uiStore)

const dialogOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit(`update:open`, value),
})

const isExporting = ref(false)

const deviceOptions = computed(() => {
  void locale.value
  return ([`mobile`, `tablet`, `desktop`] as PreviewDevice[]).map(value => ({
    value,
    label: `${t(`pngExport.device.${value}`)} · ${PREVIEW_DEVICE_WIDTHS[value]}px`,
  }))
})

const modeOptions = computed(() => {
  void locale.value
  return [
    { value: `single` as const, label: t(`pngExport.mode.single`) },
    { value: `segments` as const, label: t(`pngExport.mode.segments`) },
  ]
})

const watermarkPositionOptions = computed(() => {
  void locale.value
  return ([`topLeft`, `topRight`, `center`, `bottomLeft`, `bottomRight`] as WatermarkPosition[]).map(value => ({
    value,
    label: t(`pngExport.watermarkPosition.${value}`),
  }))
})

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
    if (pngExportOptions.value.mode === `segments`)
      await exportStore.downloadAsSegmentedImages(pngExportOptions.value.segmentHeight)
    else
      await exportStore.downloadAsCardImage()
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
    :title="t('pngExport.title')"
    :description="t('pngExport.description')"
    :icon="Image"
    size="md"
  >
    <div class="space-y-1 px-4 py-4 sm:px-6">
      <div class="space-y-2 border-b py-3">
        <Label id="png-device-label" class="text-sm">{{ t('pngExport.device.label') }}</Label>
        <div
          role="radiogroup"
          aria-labelledby="png-device-label"
          class="flex flex-wrap gap-2"
        >
          <button
            v-for="option in deviceOptions"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="pngExportOptions.device === option.value"
            class="rounded-md border px-3 py-1.5 text-sm transition-colors"
            :class="optionButtonClass(pngExportOptions.device === option.value)"
            @click="pngExportOptions.device = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="space-y-2 border-b py-3">
        <Label id="png-mode-label" class="text-sm">{{ t('pngExport.mode.label') }}</Label>
        <div
          role="radiogroup"
          aria-labelledby="png-mode-label"
          class="flex flex-wrap gap-2"
        >
          <button
            v-for="option in modeOptions"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="pngExportOptions.mode === option.value"
            class="rounded-md border px-3 py-1.5 text-sm transition-colors"
            :class="optionButtonClass(pngExportOptions.mode === option.value)"
            @click="pngExportOptions.mode = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div v-if="pngExportOptions.mode === 'segments'" class="space-y-2 border-b py-3">
        <Label id="png-segment-height-label" class="text-sm">{{ t('pngExport.segmentHeight.label') }}</Label>
        <div
          role="radiogroup"
          aria-labelledby="png-segment-height-label"
          class="flex flex-wrap gap-2"
        >
          <button
            v-for="height in PNG_SEGMENT_HEIGHTS"
            :key="height"
            type="button"
            role="radio"
            :aria-checked="pngExportOptions.segmentHeight === height"
            class="rounded-md border px-3 py-1.5 text-sm transition-colors"
            :class="optionButtonClass(pngExportOptions.segmentHeight === height)"
            @click="pngExportOptions.segmentHeight = height"
          >
            {{ height }}px
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 border-b py-3">
        <div class="min-w-0 space-y-0.5">
          <Label for="png-watermark">{{ t('pngExport.watermark.label') }}</Label>
          <p class="text-xs text-muted-foreground">
            {{ t('pngExport.watermark.hint') }}
          </p>
        </div>
        <Switch
          id="png-watermark"
          class="shrink-0"
          :model-value="pngExportOptions.watermarkEnabled"
          @update:model-value="pngExportOptions.watermarkEnabled = $event"
        />
      </div>

      <template v-if="pngExportOptions.watermarkEnabled">
        <div class="space-y-2 border-b py-3">
          <Label for="png-watermark-text" class="text-sm">{{ t('pngExport.watermarkText.label') }}</Label>
          <Input
            id="png-watermark-text"
            v-model="pngExportOptions.watermarkText"
            :placeholder="t('pngExport.watermarkText.placeholder')"
            class="h-9"
          />
        </div>

        <div class="space-y-2 border-b py-3">
          <Label id="png-watermark-position-label" class="text-sm">
            {{ t('pngExport.watermarkPosition.label') }}
          </Label>
          <div
            role="radiogroup"
            aria-labelledby="png-watermark-position-label"
            class="flex flex-wrap gap-2"
          >
            <button
              v-for="option in watermarkPositionOptions"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="pngExportOptions.watermarkPosition === option.value"
              class="rounded-md border px-3 py-1.5 text-sm transition-colors"
              :class="optionButtonClass(pngExportOptions.watermarkPosition === option.value)"
              @click="pngExportOptions.watermarkPosition = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="space-y-2 py-3">
          <Label for="png-watermark-opacity" class="text-sm">
            {{ t('pngExport.watermarkOpacity.label', { value: Math.round(pngExportOptions.watermarkOpacity * 100) }) }}
          </Label>
          <input
            id="png-watermark-opacity"
            v-model.number="pngExportOptions.watermarkOpacity"
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            class="w-full accent-primary"
          >
        </div>
      </template>
    </div>

    <template #footer>
      <Button
        class="h-10 w-full gap-2"
        :disabled="isExporting"
        @click="handleExport"
      >
        <Loader2 v-if="isExporting" class="size-4 animate-spin" />
        <Image v-else class="size-4" />
        {{ t('pngExport.export') }}
      </Button>
    </template>
  </PanelDialog>
</template>
