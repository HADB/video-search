<script setup lang="ts">
import type { SceneAnalysisResultsMap, VideoAnalysisResult } from '../../shared/types'
import { useStorage } from '@vueuse/core'
import { ALL_FORMATS, BlobSource, Input, Mp4OutputFormat, Output, StreamTarget, VideoSample, VideoSampleSink, VideoSampleSource } from 'mediabunny'

const storedDirectories = useStorage<StoredDirectoryInfo[]>('storedDirectories', () => [])
const overlay = useOverlay()
const toast = useToast()

const currentPathDirectories = reactive<{ name: string, handle: FileSystemDirectoryHandle }[]>([])
const entryItems = ref<EntryItem[]>([])
const loading = ref(false)
const detectingScenesLoading = ref(false)

// 分镜分析结果存储
const sceneAnalysisResults = ref<SceneAnalysisResultsMap>({})

const currentPath = computed(() => currentPathDirectories.map((dir) => dir.name).join('/'))
const isHome = computed(() => currentPathDirectories.length === 0)
const filteredEntryItems = computed(() => entryItems.value.filter((item) => item.kind === 'directory' || (item.kind === 'file' && item.name.endsWith('.mp4'))))

// 获取当前目录下所有视频的分镜分析结果
const currentDirectorySceneResults = computed(() => {
  const videoNames = filteredEntryItems.value
    .filter((item) => item.kind === 'file' && item.name.endsWith('.mp4'))
    .map((item) => item.name)

  return Object.entries(sceneAnalysisResults.value)
    .filter(([videoName]) => videoNames.includes(videoName))
    .reduce((acc, [videoName, result]) => {
      acc[videoName] = result
      return acc
    }, {} as SceneAnalysisResultsMap)
})

// 检查是否有分镜分析结果
const hasSceneAnalysisResults = computed(() => Object.keys(currentDirectorySceneResults.value).length > 0)

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
  // 清理当前目录的分镜分析结果中的 blob URLs
  cleanupSceneAnalysisResults()
}

// 清理分镜分析结果中的 blob URLs
function cleanupSceneAnalysisResults() {
  Object.values(sceneAnalysisResults.value).forEach((result) => {
    result.sceneChanges.forEach((scene) => {
      if (scene.frameImageUrl) {
        URL.revokeObjectURL(scene.frameImageUrl)
      }
    })
  })
  sceneAnalysisResults.value = {}
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

async function detectScenes() {
  if (detectingScenesLoading.value) {
    return
  }

  detectingScenesLoading.value = true

  try {
    const videoFileEntryItems = filteredEntryItems.value.filter((item) => item.kind === 'file' && item.name.endsWith('.mp4'))

    if (videoFileEntryItems.length === 0) {
      toast.add({
        title: '没有视频文件',
        description: '当前目录中没有找到 MP4 视频文件',
        color: 'warning',
      })
      return
    }

    // 动态导入分镜检测工具
    const { createVideoFrameSceneDetector, formatTimestamp } = await import('~/utils/video-analysis')

    toast.add({
      title: '开始分析',
      description: `开始分析 ${videoFileEntryItems.length} 个视频文件的分镜`,
      color: 'info',
    })

    for (const item of videoFileEntryItems) {
      console.log(`开始分析视频: ${item.name}`)

      try {
        const fileHandle = item.handle as FileSystemFileHandle
        const file = await readFile(fileHandle)
        const blobSource = new BlobSource(file)
        const input = new Input({ source: blobSource, formats: ALL_FORMATS })
        const videoTrack = await input.getPrimaryVideoTrack()

        if (!videoTrack) {
          console.warn(`无法获取视频轨道: ${item.name}`)
          toast.add({
            title: '跳过文件',
            description: `${item.name}: 无法获取视频轨道`,
            color: 'warning',
          })
          continue
        }

        const videoSampleSink = new VideoSampleSink(videoTrack)

        // 创建分镜检测器
        const sceneDetector = createVideoFrameSceneDetector({
          threshold: 0.3,
          sampleInterval: 1.0,
          scaledSize: 128,
        })

        let totalFrames = 0

        // 处理每个视频样本
        for await (const sample of videoSampleSink.samples()) {
          const videoFrame = sample.toVideoFrame()

          // 检测分镜切换（现在是异步的）
          const result = await sceneDetector.processFrame(videoFrame, sample.timestamp)

          if (result.isSceneChange) {
            console.log(`检测到分镜切换: ${item.name} 时间点: ${formatTimestamp(sample.timestamp)}`)
          }

          totalFrames++

          // 释放 VideoFrame 资源
          videoFrame.close()

          // 可选：每隔一定数量的帧输出进度
          if (totalFrames % 100 === 0) {
            const stats = sceneDetector.getStats()
            console.log(`处理进度: ${item.name} - 已处理 ${totalFrames} 帧，检测到 ${stats.scenesDetected} 个分镜`)
          }
        }

        // 获取最终结果
        const sceneChanges = sceneDetector.getSceneChanges()
        console.log(`分析完成: ${item.name}`)
        console.log(`总帧数: ${totalFrames}`)
        console.log(`检测到的分镜数: ${sceneChanges.length}`)
        console.log('分镜时间点:', sceneChanges.map((scene) => formatTimestamp(scene.timestamp)))

        // 保存分析结果
        const analysisResult: VideoAnalysisResult = {
          videoName: item.name,
          timestamp: new Date().toISOString(),
          totalScenes: sceneChanges.length, // 现在包含第一个分镜，不需要+1
          sceneChanges: sceneChanges.map((scene) => ({
            ...scene,
            formattedTime: formatTimestamp(scene.timestamp),
          })),
          options: {
            threshold: 0.3,
            sampleInterval: 1.0,
            scaledSize: 128,
          },
          fileHandle: item.handle as FileSystemFileHandle,
        }

        sceneAnalysisResults.value[item.name] = analysisResult

        // 显示结果通知
        toast.add({
          title: '分镜分析完成',
          description: `${item.name}: 检测到 ${sceneChanges.length} 个分镜切换点`,
          color: 'success',
        })
      }
      catch (error) {
        console.error(`分析视频失败: ${item.name}`, error)
        toast.add({
          title: '分析失败',
          description: `${item.name}: ${error instanceof Error ? error.message : '未知错误'}`,
          color: 'error',
        })
      }
    }

    toast.add({
      title: '全部分析完成',
      description: '所有视频文件的分镜分析已完成',
      color: 'success',
    })
  }
  finally {
    detectingScenesLoading.value = false
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

  // 清理当前目录的分镜分析结果
  cleanupSceneAnalysisResults()

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
                  <UInput
                    placeholder="搜索分镜"
                    clearable
                    icon="heroicons:magnifying-glass"
                    class="min-w-[200px]"
                  />
                  <UButton
                    :disabled="loading"
                    variant="outline"
                    icon="heroicons:home"
                    @click="goHome"
                  >
                    返回首页
                  </UButton>
                  <UButton
                    :disabled="loading"
                    variant="outline"
                    icon="heroicons:arrow-left"
                    @click="goBack"
                  >
                    返回上级
                  </UButton>
                  <UButton
                    :disabled="loading || detectingScenesLoading"
                    :loading="detectingScenesLoading"
                    variant="outline"
                    color="primary"
                    icon="heroicons:document-magnifying-glass"
                    @click="detectScenes"
                  >
                    {{ detectingScenesLoading ? '分析中...' : '识别分镜' }}
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

        <!-- 分镜分析结果展示 -->
        <UCard v-if="hasSceneAnalysisResults" class="mt-6">
          <template #header>
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-semibold text-gray-200">
                分镜分析结果
              </h3>
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="heroicons:trash"
                @click="cleanupSceneAnalysisResults"
              >
                清除结果
              </UButton>
            </div>
          </template>

          <div class="space-y-6">
            <div
              v-for="(result, videoName) in currentDirectorySceneResults"
              :key="videoName"
              class="border border-gray-700 rounded-lg p-4"
            >
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                  <UIcon name="heroicons:film" size="20" />
                  <h4 class="font-medium text-gray-200">
                    {{ videoName }}
                  </h4>
                  <UBadge color="primary" variant="subtle" size="xs">
                    {{ result.totalScenes }} 个分镜
                  </UBadge>
                </div>
                <div class="text-xs text-gray-400">
                  {{ new Date(result.timestamp).toLocaleString() }}
                </div>
              </div>

              <div v-if="result.sceneChanges.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                <div
                  v-for="(scene, index) in result.sceneChanges"
                  :key="index"
                  class="group relative border border-gray-600 rounded-lg overflow-hidden hover:border-primary-500 transition-colors"
                >
                  <div class="aspect-video bg-gray-800 flex items-center justify-center">
                    <img
                      v-if="scene.frameImageUrl"
                      :src="scene.frameImageUrl"
                      :alt="`分镜 ${index + 1} - ${scene.formattedTime}`"
                      class="w-full h-full object-cover"
                      loading="lazy"
                    >
                    <div v-else class="text-gray-500 text-sm">
                      <UIcon name="heroicons:photo" size="24" />
                    </div>
                  </div>

                  <div class="flex items-end gap-2 absolute bottom-0 left-0 h-1/3 w-full bg-gradient-to-b from-transparent to-black/80 text-white text-xs p-2">
                    <div class="font-medium">
                      {{ scene.formattedTime }}
                    </div>
                    <div class="font-medium text-gray-300">
                      分镜 {{ index + 1 }}
                    </div>
                  </div>

                  <!-- 悬停时显示更多信息 -->
                  <div class="absolute inset-0 bg-black/80 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div class="text-white text-center">
                      <div class="text-sm font-medium">
                        差异度: {{ Math.round(scene.score * 100) }}%
                      </div>
                      <div class="text-xs">
                        帧索引: {{ scene.frameIndex }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else class="text-center py-8 text-gray-400">
                <UIcon name="heroicons:exclamation-circle" size="24" />
                <p class="mt-2">
                  未检测到分镜切换
                </p>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
