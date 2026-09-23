<script setup lang="ts">
import type { ThemeSharePayload } from '@/lib/theme-share'
import { Download, Upload } from '@lucide/vue'
import { getDefaultContent } from '@/assets/example/default-content'
import { CONTENT_FONT_LANG } from '@/i18n/constants'
import { copyPlain } from '@/lib/browser/clipboard'
import { decodeThemeShare, encodeThemeShare } from '@/lib/theme-share'
import { useCssEditorStore } from '@/stores/cssEditor'
import { useThemeStore } from '@/stores/theme'
import { useUIStore } from '@/stores/ui'

const props = defineProps<{
  open: boolean
  /** Which tab to show initially. */
  initialTab?: 'share' | 'import'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t, locale } = useI18n()
const themeStore = useThemeStore()
const cssEditorStore = useCssEditorStore()
const uiStore = useUIStore()

const dialogOpen = computed({
  get: () => props.open,
  set: (val: boolean) => emit(`update:open`, val),
})

const activeTab = ref<'share' | 'import'>(props.initialTab ?? `share`)
watch(dialogOpen, (open) => {
  if (open) {
    activeTab.value = props.initialTab ?? `share`
    if (activeTab.value === `share`)
      regenerateShareText()
    resetImport()
  }
})

// ---------- Share ----------

const shareText = ref(``)

function regenerateShareText() {
  const payload: ThemeSharePayload = {
    v: 1,
    name: cssEditorStore.getCurrentTab().title,
    css: cssEditorStore.getCurrentTabContent(),
    settings: {
      primaryColor: themeStore.primaryColor,
      fontFamily: themeStore.fontFamily,
      fontSize: themeStore.fontSize,
      lineHeight: themeStore.lineHeight,
      blockSpacing: themeStore.blockSpacing,
      linkColor: themeStore.linkColor,
      blockquoteBackground: themeStore.blockquoteBackground,
      codeBlockTheme: themeStore.codeBlockTheme,
      headingStyles: themeStore.headingStyles,
      isShowLineNumber: themeStore.isShowLineNumber,
      isMacCodeBlock: themeStore.isMacCodeBlock,
      legend: themeStore.legend,
      isCiteStatus: themeStore.isCiteStatus,
      isCountStatus: themeStore.isCountStatus,
      isUseIndent: themeStore.isUseIndent,
      isUseJustify: themeStore.isUseJustify,
    },
  }
  shareText.value = encodeThemeShare(payload)
}

watch(activeTab, (tab) => {
  if (tab === `share` && dialogOpen.value)
    regenerateShareText()
})

async function copyShareText() {
  try {
    await copyPlain(shareText.value)
    toast.success(t(`common.copiedToClipboard`))
  }
  catch {
    toast.error(t(`common.copyFailed`))
  }
}

// ---------- Import ----------

const importText = ref(``)
const importName = ref(``)
const importedPayload = ref<ThemeSharePayload | null>(null)
const importError = ref<`` | `empty` | `badFormat` | `badChecksum` | `badPayload`>(``)

function resetImport() {
  importText.value = ``
  importName.value = ``
  importedPayload.value = null
  importError.value = ``
}

const importErrorText = computed(() => {
  void locale.value
  switch (importError.value) {
    case `badFormat`:
      return t(`cssEditor.share.importErrorBadFormat`)
    case `badChecksum`:
      return t(`cssEditor.share.importErrorBadChecksum`)
    case `badPayload`:
      return t(`cssEditor.share.importErrorBadPayload`)
    default:
      return ``
  }
})

// Validate on paste / input so broken text surfaces an error immediately and
// never reaches the preview or the store.
watch(importText, (text) => {
  if (!text.trim()) {
    importedPayload.value = null
    importError.value = ``
    return
  }
  const result = decodeThemeShare(text)
  if (!result.ok) {
    importedPayload.value = null
    importError.value = result.error
    return
  }
  importError.value = ``
  importedPayload.value = result.payload
  importName.value = result.payload.name
})

// ---------- Import preview ----------

const PREVIEW_SCOPE = `#theme-share-preview`
const styleTag = `style` as const

interface CoreModules {
  initRenderer: (typeof import('@md/core/renderer'))[`initRenderer`]
  renderMarkdown: (typeof import('@md/core/utils'))[`renderMarkdown`]
  postProcessHtml: (typeof import('@md/core/utils'))[`postProcessHtml`]
}

const coreModules = shallowRef<CoreModules | null>(null)
let coreModulesPromise: Promise<CoreModules> | null = null

function ensureCoreModules(): Promise<CoreModules> {
  coreModulesPromise ??= Promise.all([import(`@md/core/renderer`), import(`@md/core/utils`)])
    .then(([core, coreUtils]) => {
      const modules: CoreModules = {
        initRenderer: core.initRenderer,
        renderMarkdown: coreUtils.renderMarkdown,
        postProcessHtml: coreUtils.postProcessHtml,
      }
      coreModules.value = modules
      return modules
    })
    .catch((error) => {
      coreModulesPromise = null
      throw error
    })
  return coreModulesPromise
}

let previewRenderer: ReturnType<CoreModules[`initRenderer`]> | null = null

watch(importedPayload, (payload) => {
  if (payload)
    void ensureCoreModules().catch(error => console.error(`[ThemeShare] Failed to load renderer:`, error))
})

const previewHtml = computed(() => {
  const payload = importedPayload.value
  const core = coreModules.value
  if (!payload || !core)
    return ``
  try {
    previewRenderer ??= core.initRenderer({})
    previewRenderer.reset({
      citeStatus: false,
      legend: payload.settings?.legend ?? themeStore.legend,
      countStatus: false,
      isMacCodeBlock: payload.settings?.isMacCodeBlock ?? themeStore.isMacCodeBlock,
      isShowLineNumber: payload.settings?.isShowLineNumber ?? themeStore.isShowLineNumber,
      themeMode: uiStore.isDark ? `dark` : `light`,
    })
    const { html, readingTime } = core.renderMarkdown(getDefaultContent(), previewRenderer)
    return core.postProcessHtml(html, readingTime, previewRenderer)
  }
  catch (error) {
    console.error(`[ThemeShare] Preview render failed:`, error)
    return ``
  }
})

const previewCss = ref(``)

watch([importedPayload, dialogOpen], async ([payload, open]) => {
  if (!payload || !open) {
    previewCss.value = ``
    return
  }
  try {
    const { baseCSSContent, themeMap } = await import(`@md/shared/configs`)
    const { generateCSSVariables, generateHeadingStyles, processCSS, wrapCSSWithScope } = await import(`@md/core/theme`)
    const { scopeThemeCss } = await import(`@/services/export/share-styles`)
    const settings = payload.settings ?? {}
    const variables = {
      primaryColor: settings.primaryColor ?? themeStore.primaryColor,
      fontFamily: settings.fontFamily ?? themeStore.fontFamily,
      fontSize: settings.fontSize ?? themeStore.fontSize,
      lineHeight: settings.lineHeight ?? themeStore.lineHeight,
      blockSpacing: settings.blockSpacing ?? themeStore.blockSpacing,
      linkColor: settings.linkColor ?? themeStore.linkColor,
      blockquoteBackground: settings.blockquoteBackground ?? themeStore.blockquoteBackground,
      isUseIndent: settings.isUseIndent ?? themeStore.isUseIndent,
      isUseJustify: settings.isUseJustify ?? themeStore.isUseJustify,
      headingStyles: settings.headingStyles ?? themeStore.headingStyles,
    }
    const merged = [
      // Scope :root variables to the preview container so imported values
      // don't override the app's live theme while the dialog is open.
      generateCSSVariables(variables).replace(/:root/g, PREVIEW_SCOPE),
      baseCSSContent,
      wrapCSSWithScope(themeMap.default, PREVIEW_SCOPE),
      scopeThemeCss(generateHeadingStyles(variables), PREVIEW_SCOPE),
      wrapCSSWithScope(payload.css, PREVIEW_SCOPE),
    ].filter(Boolean).join(`\n\n`)
    previewCss.value = processCSS(merged)
  }
  catch (error) {
    console.error(`[ThemeShare] Failed to build preview CSS:`, error)
    previewCss.value = ``
  }
}, { immediate: true })

// ---------- Save ----------

function saveImportedTheme() {
  const payload = importedPayload.value
  if (!payload)
    return

  const name = importName.value.trim()
  if (!name) {
    toast.error(t(`cssEditor.schemeNameRequired`))
    return
  }

  // Apply shared render settings to the current theme first so the preview
  // refresh triggered by addCssContentTab picks them up.
  const settings = payload.settings ?? {}
  if (settings.primaryColor !== undefined)
    themeStore.primaryColor = settings.primaryColor
  if (settings.fontFamily !== undefined)
    themeStore.fontFamily = settings.fontFamily
  if (settings.fontSize !== undefined)
    themeStore.fontSize = settings.fontSize
  if (settings.lineHeight !== undefined)
    themeStore.lineHeight = settings.lineHeight
  if (settings.blockSpacing !== undefined)
    themeStore.blockSpacing = settings.blockSpacing
  if (settings.linkColor !== undefined)
    themeStore.linkColor = settings.linkColor
  if (settings.blockquoteBackground !== undefined)
    themeStore.blockquoteBackground = settings.blockquoteBackground
  if (settings.codeBlockTheme !== undefined)
    themeStore.codeBlockTheme = settings.codeBlockTheme
  if (settings.headingStyles !== undefined)
    themeStore.headingStyles = settings.headingStyles
  if (settings.isShowLineNumber !== undefined)
    themeStore.isShowLineNumber = settings.isShowLineNumber
  if (settings.isMacCodeBlock !== undefined)
    themeStore.isMacCodeBlock = settings.isMacCodeBlock
  if (settings.legend !== undefined)
    themeStore.legend = settings.legend
  if (settings.isCiteStatus !== undefined)
    themeStore.isCiteStatus = settings.isCiteStatus
  if (settings.isCountStatus !== undefined)
    themeStore.isCountStatus = settings.isCountStatus
  if (settings.isUseIndent !== undefined)
    themeStore.isUseIndent = settings.isUseIndent
  if (settings.isUseJustify !== undefined)
    themeStore.isUseJustify = settings.isUseJustify

  cssEditorStore.addCssContentTab(name, payload.css)
  toast.success(t(`cssEditor.share.importSuccess`))
  dialogOpen.value = false
}
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent class="md:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>{{ t('cssEditor.share.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('cssEditor.share.description') }}
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="activeTab" class="flex-1 min-h-0 flex flex-col">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="share">
            <Upload class="mr-1.5 size-3.5" /> {{ t('cssEditor.share.tabShare') }}
          </TabsTrigger>
          <TabsTrigger value="import">
            <Download class="mr-1.5 size-3.5" /> {{ t('cssEditor.share.tabImport') }}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="share" class="flex-1 min-h-0 mt-3 flex flex-col gap-3 data-[state=inactive]:hidden">
          <p class="text-xs text-muted-foreground">
            {{ t('cssEditor.share.shareHint') }}
          </p>
          <Textarea
            :model-value="shareText"
            readonly
            class="flex-1 min-h-[160px] font-mono text-xs break-all"
            @focus="($event.target as HTMLTextAreaElement).select()"
          />
          <div class="flex justify-end">
            <Button @click="copyShareText">
              {{ t('cssEditor.share.copyShareText') }}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="import" class="flex-1 min-h-0 mt-3 flex flex-col gap-3 overflow-y-auto data-[state=inactive]:hidden">
          <Textarea
            v-model="importText"
            :placeholder="t('cssEditor.share.importPlaceholder')"
            class="min-h-[96px] font-mono text-xs"
          />
          <p v-if="importErrorText" class="text-xs text-destructive">
            {{ importErrorText }}
          </p>

          <template v-if="importedPayload">
            <div class="space-y-2">
              <label class="text-sm font-medium">{{ t('cssEditor.schemeName') }}</label>
              <Input v-model="importName" :placeholder="t('cssEditor.schemeNamePlaceholder')" />
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium">{{ t('cssEditor.share.previewLabel') }}</label>
              <div class="rounded-lg border bg-background max-h-[320px] overflow-y-auto">
                <component :is="styleTag" v-if="previewCss">
                  {{ previewCss }}
                </component>
                <section
                  v-if="previewHtml"
                  id="theme-share-preview"
                  class="w-full"
                  :lang="CONTENT_FONT_LANG"
                  v-html="previewHtml"
                />
                <div v-else class="flex items-center justify-center h-24 text-sm text-muted-foreground">
                  {{ t('common.loading') }}
                </div>
              </div>
            </div>

            <div class="flex justify-end">
              <Button @click="saveImportedTheme">
                {{ t('cssEditor.share.saveImported') }}
              </Button>
            </div>
          </template>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
