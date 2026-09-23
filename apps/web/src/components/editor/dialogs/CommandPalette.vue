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
import { usePostStore } from '@/stores/post'
import { useUIStore } from '@/stores/ui'

interface PaletteItem {
  kind: `command` | `post`
  id: string
  label: string
  shortcut?: string[]
  command?: PaletteCommand
  postId?: string
}

interface PaletteGroup {
  key: string
  label: string
  items: PaletteItem[]
}

const { t, locale } = useI18n()
const uiStore = useUIStore()
const postStore = usePostStore()
const { isShowCommandPalette, recentCommandIds } = storeToRefs(uiStore)
const { buildCommands } = useCommandPalette()

const query = ref(``)
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const scrollContainerRef = ref<HTMLDivElement | null>(null)

const allCommands = computed(() => {
  void locale.value
  return buildCommands()
})

const recentCommands = computed(() => {
  const byId = new Map(allCommands.value.map(cmd => [cmd.id, cmd]))
  return recentCommandIds.value
    .map(id => byId.get(id))
    .filter((cmd): cmd is PaletteCommand => !!cmd)
})

const filteredCommands = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q)
    return allCommands.value

  const matched = allCommands.value.filter((cmd) => {
    if (cmd.label.toLowerCase().includes(q))
      return true
    if (cmd.group.toLowerCase().includes(q))
      return true
    return cmd.keywords.some(k => k.toLowerCase().includes(q))
  })

  // Recently used commands float to the top of the filtered list.
  const recentSet = new Set(recentCommandIds.value)
  return matched.sort((a, b) => Number(recentSet.has(b.id)) - Number(recentSet.has(a.id)))
})

const matchedPosts = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q)
    return []
  return postStore.posts
    .filter(post => post.title.toLowerCase().includes(q))
    .slice(0, 5)
})

const displayGroups = computed<PaletteGroup[]>(() => {
  const groups: PaletteGroup[] = []
  const q = query.value.trim()

  if (!q && recentCommands.value.length) {
    groups.push({
      key: `recent`,
      label: t(`commandPalette.group.recent`),
      items: recentCommands.value.map(cmd => ({
        kind: `command`,
        id: `recent-${cmd.id}`,
        label: cmd.label,
        shortcut: cmd.shortcut,
        command: cmd,
      })),
    })
  }

  const commandGroups = new Map<string, PaletteItem[]>()
  for (const cmd of filteredCommands.value) {
    const list = commandGroups.get(cmd.group) ?? []
    list.push({ kind: `command`, id: cmd.id, label: cmd.label, shortcut: cmd.shortcut, command: cmd })
    commandGroups.set(cmd.group, list)
  }
  for (const [group, items] of commandGroups)
    groups.push({ key: `cmd-${group}`, label: group, items })

  if (matchedPosts.value.length) {
    groups.push({
      key: `posts`,
      label: t(`commandPalette.group.posts`),
      items: matchedPosts.value.map(post => ({
        kind: `post`,
        id: `post-${post.id}`,
        label: post.title,
        postId: post.id,
      })),
    })
  }

  return groups
})

const flatItems = computed(() => displayGroups.value.flatMap(group => group.items))

watch(isShowCommandPalette, (open) => {
  if (open) {
    query.value = ``
    activeIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  }
})

watch(flatItems, () => {
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
  uiStore.recordCommandUsage(cmd.id)
  close()
  await nextTick()
  await waitForDismissLayer()
  await cmd.action()
}

function openPost(postId: string) {
  postStore.currentPostId = postId
  close()
}

function runItem(item: PaletteItem) {
  if (item.kind === `post` && item.postId) {
    openPost(item.postId)
    return
  }
  if (item.command)
    void runCommand(item.command)
}

function getFlatIndex(groupIdx: number, itemIdx: number) {
  let index = 0
  for (let i = 0; i < groupIdx; i++)
    index += displayGroups.value[i].items.length
  return index + itemIdx
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === `Escape`) {
    event.stopPropagation()
    close()
    return
  }

  const count = flatItems.value.length

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
    const item = flatItems.value[activeIndex.value]
    if (item)
      runItem(item)
  }
}

function isActive(groupIdx: number, itemIdx: number) {
  return activeIndex.value === getFlatIndex(groupIdx, itemIdx)
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
        <template v-if="displayGroups.length">
          <template v-for="(group, groupIdx) in displayGroups" :key="group.key">
            <p class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {{ group.label }}
            </p>
            <button
              v-for="(item, itemIdx) in group.items"
              :key="item.id"
              type="button"
              class="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors"
              :class="isActive(groupIdx, itemIdx) ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'"
              :data-active="isActive(groupIdx, itemIdx)"
              @mouseenter="activeIndex = getFlatIndex(groupIdx, itemIdx)"
              @click="runItem(item)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <FileText v-if="item.kind === 'post'" class="size-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate">{{ item.label }}</span>
              </span>
              <span v-if="item.shortcut?.length" class="flex items-center gap-0.5 text-xs text-muted-foreground">
                <kbd
                  v-for="key in item.shortcut"
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
