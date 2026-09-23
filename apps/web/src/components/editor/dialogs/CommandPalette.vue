<script setup lang="ts">
import type { PaletteCommand } from '@/composables/useCommandPalette'
import { FileText, Search } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { useUIStore } from '@/stores/ui'

interface PaletteEntry {
  key: string
  kind: `command` | `post`
  group: string
  label: string
  shortcut?: string[]
  command?: PaletteCommand
  postId?: string
}

const { t, locale } = useI18n()
const uiStore = useUIStore()
const { isShowCommandPalette } = storeToRefs(uiStore)
const {
  buildCommands,
  recordCommandUsage,
  getRecentCommands,
  searchPosts,
  openPost,
} = useCommandPalette()

const query = ref(``)
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const scrollContainerRef = ref<HTMLDivElement | null>(null)

const allCommands = computed(() => {
  void locale.value
  return buildCommands()
})

const filteredCommands = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q)
    return allCommands.value

  return allCommands.value.filter((cmd) => {
    if (cmd.label.toLowerCase().includes(q))
      return true
    if (cmd.group.toLowerCase().includes(q))
      return true
    return cmd.keywords.some(k => k.toLowerCase().includes(q))
  })
})

const matchedPosts = computed(() => searchPosts(query.value))

const isSearching = computed(() => query.value.trim().length > 0)

const groupedEntries = computed(() => {
  const groups = new Map<string, PaletteEntry[]>()
  const push = (entry: PaletteEntry) => {
    const list = groups.get(entry.group) ?? []
    list.push(entry)
    groups.set(entry.group, list)
  }

  // Recent commands lead the palette on an empty query; while searching they
  // stay visible when they match the filter.
  const recent = getRecentCommands(filteredCommands.value)
  if (recent.length) {
    for (const cmd of recent)
      push({ key: `recent:${cmd.id}`, kind: `command`, group: t(`commandPalette.recent`), label: cmd.label, shortcut: cmd.shortcut, command: cmd })
  }

  for (const cmd of filteredCommands.value) {
    // Recent entries lead the list; skip them in their regular group.
    if (recent.some(r => r.id === cmd.id))
      continue
    push({ key: `cmd:${cmd.id}`, kind: `command`, group: cmd.group, label: cmd.label, shortcut: cmd.shortcut, command: cmd })
  }

  if (isSearching.value) {
    for (const post of matchedPosts.value)
      push({ key: `post:${post.id}`, kind: `post`, group: t(`commandPalette.group.posts`), label: post.title, postId: post.id })
  }

  return [...groups.entries()]
})

const flatEntries = computed(() => groupedEntries.value.flatMap(([, entries]) => entries))

watch(isShowCommandPalette, (open) => {
  if (open) {
    query.value = ``
    activeIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  }
})

watch(flatEntries, () => {
  if (activeIndex.value >= flatEntries.value.length)
    activeIndex.value = 0
})

watch(query, () => {
  activeIndex.value = 0
})

watch(activeIndex, () => {
  nextTick(() => {
    const container = scrollContainerRef.value
    if (!container)
      return
    const activeEl = container.querySelector('[data-active="true"]')
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  })
})

function close() {
  uiStore.toggleShowCommandPalette(false)
}

function waitForDismissLayer() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

async function runCommand(cmd: PaletteCommand) {
  recordCommandUsage(cmd.id)
  close()
  await nextTick()
  await waitForDismissLayer()
  await cmd.action()
}

async function openPostEntry(postId: string) {
  close()
  await nextTick()
  openPost(postId)
}

function runEntry(entry: PaletteEntry) {
  if (entry.kind === `post` && entry.postId)
    void openPostEntry(entry.postId)
  else if (entry.command)
    void runCommand(entry.command)
}

function getFlatIndex(groupIdx: number, entryIdx: number) {
  let index = 0
  for (let i = 0; i < groupIdx; i++)
    index += groupedEntries.value[i][1].length
  return index + entryIdx
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === `Escape`) {
    event.stopPropagation()
    close()
    return
  }

  const count = flatEntries.value.length

  if (event.key === `ArrowDown`) {
    event.preventDefault()
    if (count > 0)
      activeIndex.value = (activeIndex.value + 1) % count
  }
  else if (event.key === `ArrowUp`) {
    event.preventDefault()
    if (count > 0)
      activeIndex.value = (activeIndex.value - 1 + count) % count
  }
  else if (event.key === `Enter`) {
    event.preventDefault()
    const entry = flatEntries.value[activeIndex.value]
    if (entry)
      runEntry(entry)
  }
}

function isActive(groupIdx: number, entryIdx: number) {
  return activeIndex.value === getFlatIndex(groupIdx, entryIdx)
}
</script>

<template>
  <Dialog :open="isShowCommandPalette" @update:open="(v) => !v && close()">
    <DialogContent
      class="top-[18%] max-h-[min(70vh,32rem)] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
    >
      <DialogHeader class="sr-only">
        <DialogTitle>{{ t('commandPalette.title') }}</DialogTitle>
        <DialogDescription>{{ t('commandPalette.description') }}</DialogDescription>
      </DialogHeader>

      <div class="flex items-center gap-2 border-b px-3 py-2.5">
        <Search class="size-4 shrink-0 text-muted-foreground" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          class="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          :placeholder="t('commandPalette.searchPlaceholder')"
          @keydown="onKeydown"
        >
      </div>

      <div ref="scrollContainerRef" class="max-h-[min(52vh,24rem)] overflow-y-auto p-1">
        <template v-if="groupedEntries.length">
          <template v-for="([group, entries], groupIdx) in groupedEntries" :key="group">
            <p class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {{ group }}
            </p>
            <button
              v-for="(entry, entryIdx) in entries"
              :key="entry.key"
              type="button"
              class="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors"
              :class="isActive(groupIdx, entryIdx) ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'"
              :data-active="isActive(groupIdx, entryIdx)"
              @mouseenter="activeIndex = getFlatIndex(groupIdx, entryIdx)"
              @click="runEntry(entry)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <FileText v-if="entry.kind === 'post'" class="size-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate">{{ entry.label }}</span>
              </span>
              <span v-if="entry.shortcut?.length" class="flex items-center gap-0.5 text-xs text-muted-foreground">
                <kbd
                  v-for="key in entry.shortcut"
                  :key="key"
                  class="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {{ key }}
                </kbd>
              </span>
            </button>
          </template>
        </template>
        <p v-else class="px-3 py-8 text-center text-sm text-muted-foreground">
          {{ t('commandPalette.noMatch') }}
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
