<script setup lang="ts">
import type { ThemeShareErrorReason, ThemeSharePayload } from '@/lib/theme-share'
import { generateCSSVariables, generateHeadingStyles, processCSS, wrapCSSWithScope } from '@md/core/theme'
import { baseCSSContent, isBuiltinThemeName, themeMap } from '@md/shared/configs'
import { isMarketplaceThemeKey } from '@md/shared/types'
import { getDefaultContent } from '@/assets/example/default-content'
import { CONTENT_FONT_LANG } from '@/i18n/constants'
import { copyPlain } from '@/lib/browser/clipboard'
import { decodeThemeShare, encodeThemeShare, ThemeShareError } from '@/lib/theme-share'
import { useCssEditorStore } from '@/stores/cssEditor'
import { useMarketplaceStore } from '@/stores/marketplace'
import { useThemeStore } from '@/stores/theme'
import { useUIStore } from '@/stores/ui'

const props = defineProps<{
  open: boolean
  mode: `share` | `import`
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'imported': []
}>()

const { t } = useI18n()
const themeStore = useThemeStore()
const cssEditorStore = useCssEditorStore()
const uiStore = useUIStore()
const { isDark } = storeToRefs(uiStore)

const dialogOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit(`update:open`, value),
})

// -----------------------------------------------------------------------
// Share
// -----------------------------------------------------------------------
const shareText = computed(() => {
  if (!props.open || props.mode !== `share`)
    return ``
  const tab = cssEditorStore.getCurrentTab()
  const payload: ThemeSharePayload = {
    version: 1,
    name: tab.title || tab.name,
    css: tab.content,
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
    },
    options: {
      isCiteStatus: themeStore.isCiteStatus,
      isCountStatus: themeStore.isCountStatus,
      isUseIndent: themeStore.isUseIndent,
      isUseJustify: themeStore.isUseJustify,
      legend: themeStore.legend,
    },
  }
  return encodeThemeShare(payload)
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

// -----------------------------------------------------------------------
// Import
// -----------------------------------------------------------------------
const importInput = ref(``)
const importName = ref(``)
const decodedPayload = ref<ThemeSharePayload | null>(null)
const importError = ref<ThemeShareErrorReason | null>(null)

const importErrorText = computed(() => {
  void props.open
  if (!importError.value)
    return ``
  return t(`cssEditor.shareError.${importError.value}`)
})

watch(importInput, (value) => {
  if (!value.trim()) {
    decodedPayload.value = null
    importError.value = null
    return
  }
  try {
    const payload = decodeThemeShare(value)
    decodedPayload.value = payload
    importError.value = null
    importName.value = payload.name
  }
  catch (error) {
    decodedPayload.value = null
    importError.value = error instanceof ThemeShareError ? error.reason : `invalidFormat`
  }
})

watch(dialogOpen, (open) => {
  if (open)
    return
  importInput.value = ``
  importName.value = ``
  decodedPayload.value = null
  importError.value = null
})

// -----------------------------------------------------------------------
// Import preview (isolated renderer, mirrors the post history preview)
// -----------------------------------------------------------------------
const PREVIEW_SCOPE = `#theme-share-preview-output`
const styleTag = `style` as const

interface CoreModules {
  initRenderer: (typeof import('@md/core/renderer'))[`initRenderer`]
  renderMarkdown: (typeof import('@md/core/utils'))[`renderMarkdown`]
  postProcessHtml: (typeof import('@md/core/utils'))[`postProcessHtml`]
}

const coreModules = shallowRef<CoreModules | null>(null)
let coreModulesPromise: Promise<CoreModules> | null = null

function ensureCoreModules(): Promise<CoreModules> {
  coreModulesPromise ??= Promise.all([import('@md/core/renderer'), import('@md/core/utils')])
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

watch([decodedPayload, dialogOpen], ([payload, open]) => {
  if (open && payload)
    void ensureCoreModules().catch(error => console.error(`[ThemeShare] Failed to load renderer:`, error))
}, { immediate: true })

function resolveBaseThemeCss(): string {
  const theme = themeStore.theme
  if (isMarketplaceThemeKey(theme)) {
    const marketplaceCss = useMarketplaceStore().getInstalledThemeCss(theme)
    if (marketplaceCss)
      return `${themeMap.default}\n\n${marketplaceCss}`
    return themeMap.default
  }
  if (theme !== `default` && isBuiltinThemeName(theme))
    return `${themeMap.default}\n\n${themeMap[theme]}`
  return themeMap.default
}

const previewCss = computed(() => {
  const payload = decodedPayload.value
  if (!payload || !dialogOpen.value)
    return ``
  const settings = payload.settings ?? {}
  const options = payload.options ?? {}
  const variableConfig = {
    primaryColor: settings.primaryColor ?? themeStore.primaryColor,
    fontFamily: settings.fontFamily ?? themeStore.fontFamily,
    fontSize: settings.fontSize ?? themeStore.fontSize,
    lineHeight: settings.lineHeight ?? themeStore.lineHeight,
    blockSpacing: settings.blockSpacing ?? themeStore.blockSpacing,
    linkColor: settings.linkColor ?? themeStore.linkColor,
    blockquoteBackground: settings.blockquoteBackground ?? themeStore.blockquoteBackground,
    isUseIndent: options.isUseIndent ?? themeStore.isUseIndent,
    isUseJustify: options.isUseJustify ?? themeStore.isUseJustify,
    headingStyles: settings.headingStyles ?? themeStore.headingStyles,
  }
  const variablesCSS = generateCSSVariables(variableConfig).replace(/#output/g, PREVIEW_SCOPE)
  const headingCSS = generateHeadingStyles(variableConfig)
  const scopedThemeCSS = wrapCSSWithScope(resolveBaseThemeCss(), PREVIEW_SCOPE)
  const scopedCustomCSS = payload.css.trim() ? wrapCSSWithScope(payload.css, PREVIEW_SCOPE) : ``
  return processCSS([variablesCSS, baseCSSContent, scopedThemeCSS, headingCSS, scopedCustomCSS].filter(Boolean).join(`\n\n`))
})

const previewHtml = computed(() => {
  const payload = decodedPayload.value
  const core = coreModules.value
  if (!payload || !core || !dialogOpen.value)
    return ``
  const options = payload.options ?? {}
  try {
    if (!previewRenderer)
      previewRenderer = core.initRenderer({})
    previewRenderer.reset({
      citeStatus: options.isCiteStatus ?? themeStore.isCiteStatus,
      legend: options.legend ?? themeStore.legend,
      countStatus: options.isCountStatus ?? themeStore.isCountStatus,
      isMacCodeBlock: payload.settings?.isMacCodeBlock ?? themeStore.isMacCodeBlock,
      isShowLineNumber: payload.settings?.isShowLineNumber ?? themeStore.isShowLineNumber,
      themeMode: isDark.value ? `dark` : `light`,
      diagramMessages: {
        mermaidLoading: t(`store.diagram.mermaidLoading`),
        mermaidError: t(`store.diagram.mermaidError`),
        plantumlLoading: t(`store.diagram.plantumlLoading`),
        plantumlError: t(`store.diagram.plantumlError`),
        infographicLoading: t(`store.diagram.infographicLoading`),
        infographicError: t(`store.diagram.infographicError`),
      },
      countMessages: {
        summary: t(`store.count.summary`, { words: `{words}`, minutes: `{minutes}` }),
      },
      renderMessages: {
        footnoteTitle: t(`store.render.footnoteTitle`),
        unknownComponent: t(`store.render.unknownComponent`),
        katexLoading: t(`store.render.katexLoading`),
      },
    })
    const { html, readingTime } = core.renderMarkdown(getDefaultContent(), previewRenderer)
    return core.postProcessHtml(html, readingTime, previewRenderer)
  }
  catch (error) {
    console.error(`[ThemeShare] Preview render failed:`, error)
    return ``
  }
})

function saveImportedTheme() {
  const payload = decodedPayload.value
  const name = importName.value.trim()
  if (!payload)
    return
  if (!name) {
    toast.error(t(`cssEditor.createNameFailed`))
    return
  }

  cssEditorStore.addCssContentTab(name, payload.css)

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

  const options = payload.options ?? {}
  if (options.isCiteStatus !== undefined)
    themeStore.isCiteStatus = options.isCiteStatus
  if (options.isCountStatus !== undefined)
    themeStore.isCountStatus = options.isCountStatus
  if (options.isUseIndent !== undefined)
    themeStore.isUseIndent = options.isUseIndent
  if (options.isUseJustify !== undefined)
    themeStore.isUseJustify = options.isUseJustify
  if (options.legend !== undefined)
    themeStore.legend = options.legend

  emit(`imported`)
  dialogOpen.value = false
  toast.success(t(`cssEditor.importSuccess`))
}
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ mode === 'share' ? t('cssEditor.shareThemeTitle') : t('cssEditor.importThemeTitle') }}</DialogTitle>
        <DialogDescription>
          {{ mode === 'share' ? t('cssEditor.shareThemeDescription') : t('cssEditor.importThemeDescription') }}
        </DialogDescription>
      </DialogHeader>

      <template v-if="mode === 'share'">
        <Textarea :model-value="shareText" readonly class="h-40 font-mono text-xs" @focus="($event.target as HTMLTextAreaElement).select()" />
        <DialogFooter>
          <Button @click="copyShareText">
            {{ t('cssEditor.copyShareText') }}
          </Button>
        </DialogFooter>
      </template>

      <template v-else>
        <Textarea
          v-model="importInput"
          :placeholder="t('cssEditor.shareTextPlaceholder')"
          class="h-28 font-mono text-xs"
        />
        <p v-if="importErrorText" class="text-sm text-destructive">
          {{ importErrorText }}
        </p>

        <template v-if="decodedPayload">
          <div class="flex items-center gap-2">
            <Label class="shrink-0">{{ t('cssEditor.themeName') }}</Label>
            <Input v-model="importName" :placeholder="t('cssEditor.schemeNamePlaceholder')" />
          </div>

          <div class="rounded-lg border bg-background overflow-hidden">
            <div class="border-b px-3 py-1.5 text-xs text-muted-foreground">
              {{ t('cssEditor.importPreview') }}
            </div>
            <div class="theme-share-preview-wrapper h-[40vh] overflow-y-auto overflow-x-hidden">
              <div class="preview mx-auto">
                <component :is="styleTag" v-if="previewCss">
                  {{ previewCss }}
                </component>
                <section
                  :id="PREVIEW_SCOPE.slice(1)"
                  class="w-full"
                  :lang="CONTENT_FONT_LANG"
                  v-html="previewHtml"
                />
              </div>
            </div>
          </div>
        </template>

        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">
            {{ t('common.cancel') }}
          </Button>
          <Button :disabled="!decodedPayload" @click="saveImportedTheme">
            {{ t('cssEditor.saveAsTheme') }}
          </Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>

<style>
/* Mirrors .preview from app.less so the import preview matches the real output. */
.theme-share-preview-wrapper .preview {
  position: relative;
  min-height: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 20px;
  font-size: 14px;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.theme-share-preview-wrapper .preview svg {
  max-width: 100%;
}

.theme-share-preview-wrapper .preview table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}
</style>
