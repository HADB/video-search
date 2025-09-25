<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny'

const storedDirectories = useStorage<StoredDirectoryInfo[]>('storedDirectories', () => [])
// 持久化存储分镜分析结果（按目录路径组织）
const storedSceneAnalysisResults = useStorage<Record<string, Record<string, any>>>('sceneAnalysisResults', () => ({}))
const overlay = useOverlay()
const toast = useToast()

const currentPathDirectories = reactive<{ name: string, handle: FileSystemDirectoryHandle }[]>([])
const entryItems = ref<EntryItem[]>([])
const loading = ref(false)
const detectingScenesLoading = ref(false)

// 分镜识别进度相关状态
const detectionProgress = ref({
  currentVideoIndex: 0,
  totalVideos: 0,
  currentVideoName: '',
  currentVideoDuration: 0,
  currentVideoProgress: 0,
  processedFrames: 0,
  // 初始化相关字段
  isInitializing: false,
  initializationMessage: '',
  initializationStartTime: 0,
  // 新增性能统计字段
  startTime: 0,
  currentTime: 0,
  elapsedTime: 0,
  averageFPS: 0,
  totalProcessedFrames: 0,
})

// 分镜分析结果存储
const sceneAnalysisResults = ref<SceneAnalysisResultsMap>({})

// 分镜搜索相关状态
const searchQuery = ref('')
const searchResults = ref<Array<{
  videoName: string
  scene: SceneChangePoint
  similarity: number
  sceneIndex: number
}>>([])
const isSearching = ref(false)
const hasSearched = ref(false)
const isModelLoading = ref(false)

const currentPath = computed(() => currentPathDirectories.map((dir) => dir.name).join('/'))
const currentDirectoryKey = computed(() => {
  if (currentPathDirectories.length === 0) {
    return ''
  }
  return currentPathDirectories.map((dir) => dir.name).join('/')
})
const isHome = computed(() => currentPathDirectories.length === 0)

// 是否显示搜索结果框（搜索开始后就显示）
const showSearchResultsCard = computed(() => hasSearched.value)

// 计算分镜识别的总体进度百分比
const detectionProgressPercentage = computed(() => {
  if (!detectingScenesLoading.value || detectionProgress.value.totalVideos === 0) {
    return 0
  }

  // 已完成视频的进度
  const completedVideosProgress = detectionProgress.value.currentVideoIndex / detectionProgress.value.totalVideos

  // 当前视频的进度（基于时长）
  const currentVideoWeight = 1 / detectionProgress.value.totalVideos
  const currentVideoProgressWeight = detectionProgress.value.currentVideoProgress * currentVideoWeight

  const totalProgress = completedVideosProgress + currentVideoProgressWeight

  return Math.min(Math.round(totalProgress * 100), 100)
})

// 格式化耗时显示
const formattedElapsedTime = computed(() => {
  const elapsedSeconds = detectionProgress.value.elapsedTime
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds.toFixed(1)}秒`
  }
  else {
    const minutes = Math.floor(elapsedSeconds / 60)
    const seconds = Math.floor(elapsedSeconds % 60)
    return `${minutes}分${seconds}秒`
  }
})

// 格式化平均FPS显示
const formattedAverageFPS = computed(() => {
  return detectionProgress.value.averageFPS.toFixed(1)
})

// 获取当前目录下所有视频的分镜分析结果（包括子目录）
const currentDirectorySceneResults = computed(() => {
  // 直接返回当前存储的所有分析结果，因为现在使用相对路径作为键
  return sceneAnalysisResults.value
})

// 检查是否有分镜分析结果
const hasSceneAnalysisResults = computed(() => Object.keys(currentDirectorySceneResults.value).length > 0)

// 获取所有文件的分镜场景合并到一起展示
const allScenes = computed(() => {
  const scenes: Array<{
    scene: SceneChangePoint
    videoName: string
    sceneIndex: number
    result: VideoAnalysisResult
  }> = []

  Object.entries(currentDirectorySceneResults.value).forEach(([videoName, result]) => {
    result.sceneChanges.forEach((scene, index) => {
      scenes.push({
        scene,
        videoName,
        sceneIndex: index,
        result,
      })
    })
  })

  // 先按文件名排序，再按时间戳排序
  return scenes.sort((a, b) => {
    // 首先按视频文件名排序
    const fileComparison = a.videoName.localeCompare(b.videoName)
    if (fileComparison !== 0) {
      return fileComparison
    }
    // 文件名相同时，按时间戳排序
    return a.scene.timestamp - b.scene.timestamp
  })
})

// 清理不存在的视频文件的分析结果
async function cleanupMissingVideoResults() {
  const directoryKey = currentDirectoryKey.value
  if (!directoryKey) {
    return
  }

  const currentDirectoryHandle = currentPathDirectories[currentPathDirectories.length - 1]?.handle
  if (!currentDirectoryHandle) {
    return
  }

  // 获取当前目录中所有实际存在的视频文件
  const existingVideoFiles = await getAllVideoFiles(currentDirectoryHandle)
  const existingVideoPaths = new Set(existingVideoFiles.map((file) => file.relativePath))

  // 检查存储的结果中是否有已经不存在的视频文件
  const storedResults = storedSceneAnalysisResults.value[directoryKey]
  if (!storedResults) {
    return
  }

  let hasChanges = false
  const updatedStoredResults = { ...storedResults }

  // 清理存储的结果
  for (const videoPath of Object.keys(storedResults)) {
    if (!existingVideoPaths.has(videoPath)) {
      console.log(`清理已删除视频的分析结果: ${videoPath}`)
      delete updatedStoredResults[videoPath]
      hasChanges = true
    }
  }

  // 清理运行时结果
  for (const videoPath of Object.keys(sceneAnalysisResults.value)) {
    if (!existingVideoPaths.has(videoPath)) {
      console.log(`清理已删除视频的运行时结果: ${videoPath}`)
      // 清理 blob URLs
      const result = sceneAnalysisResults.value[videoPath]
      if (result) {
        result.sceneChanges.forEach((scene) => {
          if (scene.frameImageUrl) {
            URL.revokeObjectURL(scene.frameImageUrl)
          }
        })
      }
      delete sceneAnalysisResults.value[videoPath]
      hasChanges = true
    }
  }

  // 清理对应的缩略图文件
  if (hasChanges) {
    try {
      const thumbnailsDir = await currentDirectoryHandle.getDirectoryHandle('thumbnails')

      // 收集所有现存视频对应的缩略图文件名
      const validThumbnailFiles = new Set<string>()

      // 从运行时结果收集
      for (const result of Object.values(sceneAnalysisResults.value)) {
        result.sceneChanges.forEach((scene) => {
          if (scene.thumbnailFileName) {
            validThumbnailFiles.add(scene.thumbnailFileName)
          }
        })
      }

      // 从存储结果收集
      for (const result of Object.values(updatedStoredResults)) {
        result.sceneChanges.forEach((scene: any) => {
          if (scene.thumbnailFileName) {
            validThumbnailFiles.add(scene.thumbnailFileName)
          }
        })
      }

      // 删除不再需要的缩略图文件
      for await (const [fileName] of thumbnailsDir.entries()) {
        if (!validThumbnailFiles.has(fileName)) {
          try {
            await thumbnailsDir.removeEntry(fileName)
            console.log(`已删除无用的缩略图文件: ${fileName}`)
          }
          catch (error) {
            console.warn(`删除缩略图文件失败: ${fileName}`, error)
          }
        }
      }
    }
    catch (error) {
      console.warn('清理缩略图文件失败:', error)
    }
  }

  // 如果有变化，更新存储
  if (hasChanges) {
    storedSceneAnalysisResults.value[directoryKey] = updatedStoredResults
  }
}

// 从存储加载分镜分析结果
async function loadStoredSceneAnalysisResults() {
  const directoryKey = currentDirectoryKey.value
  if (!directoryKey) {
    return
  }

  const storedResults = storedSceneAnalysisResults.value[directoryKey]
  if (!storedResults) {
    return
  }

  // 获取当前目录的句柄
  const currentDirectoryHandle = currentPathDirectories[currentPathDirectories.length - 1]?.handle
  if (!currentDirectoryHandle) {
    return
  }

  console.log(`加载存储的分镜分析结果: ${directoryKey}`)

  for (const [videoName, storedResult] of Object.entries(storedResults)) {
    try {
      // 重建运行时结果对象
      const runtimeResult: VideoAnalysisResult = {
        ...storedResult,
        sceneChanges: await Promise.all(
          storedResult.sceneChanges.map(async (scene: any) => {
            let frameImageUrl: string | undefined

            // 如果有缩略图文件名，尝试从本地加载
            if (scene.thumbnailFileName) {
              frameImageUrl = await loadThumbnailFromLocalDirectory(
                currentDirectoryHandle,
                scene.thumbnailFileName,
              ) || undefined
            }

            return {
              ...scene,
              formattedTime: scene.formattedTime || formatTimestamp(scene.timestamp),
              formattedDuration: scene.formattedDuration,
              frameImageUrl,
              // 恢复特征向量（如果存在）
              imageFeatures: scene.imageFeatures ? new Float32Array(scene.imageFeatures) : undefined,
            }
          }),
        ),
      }

      sceneAnalysisResults.value[videoName] = runtimeResult
    }
    catch (error) {
      console.warn(`加载视频 ${videoName} 的分镜分析结果失败:`, error)
    }
  }

  // 加载完成后，清理不存在的视频文件的分析结果
  await cleanupMissingVideoResults()
}

// 保存分镜分析结果到存储
function saveSceneAnalysisResults() {
  const directoryKey = currentDirectoryKey.value
  if (!directoryKey) {
    return
  }

  const resultsToStore: Record<string, any> = {}

  for (const [videoName, result] of Object.entries(sceneAnalysisResults.value)) {
    // 转换为存储格式（移除 blob URLs 和 fileHandle）
    resultsToStore[videoName] = {
      videoName: result.videoName,
      timestamp: result.timestamp,
      totalScenes: result.totalScenes,
      options: result.options,
      duration: result.duration,
      sceneChanges: result.sceneChanges.map((scene) => ({
        timestamp: scene.timestamp,
        score: scene.score,
        frameIndex: scene.frameIndex,
        formattedTime: scene.formattedTime,
        thumbnailFileName: scene.thumbnailFileName,
        duration: scene.duration,
        formattedDuration: scene.formattedDuration,
        // 序列化特征向量为数组（如果存在）
        imageFeatures: scene.imageFeatures ? Array.from(scene.imageFeatures) : undefined,
        // 不保存 frameImageUrl (blob URL)
      })),
    }
  }

  if (Object.keys(resultsToStore).length > 0) {
    if (!storedSceneAnalysisResults.value[directoryKey]) {
      storedSceneAnalysisResults.value[directoryKey] = {}
    }
    storedSceneAnalysisResults.value[directoryKey] = resultsToStore
    console.log(`已保存 ${directoryKey} 目录的分镜分析结果`)
  }
}

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
      // 进入目录后尝试加载存储的分镜分析结果
      await loadStoredSceneAnalysisResults()
    }
    else {
      // 权限失效，从列表中移除
      await removeDirectory(directoryData.id)
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

// 递归扫描目录中的所有视频文件
async function getAllVideoFiles(directoryHandle: FileSystemDirectoryHandle, basePath = ''): Promise<Array<{ name: string, handle: FileSystemFileHandle, relativePath: string }>> {
  const videoFiles: Array<{ name: string, handle: FileSystemFileHandle, relativePath: string }> = []

  try {
    for await (const [name, handle] of directoryHandle.entries()) {
      const currentPath = basePath ? `${basePath}/${name}` : name

      if (handle.kind === 'file' && name.endsWith('.mp4')) {
        videoFiles.push({
          name,
          handle,
          relativePath: currentPath,
        })
      }
      else if (handle.kind === 'directory') {
        // 递归扫描子目录
        const subDirectoryVideos = await getAllVideoFiles(handle, currentPath)
        videoFiles.push(...subDirectoryVideos)
      }
    }
  }
  catch (error) {
    console.warn(`扫描目录失败: ${basePath}`, error)
  }

  return videoFiles
}

async function detectScenes() {
  if (detectingScenesLoading.value) {
    return
  }

  detectingScenesLoading.value = true

  // 重置进度
  detectionProgress.value = {
    currentVideoIndex: 0,
    totalVideos: 0,
    currentVideoName: '',
    currentVideoDuration: 0,
    currentVideoProgress: 0,
    processedFrames: 0,
    isInitializing: false,
    initializationMessage: '',
    initializationStartTime: 0,
    startTime: performance.now(),
    currentTime: performance.now(),
    elapsedTime: 0,
    averageFPS: 0,
    totalProcessedFrames: 0,
  }

  try {
    // 获取当前目录句柄
    const currentDirectoryHandle = currentPathDirectories[currentPathDirectories.length - 1]?.handle
    if (!currentDirectoryHandle) {
      toast.add({
        title: '目录访问失败',
        description: '无法访问当前目录',
        color: 'error',
      })
      return
    }

    // 递归扫描所有视频文件
    const videoFiles = await getAllVideoFiles(currentDirectoryHandle)

    // 清理不存在的视频文件的分析结果
    await cleanupMissingVideoResults()

    // 初始化进度
    detectionProgress.value.totalVideos = videoFiles.length

    for (let videoIndex = 0; videoIndex < videoFiles.length; videoIndex++) {
      const videoFile = videoFiles[videoIndex]

      if (!videoFile) {
        continue
      }

      // 更新当前视频进度
      detectionProgress.value.currentVideoIndex = videoIndex
      detectionProgress.value.currentVideoName = videoFile.relativePath
      detectionProgress.value.currentVideoDuration = 0
      detectionProgress.value.currentVideoProgress = 0
      detectionProgress.value.processedFrames = 0

      // 用于统计的帧计数器
      let framesSinceLastUpdate = 0

      console.log(`开始分析视频: ${videoFile.relativePath} (${videoIndex + 1}/${videoFiles.length})`)

      try {
        const file = await readFile(videoFile.handle)
        const blobSource = new BlobSource(file)
        const input = new Input({ source: blobSource, formats: ALL_FORMATS })
        const duration = await input.computeDuration()

        // 设置当前视频的总时长
        detectionProgress.value.currentVideoDuration = duration

        const videoTrack = await input.getPrimaryVideoTrack()

        if (!videoTrack) {
          console.warn(`无法获取视频轨道: ${videoFile.relativePath}`)
          continue
        }

        const videoSampleSink = new VideoSampleSink(videoTrack)

        // 创建分镜检测器（传入目录句柄和视频的相对路径以保存缩略图）
        const sceneDetector = createVideoFrameSceneDetector(
          {
            threshold: 0.3,
            scaledSize: 128,
            enableFeatureExtraction: true, // 启用特征提取用于搜索
          },
          currentDirectoryHandle,
          videoFile.relativePath, // 使用相对路径作为文件标识
        )

        // 显示初始化状态
        detectionProgress.value.isInitializing = true
        detectionProgress.value.initializationMessage = '正在初始化图像特征提取器...'
        detectionProgress.value.initializationStartTime = performance.now()

        // 初始化检测器（包括特征提取器）
        try {
          await sceneDetector.initialize()
          console.log(`检测器初始化完成: ${videoFile.relativePath}`)
        }
        catch (error) {
          console.warn(`检测器初始化失败: ${videoFile.relativePath}`, error)
          // 初始化失败不影响分镜检测，继续执行
        }

        // 初始化完成，开始真正的帧处理计时
        detectionProgress.value.isInitializing = false
        detectionProgress.value.initializationMessage = ''

        let totalFrames = 0
        let videoDuration = 0

        // 处理每个视频样本
        for await (const sample of videoSampleSink.samples()) {
          const videoFrame = sample.toVideoFrame()

          // 记录最后的时间戳作为视频时长
          videoDuration = Math.max(videoDuration, sample.timestamp)

          // 检测分镜切换（现在是异步的）
          const result = await sceneDetector.processFrame(videoFrame, sample.timestamp)

          if (result.isSceneChange) {
            console.log(`检测到分镜切换: ${videoFile.relativePath} 时间点: ${formatTimestamp(sample.timestamp)}`)
          }

          totalFrames++
          framesSinceLastUpdate++
          detectionProgress.value.totalProcessedFrames++

          // 计算性能统计（每处理100帧更新一次）
          if (framesSinceLastUpdate >= 100) {
            const currentTime = performance.now()

            // 计算总体统计
            detectionProgress.value.currentTime = currentTime
            detectionProgress.value.elapsedTime = (currentTime - detectionProgress.value.startTime) / 1000

            // 计算整个任务的平均FPS（基于总体处理统计）
            if (detectionProgress.value.elapsedTime > 0) {
              detectionProgress.value.averageFPS = detectionProgress.value.totalProcessedFrames / detectionProgress.value.elapsedTime
            }

            // 重置计数器
            framesSinceLastUpdate = 0
          }

          // 更新帧处理进度
          detectionProgress.value.processedFrames = totalFrames

          // 基于当前时间戳和视频总时长计算当前视频进度
          if (detectionProgress.value.currentVideoDuration > 0) {
            detectionProgress.value.currentVideoProgress = Math.min(
              sample.timestamp / detectionProgress.value.currentVideoDuration,
              1.0,
            )
          }

          // 释放 VideoFrame 资源
          videoFrame.close()
        }

        // 获取最终结果
        const sceneChanges = sceneDetector.getSceneChanges()

        // 完成分析并保存特征向量到本地文件系统（如果启用了特征提取）
        try {
          await sceneDetector.finishAnalysis()
        }
        catch (error) {
          console.warn('保存特征向量到本地失败:', error)
        }

        // 计算分镜长度
        const scenesWithDuration = calculateSceneDurations(sceneChanges, videoDuration)

        // 保存分析结果
        const analysisResult: VideoAnalysisResult = {
          videoName: videoFile.relativePath,
          timestamp: new Date().toISOString(),
          totalScenes: scenesWithDuration.length,
          duration: videoDuration,
          sceneChanges: scenesWithDuration.map((scene) => ({
            ...scene,
            formattedTime: formatTimestamp(scene.timestamp),
          })),
          options: {
            threshold: 0.3,
            scaledSize: 128,
          },
          fileHandle: videoFile.handle,
        }

        sceneAnalysisResults.value[videoFile.relativePath] = analysisResult
      }
      catch (error) {
        console.error(`分析视频失败: ${videoFile.relativePath}`, error)
        toast.add({
          title: '分析失败',
          description: `${videoFile.relativePath}: ${error instanceof Error ? error.message : '未知错误'}`,
          color: 'error',
        })
      }
    }

    // 保存所有分析结果到存储
    saveSceneAnalysisResults()

    toast.add({
      title: '全部分析完成',
      description: '所有视频文件的分镜分析已完成',
      color: 'success',
    })
  }
  finally {
    detectingScenesLoading.value = false

    // 清理进度状态
    detectionProgress.value = {
      currentVideoIndex: 0,
      totalVideos: 0,
      currentVideoName: '',
      currentVideoDuration: 0,
      currentVideoProgress: 0,
      processedFrames: 0,
      isInitializing: false,
      initializationMessage: '',
      initializationStartTime: 0,
      startTime: 0,
      currentTime: 0,
      elapsedTime: 0,
      averageFPS: 0,
      totalProcessedFrames: 0,
    }
  }
}

// 预览文件（未使用）
async function _previewFileContent(item: EntryItem) {
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

// 预览分镜
async function previewScene(scene: SceneChangePoint, videoName: string, _videoResult: VideoAnalysisResult) {
  try {
    // 动态导入分镜预览组件
    const { default: ScenePreviewModal } = await import('~/components/scene-preview-modal.vue')
    const modal = overlay.create(ScenePreviewModal)

    // 获取当前目录句柄
    const currentDirectoryHandle = currentPathDirectories[currentPathDirectories.length - 1]?.handle

    // 打开模态框并传入数据
    modal.open({
      scene,
      videoName,
      currentDirectoryHandle,
    })
  }
  catch (error) {
    console.error('打开分镜预览失败:', error)
    toast.add({
      title: '预览失败',
      description: '无法打开分镜预览',
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

// 搜索分镜函数
async function searchScenes(query: string) {
  if (!query.trim()) {
    searchResults.value = []
    hasSearched.value = false
    return
  }

  isSearching.value = true
  hasSearched.value = true
  isModelLoading.value = true
  try {
    // 动态导入文本搜索服务
    const { TextSearchService } = await import('~/utils/text-search-service')

    // 收集所有分镜数据进行搜索
    const allScenesMap = new Map<string, SceneChangePoint[]>()

    // 遍历当前目录的所有分析结果
    for (const [videoName, result] of Object.entries(sceneAnalysisResults.value)) {
      const scenesWithFeatures = result.sceneChanges.filter((scene) =>
        (scene as SceneChangePoint & { imageFeatures?: Float32Array }).imageFeatures,
      )

      if (scenesWithFeatures.length > 0) {
        allScenesMap.set(videoName, scenesWithFeatures)
      }
    }

    if (allScenesMap.size === 0) {
      toast.add({
        title: '没有可搜索的分镜',
        description: '请先进行带特征提取的分镜识别以生成可搜索的数据',
        color: 'warning',
      })
      return
    }

    // 创建搜索服务实例
    const searchService = new TextSearchService()

    // 模型加载完成
    isModelLoading.value = false

    // 执行搜索
    const results = await searchService.searchByText({
      text: query,
      limit: 10,
      minSimilarity: 0.15,
    }, allScenesMap)

    // 更新搜索结果，添加分镜索引
    searchResults.value = results.map((result) => {
      // 找到分镜在原数组中的索引
      const videoResult = sceneAnalysisResults.value[result.videoName]
      const sceneIndex = videoResult?.sceneChanges.findIndex((scene) =>
        scene.timestamp === result.scene.timestamp,
      ) ?? -1

      return {
        videoName: result.videoName,
        scene: result.scene,
        similarity: result.similarity,
        sceneIndex,
      }
    })

    if (results.length === 0) {
      toast.add({
        title: '没有找到匹配的分镜',
        description: `没有找到与 "${query}" 相关的分镜内容`,
        color: 'warning',
      })
    }
    else {
      console.log(`搜索到 ${results.length} 个相关分镜`)
    }
  }
  catch (error) {
    console.error('搜索分镜失败:', error)
    toast.add({
      title: '搜索失败',
      description: error instanceof Error ? error.message : '搜索过程中出现错误',
      color: 'error',
    })
    searchResults.value = []
  }
  finally {
    isSearching.value = false
    isModelLoading.value = false
  }
}

// 防抖搜索
let searchTimeoutId: ReturnType<typeof setTimeout> | null = null

function debouncedSearch(query: string) {
  if (searchTimeoutId) {
    clearTimeout(searchTimeoutId)
  }
  searchTimeoutId = setTimeout(() => {
    searchScenes(query)
  }, 500)
}

// 处理搜索输入变化
function handleSearchChange(event: Event) {
  const target = event.target as HTMLInputElement
  const query = target.value.trim()

  if (query === '') {
    searchResults.value = []
    return
  }

  debouncedSearch(query)
}

// 处理搜索框清空
function handleSearchClear() {
  searchResults.value = []
  hasSearched.value = false
  isModelLoading.value = false
  if (searchTimeoutId) {
    clearTimeout(searchTimeoutId)
    searchTimeoutId = null
  }
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
      <div v-if="!isHome" class="mb-6">
        <div class="flex justify-between items-center mb-4">
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-400">当前目录:</span>
            <span class="font-mono bg-gray-800 px-3 py-1.5 rounded-md border border-gray-600 text-sm text-gray-100">
              {{ currentPath || '未选择目录' }}
            </span>
          </div>
          <div class="flex justify-between items-center">
            <div class="flex gap-3">
              <UInput
                v-model="searchQuery"
                placeholder="搜索分镜"
                icon="heroicons:magnifying-glass"
                :loading="isSearching"
                class="min-w-[200px]"
                clearable
                @change="handleSearchChange"
                @clear="handleSearchClear"
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

        <!-- 分镜识别进度条 -->
        <div v-if="detectingScenesLoading" class="mb-6">
          <div class="flex justify-between items-center mb-2">
            <div class="text-sm text-gray-400">
              <span v-if="detectionProgress.isInitializing">
                正在下载 & 初始化 CLIP 模型，首次耗时较长，请稍候...
              </span>
              <span v-else>
                正在分析: {{ detectionProgress.currentVideoName || '准备中...' }}
                <span v-if="detectionProgress.totalVideos > 0">
                  ({{ detectionProgress.currentVideoIndex + 1 }}/{{ detectionProgress.totalVideos }})
                </span>
              </span>
            </div>
            <div class="text-sm text-gray-400">
              {{ detectionProgressPercentage }}%
            </div>
          </div>
          <UProgress
            v-model="detectionProgressPercentage"
            :max="100"
            color="primary"
            size="sm"
            class="w-full"
          />
          <div class="grid grid-cols-2 gap-4 text-xs text-gray-500 mt-2">
            <div class="space-y-1">
              <div>已处理帧数: {{ detectionProgress.processedFrames.toLocaleString() }}</div>
              <div>总处理帧数: {{ detectionProgress.totalProcessedFrames.toLocaleString() }}</div>
              <div>当前视频进度: {{ Math.round(detectionProgress.currentVideoProgress * 100) }}%</div>
            </div>
            <div class="space-y-1">
              <div>处理耗时: {{ formattedElapsedTime }}</div>
              <div>平均 FPS: {{ formattedAverageFPS }}</div>
            </div>
          </div>
        </div>

        <!-- 搜索结果展示 -->
        <UCard v-if="showSearchResultsCard" class="mt-6">
          <template #header>
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-semibold text-gray-200">
                搜索结果
              </h3>
              <div class="text-sm text-gray-400">
                找到 {{ searchResults.length }} 个匹配的分镜
              </div>
            </div>
          </template>

          <div class="space-y-4">
            <!-- 模型加载中状态 -->
            <div v-if="isModelLoading" class="py-12 text-center">
              <UIcon name="heroicons:arrow-path" size="32" class="text-primary-500 mb-4 animate-spin" />
              <h3 class="text-lg font-semibold text-gray-300 mb-2">
                正在加载搜索模型...
              </h3>
              <p class="text-gray-400">
                首次使用需要下载模型，请稍候...
              </p>
            </div>

            <!-- 搜索中状态 -->
            <div v-else-if="isSearching" class="py-12 text-center">
              <UIcon name="heroicons:magnifying-glass" size="32" class="text-primary-500 mb-4 animate-pulse" />
              <h3 class="text-lg font-semibold text-gray-300 mb-2">
                正在搜索分镜...
              </h3>
              <p class="text-gray-400">
                正在分析"{{ searchQuery }}"相关内容
              </p>
            </div>

            <!-- 无搜索结果状态 -->
            <div v-else-if="searchResults.length === 0" class="py-12 text-center">
              <UIcon name="heroicons:face-frown" size="32" class="text-gray-500 mb-4" />
              <h3 class="text-lg font-semibold text-gray-300 mb-2">
                没有找到匹配的分镜
              </h3>
              <p class="text-gray-400 mb-4">
                尝试使用不同的搜索关键词，或确认已进行分镜识别
              </p>
              <div class="text-sm text-gray-500">
                搜索词: "{{ searchQuery }}"
              </div>
            </div>

            <!-- 搜索结果网格 -->
            <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <div
                v-for="(result, index) in searchResults"
                :key="`${result.videoName}-${result.sceneIndex}`"
                class="group relative border border-gray-600 rounded-lg overflow-hidden hover:border-primary-500 transition-colors cursor-pointer"
                @click="() => { const videoResult = sceneAnalysisResults[result.videoName]; if (videoResult) previewScene(result.scene, result.videoName, videoResult) }"
              >
                <div class="aspect-video bg-gray-800 flex items-center justify-center">
                  <img
                    v-if="result.scene.frameImageUrl"
                    :src="result.scene.frameImageUrl"
                    :alt="`搜索结果 ${index + 1} - ${result.scene.formattedTime}`"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  >
                  <div v-else class="text-gray-500 text-sm">
                    <UIcon name="heroicons:photo" size="24" />
                  </div>
                </div>

                <!-- 分镜信息 -->
                <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent text-white text-xs p-2">
                  <div class="flex justify-between items-end">
                    <div class="flex-1 min-w-0">
                      <div class="font-medium">
                        {{ result.scene.formattedTime }}
                      </div>
                      <div class="text-gray-300 truncate" :title="result.videoName">
                        {{ result.videoName }}
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="font-medium text-primary-300">
                        {{ Math.round(result.similarity * 100) }}%
                      </div>
                      <div class="text-gray-400">
                        相似度
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 悬停时显示更多信息 -->
                <div class="absolute inset-0 bg-black/80 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div class="text-white text-center px-2">
                    <div class="text-sm font-medium mb-1">
                      点击预览分镜
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>


        <!-- 分镜分析结果展示 -->
        <UCard v-if="hasSceneAnalysisResults && !showSearchResultsCard" class="mt-6">
          <template #header>
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-semibold text-gray-200">
                分镜
              </h3>
              <div class="text-sm text-gray-400">
                共 {{ allScenes.length }} 个分镜
              </div>
            </div>
          </template>

          <div v-if="allScenes.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            <div
              v-for="(sceneItem, index) in allScenes"
              :key="`${sceneItem.videoName}-${sceneItem.sceneIndex}`"
              class="group relative border border-gray-600 rounded-lg overflow-hidden hover:border-primary-500 transition-colors cursor-pointer"
              @click="previewScene(sceneItem.scene, sceneItem.videoName, sceneItem.result)"
            >
              <div class="aspect-video bg-gray-800 flex items-center justify-center">
                <img
                  v-if="sceneItem.scene.frameImageUrl"
                  :src="sceneItem.scene.frameImageUrl"
                  :alt="`分镜 ${index + 1} - ${sceneItem.scene.formattedTime}`"
                  class="w-full h-full object-cover"
                  loading="lazy"
                >
                <div v-else class="text-gray-500 text-sm">
                  <UIcon name="heroicons:photo" size="24" />
                </div>
              </div>

              <!-- 分镜信息 -->
              <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent text-white text-xs p-2">
                <div class="flex justify-between items-end gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="font-medium">
                      {{ sceneItem.scene.formattedTime }}
                    </div>
                    <div class="text-gray-300 truncate" :title="sceneItem.videoName">
                      {{ sceneItem.videoName }}
                    </div>
                  </div>
                  <div v-if="sceneItem.scene.formattedDuration" class="text-right">
                    <div class="font-medium text-primary-300">
                      {{ sceneItem.scene.formattedDuration }}
                    </div>
                    <div class="text-gray-400">
                      时长
                    </div>
                  </div>
                  <div v-else class="text-right">
                    <div class="font-medium text-gray-400">
                      未知时长
                    </div>
                  </div>
                </div>
              </div>

              <!-- 悬停时显示更多信息 -->
              <div class="absolute inset-0 bg-black/80 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div class="text-white text-center px-2">
                  <div class="text-sm font-medium mb-1">
                    点击预览分镜
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
        </UCard>
      </div>
    </template>
  </div>
</template>
