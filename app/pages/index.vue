<script setup lang="ts">
import { useStorage } from '@vueuse/core'

const storedDirectories = useStorage<StoredDirectoryInfo[]>('storedDirectories', () => [])
const overlay = useOverlay()
const toast = useToast()

const currentPathDirectories = reactive<{ name: string, handle: FileSystemDirectoryHandle }[]>([])
const entryItems = ref<EntryItem[]>([])
const loading = ref(false)

const currentPath = computed(() => currentPathDirectories.map((dir) => dir.name).join('/'))
const isHome = computed(() => currentPathDirectories.length === 0)
const filteredEntryItems = computed(() => entryItems.value.filter((item) => item.kind === 'directory' || (item.kind === 'file' && item.name.endsWith('.mp4'))))

async function removeDirectory(id: string) {
  await removeDirectoryHandle(id)
  storedDirectories.value = storedDirectories.value.filter((dir) => dir.id !== id)
}

// 进入指定目录（用户交互触发）
async function enterDirectory(directoryData: StoredDirectoryInfo) {
  loading.value = true
  try {
    const directoryHandle = await getDirectoryHandle(directoryData.id)
    if (directoryHandle && await requestDirectoryPermission(directoryHandle)) {
      currentPathDirectories.push({ name: directoryData.name, handle: directoryHandle })
      entryItems.value = await listDirectoryEntryItems(directoryHandle)
    }
    else {
      // 权限失效，从列表中移除
      await removeDirectory(directoryData.id)

      toast.add({
        title: '目录权限已失效',
        description: '目录权限已失效，已从列表中移除',
        color: 'warning',
      })
    }
  }
  catch (error) {
    console.error('进入目录失败:', error)
    toast.add({
      title: '进入目录失败',
      description: '无法访问该目录，请重新授权',
      color: 'error',
    })
  }
  finally {
    loading.value = false
  }
}

// 进入子目录
async function enterSubDirectory(item: EntryItem) {
  if (item.kind === 'directory') {
    currentPathDirectories.push({ name: item.name, handle: item.handle as FileSystemDirectoryHandle })
    entryItems.value = await listDirectoryEntryItems(item.handle as FileSystemDirectoryHandle)
  }
}

// 返回首页
function goHome() {
  currentPathDirectories.splice(0)
  entryItems.value = []
}

// 选择并添加新目录
async function addNewDirectory() {
  try {
    loading.value = true
    const handle = await window.showDirectoryPicker()

    // 检查是否已经添加过这个目录 - 使用 isSameEntry 方法进行精确比较
    let exists = false
    for (const directoryInfo of storedDirectories.value) {
      const directoryHandle = await getDirectoryHandle(directoryInfo.id)
      if (await isSameEntry(handle, directoryHandle)) {
        exists = true
        break
      }
    }

    if (exists) {
      toast.add({
        title: '目录已存在',
        description: `目录 "${handle.name}" 已经在列表中`,
        color: 'warning',
      })
      return
    }

    // 保存目录
    const handleId = await saveDirectoryHandle(handle)
    storedDirectories.value.push({
      id: handleId,
      name: handle.name,
    })

    toast.add({
      title: '目录添加成功',
      description: `已添加目录: ${handle.name}`,
      color: 'success',
    })
  }
  catch (error: any) {
    if (error.name !== 'AbortError') {
      toast.add({
        title: '添加目录失败',
        description: error.message,
        color: 'error',
      })
    }
  }
  finally {
    loading.value = false
  }
}

// 预览文件
async function previewFileContent(item: EntryItem) {
  if (item.kind === 'directory') {
    return
  }

  try {
    const fileHandle = item.handle as FileSystemFileHandle
    const file = await readFile(fileHandle)

    let previewType = 'unknown'
    let previewContent = ''

    // 判断预览类型
    if (file.type.indexOf('text/') === 0 || isTextFile(item.name)) {
      previewType = 'text'
      previewContent = await file.text()
    }
    else if (file.type.indexOf('image/') === 0) {
      previewType = 'image'
      previewContent = URL.createObjectURL(file)
    }
    else if (file.type.indexOf('video/') === 0) {
      previewType = 'video'
      previewContent = URL.createObjectURL(file)
    }
    else if (file.type.indexOf('audio/') === 0) {
      previewType = 'audio'
      previewContent = URL.createObjectURL(file)
    }
    else if (file.type === 'application/pdf') {
      previewType = 'pdf'
      previewContent = URL.createObjectURL(file)
    }
    else {
      previewType = 'unknown'
      previewContent = ''
    }

    // 动态导入组件并使用 overlay 打开模态框
    const { default: FilePreviewModal } = await import('~/components/file-preview-modal.vue')
    const modal = overlay.create(FilePreviewModal)

    const instance = modal.open({
      file: item,
      content: previewContent,
      type: previewType,
    })

    // 等待模态框关闭，然后清理资源
    await instance.result
    if (previewContent.indexOf('blob:') === 0) {
      URL.revokeObjectURL(previewContent)
    }
  }
  catch (error: any) {
    toast.add({
      title: '预览文件失败',
      description: error.message,
      color: 'error',
    })
  }
}

// 判断是否为文本文件
function isTextFile(filename: string): boolean {
  const textExtensions = ['txt', 'md', 'js', 'ts', 'json', 'html', 'css', 'vue', 'py', 'java', 'cpp', 'c', 'h', 'xml', 'yml', 'yaml']
  const ext = filename.split('.').pop()?.toLowerCase()
  return textExtensions.includes(ext || '')
}

// 下载文件
async function downloadFile(item: EntryItem) {
  if (item.kind === 'directory') {
    return
  }

  try {
    const fileHandle = item.handle as FileSystemFileHandle
    const file = await fileHandle.getFile()
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    a.click()
    URL.revokeObjectURL(url)
    toast.add({
      title: '文件下载已开始',
      color: 'success',
    })
  }
  catch (error: any) {
    toast.add({
      title: '下载文件失败',
      description: error.message,
      color: 'error',
    })
  }
}

// 返回上级目录
async function goBack() {
  if (currentPathDirectories.length === 1) {
    goHome()
    return
  }

  currentPathDirectories.pop()

  entryItems.value = await listDirectoryEntryItems(currentPathDirectories.at(-1)?.handle as FileSystemDirectoryHandle)
}
</script>

<template>
  <div>
    <!-- 浏览器支持提示 -->
    <UAlert
      v-if="!isFileSystemAccessSupported()"
      icon="heroicons:exclamation-triangle"
      color="error"
      variant="soft"
      title="浏览器不支持"
      description="当前浏览器不支持 File System Access API，请使用 Chrome 86+ 或 Edge 86+ 浏览器"
      class="mb-6"
    />
    <template v-else>
      <div v-if="isHome">
        <UCard v-if="storedDirectories.length > 0">
          <template #header>
            <div class="flex justify-between items-center">
              <h2 class="text-lg font-semibold">
                已授权的目录
              </h2>
              <div class="flex justify-between items-center">
                <div class="flex gap-3">
                  <UButton
                    :loading="loading"
                    color="primary"
                    icon="heroicons:plus"
                    @click="addNewDirectory"
                  >
                    添加目录
                  </UButton>
                </div>
              </div>
            </div>
          </template>

          <div class="space-y-3">
            <div
              v-for="directory in storedDirectories"
              :key="directory.id"
              class="flex items-center justify-between p-4 min-h-20 rounded-lg hover:bg-gray-800 transition-colors border border-gray-700 cursor-pointer"
              @click="enterDirectory(directory)"
            >
              <div class="flex items-center text-xl gap-3">
                <UIcon name="heroicons:folder" size="24" />
                <div class="flex items-center space-x-2">
                  <UBadge color="primary" variant="subtle" size="xs">
                    目录
                  </UBadge>
                  <p class="font-mono text-sm truncate text-gray-200">
                    {{ directory.name }}
                  </p>
                </div>
              </div>
              <div class="flex items-center space-x-2">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="heroicons:trash"
                  @click.stop="removeDirectory(directory.id)"
                >
                  移除
                </UButton>
              </div>
            </div>
          </div>
        </UCard>

        <!-- 空状态 -->
        <UCard v-else>
          <div class="py-12 text-center">
            <UIcon name="heroicons:folder" />
            <h3 class="text-lg font-semibold text-gray-300 mb-2">
              还没有授权的目录
            </h3>
            <p class="text-gray-400 mb-6">
              点击"添加目录"按钮来选择并授权一个本地目录
            </p>
            <UButton
              color="primary"
              icon="heroicons:plus"
              @click="addNewDirectory"
            >
              添加第一个目录
            </UButton>
          </div>
        </UCard>
      </div>

      <!-- 目录浏览视图 -->
      <div v-if="!isHome">
        <!-- 文件列表 -->
        <UCard
          class="mb-6"
        >
          <template #header>
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-3">
                <span class="font-mono bg-gray-800 px-3 py-1 rounded border border-gray-700 text-sm text-gray-200">
                  {{ currentPath || '未选择目录' }}
                </span>
              </div>
              <div class="flex justify-between items-center">
                <div class="flex gap-3">
                  <UButton
                    :disabled="loading"
                    variant="outline"
                    icon="heroicons:home"
                    @click="goHome"
                  >
                    返回首页
                  </UButton>
                  <UButton
                    v-if="currentPathDirectories.length > 0"
                    :disabled="loading"
                    variant="outline"
                    icon="heroicons:arrow-left"
                    @click="goBack"
                  >
                    返回上级
                  </UButton>
                </div>
              </div>
            </div>
          </template>

          <div v-if="loading" class="flex justify-center items-center py-12">
            <UIcon name="heroicons:arrow-path" class="animate-spin text-2xl text-primary-500 mr-2" />
            <span class="text-gray-400">加载中...</span>
          </div>

          <div v-else-if="filteredEntryItems.length === 0" class="py-12">
            <div class="text-center">
              <UIcon name="heroicons:folder" />
              <p class="text-gray-400 text-lg">
                该目录下没有视频文件
              </p>
            </div>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in filteredEntryItems"
              :key="item.name"
              class="flex items-center justify-between p-4 min-h-20 rounded-lg hover:bg-gray-800 transition-colors border border-gray-700"
              :class="{ 'cursor-pointer': item.kind === 'directory' }"
              @click="item.kind === 'directory' ? enterSubDirectory(item) : null"
            >
              <div class="flex items-center min-w-0 flex-1 gap-3">
                <UIcon v-if="item.kind === 'directory'" name="heroicons:folder" size="24" />
                <UIcon v-if="item.kind === 'file'" name="heroicons:film" size="24" />
                <div class="flex flex-col min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <UBadge :color="item.kind === 'directory' ? 'primary' : 'neutral'" variant="subtle" size="xs">
                      {{ item.kind === 'directory' ? '目录' : '文件' }}
                    </UBadge>
                    <p class="font-mono text-sm truncate text-gray-200">
                      {{ item.name }}
                    </p>
                  </div>
                  <div v-if="item.kind === 'file'" class="flex items-center space-x-4 text-xs text-gray-400 mt-1">
                    <span v-if="item.size !== undefined">
                      {{ formatFileSize(item.size) }}
                    </span>
                    <span v-if="item.lastModified">
                      {{ item.lastModified.toLocaleDateString() }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="flex items-center space-x-2 flex-shrink-0">
                <UButton
                  v-if="item.kind === 'file'"
                  size="xs"
                  variant="ghost"
                  icon="heroicons:eye"
                  @click.stop="previewFileContent(item)"
                >
                  预览
                </UButton>
                <UButton
                  v-if="item.kind === 'file'"
                  size="xs"
                  variant="ghost"
                  color="success"
                  icon="heroicons:arrow-down-tray"
                  @click.stop="downloadFile(item)"
                >
                  下载
                </UButton>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
