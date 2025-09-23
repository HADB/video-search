<script setup lang="ts">
interface Props {
  scene: SceneChangePoint
  videoName: string
  currentDirectoryHandle?: FileSystemDirectoryHandle | null
}

const props = defineProps<Props>()

// 按照 NuxtUI 文档要求，使用 emit 方式
const emit = defineEmits<{ close: [boolean] }>()

// 响应式变量
const isPlaying = ref(false)
const progress = ref(0)
const remainingTime = ref(0)
const videoUrl = ref('')
const videoElement = ref<HTMLVideoElement>()

// 动画帧ID
let animationFrame: number
let startTime: number
let endTime: number

// 格式化时间显示
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

// 初始化视频
async function initializeVideo() {
  if (!props.currentDirectoryHandle || videoUrl.value) {
    return
  }

  try {
    // 从当前目录获取视频文件句柄
    const videoFileHandle = await props.currentDirectoryHandle.getFileHandle(props.videoName)
    const file = await videoFileHandle.getFile()
    videoUrl.value = URL.createObjectURL(file)

    // 计算开始和结束时间
    startTime = props.scene.timestamp
    endTime = props.scene.duration ? startTime + props.scene.duration : startTime + 30

    // 确保结束时间不超过开始时间
    if (endTime <= startTime) {
      endTime = startTime + 0.1
    }
  }
  catch (error) {
    console.error('初始化视频失败:', error)
  }
}

// 停止视频播放
function stopVideo() {
  const video = videoElement.value
  if (video) {
    video.pause()
    video.currentTime = startTime
  }

  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }

  isPlaying.value = false
  progress.value = 0
  remainingTime.value = endTime - startTime
}

// 切换播放/暂停
async function togglePlayPause() {
  // 如果还没有初始化视频，先初始化
  if (!videoUrl.value) {
    await initializeVideo()
    return
  }

  const video = videoElement.value
  if (!video) {
    return
  }

  if (video.paused) {
    // 确保播放时间在正确范围内
    if (video.currentTime < startTime || video.currentTime >= endTime) {
      video.currentTime = startTime
    }

    video.play()
    isPlaying.value = true
    updateProgress()
  }
  else {
    video.pause()
    isPlaying.value = false
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
    }
  }
}

// 视频加载完成
function onVideoLoaded() {
  const video = videoElement.value
  if (!video) {
    return
  }

  // 设置视频开始时间
  video.currentTime = startTime

  // 自动开始播放
  video.play()
  isPlaying.value = true

  // 开始进度监控
  updateProgress()
}

// 视频播放结束
function onVideoEnded() {
  const video = videoElement.value
  if (!video) {
    return
  }

  video.pause()
  video.currentTime = startTime // 回到首帧
  isPlaying.value = false
  progress.value = 0
  remainingTime.value = endTime - startTime

  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
}

// 更新进度条和时间检查（使用requestAnimationFrame进行精确控制）
function updateProgress() {
  const video = videoElement.value
  if (!video || !isPlaying.value) {
    return
  }

  const currentTime = video.currentTime

  // 精确检查是否到达结束时间
  if (currentTime >= endTime - 1 / 30) {
    onVideoEnded()
    return
  }

  // 更新进度条
  const progressPercent = ((currentTime - startTime) / (endTime - startTime)) * 100
  progress.value = Math.min(progressPercent, 100)

  // 更新剩余时间
  remainingTime.value = Math.max(0, endTime - currentTime)

  // 继续监控
  if (isPlaying.value && currentTime < endTime) {
    animationFrame = requestAnimationFrame(updateProgress)
  }
}

// 清理资源
onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }

  if (videoUrl.value) {
    URL.revokeObjectURL(videoUrl.value)
  }

  document.removeEventListener('keydown', handleKeyPress)
})

// 键盘控制
function handleKeyPress(e: KeyboardEvent) {
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlayPause()
  }
  else if (e.code === 'Escape') {
    stopVideo()
  }
}

// 监听键盘事件
onMounted(() => {
  document.addEventListener('keydown', handleKeyPress)

  // 初始化时间显示
  startTime = props.scene.timestamp
  endTime = props.scene.duration ? startTime + props.scene.duration : startTime + 30
  remainingTime.value = endTime - startTime
})
</script>

<template>
  <UModal
    :close="{ onClick: () => emit('close', false) }"
    :title="`分镜预览 - ${videoName}`"
    class="max-w-4xl"
  >
    <template #body>
      <div class="space-y-4">
        <!-- 分镜信息 -->
        <div class="bg-gray-800 rounded-lg p-4">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span class="text-gray-400">开始时间:</span>
              <span class="ml-2 text-gray-200">{{ scene.formattedTime }}</span>
            </div>
            <div>
              <span class="text-gray-400">分镜长度:</span>
              <span class="ml-2 text-gray-200">{{ scene.formattedDuration || '未知' }}</span>
            </div>
            <div>
              <span class="text-gray-400">差异度:</span>
              <span class="ml-2 text-gray-200">{{ Math.round(scene.score * 100) }}%</span>
            </div>
            <div>
              <span class="text-gray-400">帧索引:</span>
              <span class="ml-2 text-gray-200">{{ scene.frameIndex }}</span>
            </div>
          </div>
        </div>

        <!-- 视频播放器 -->
        <div class="flex justify-center">
          <div class="relative max-w-2xl w-full">
            <div class="bg-black rounded-lg overflow-hidden">
              <!-- 视频元素 -->
              <video
                ref="videoElement"
                :src="videoUrl || undefined"
                :poster="scene.frameImageUrl"
                class="w-full h-auto cursor-pointer"
                @click="togglePlayPause"
                @loadeddata="onVideoLoaded"
                @ended="onVideoEnded"
              />

              <!-- 悬浮控制按钮 -->
              <div
                class="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300"
                @click="togglePlayPause"
              >
                <div class="bg-black bg-opacity-70 rounded-full w-15 h-15 flex items-center justify-center cursor-pointer">
                  <UIcon
                    :name="isPlaying ? 'heroicons:pause' : 'heroicons:play'"
                    class="text-white text-2xl"
                  />
                </div>
              </div>
            </div>

            <!-- 自定义进度条 - 移到视频下方 -->
            <div class="mt-4 space-y-2">
              <div class="w-full h-1 bg-gray-600 rounded-full overflow-hidden">
                <div
                  class="h-full bg-blue-500 rounded-full transition-all duration-100 ease-linear"
                  :style="{ width: `${progress}%` }"
                />
              </div>

              <!-- 时间显示 -->
              <div class="text-center text-gray-400 text-sm">
                剩余时间: {{ formatTime(remainingTime) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
