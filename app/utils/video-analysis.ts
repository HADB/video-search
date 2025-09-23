/**
 * 视频分镜检测工具
 * 通过分析视频帧之间的差异来检测分镜切换点
 */

export interface SceneChangePoint {
  /** 分镜切换时间点（秒） */
  timestamp: number
  /** 差异度分数 (0-1，值越高差异越大) */
  score: number
  /** 帧索引 */
  frameIndex: number
  /** 分镜首帧图片 blob URL */
  frameImageUrl?: string
}

export interface AnalysisProgress {
  /** 当前进度 (0-1) */
  progress: number
  /** 当前处理的帧索引 */
  currentFrame: number
  /** 总帧数 */
  totalFrames: number
  /** 当前检测到的场景数量 */
  scenesDetected: number
}

export interface AnalysisOptions {
  /** 检测敏感度阈值 (0-1，值越低越敏感) */
  threshold: number
  /** 采样间隔（秒），每隔多少秒分析一帧 */
  sampleInterval: number
  /** 视频缩放尺寸，用于提高处理速度 */
  scaledSize: number
}

/**
 * 计算两个图像数据之间的直方图差异
 * @param imageData1 第一帧图像数据
 * @param imageData2 第二帧图像数据
 * @returns 差异度分数 (0-1)
 */
function calculateHistogramDifference(imageData1: ImageData, imageData2: ImageData): number {
  const data1 = imageData1.data
  const data2 = imageData2.data

  // 创建RGB直方图 (每个通道16个桶，共16x16x16=4096个桶)
  const bins = 16
  const hist1 = Array.from({ length: bins * bins * bins }, () => 0)
  const hist2 = Array.from({ length: bins * bins * bins }, () => 0)

  // 计算直方图
  for (let i = 0; i < data1.length; i += 4) {
    const r1 = Math.floor(((data1[i] ?? 0) / 255) * (bins - 1))
    const g1 = Math.floor(((data1[i + 1] ?? 0) / 255) * (bins - 1))
    const b1 = Math.floor(((data1[i + 2] ?? 0) / 255) * (bins - 1))

    const r2 = Math.floor(((data2[i] ?? 0) / 255) * (bins - 1))
    const g2 = Math.floor(((data2[i + 1] ?? 0) / 255) * (bins - 1))
    const b2 = Math.floor(((data2[i + 2] ?? 0) / 255) * (bins - 1))

    const index1 = r1 * bins * bins + g1 * bins + b1
    const index2 = r2 * bins * bins + g2 * bins + b2

    if (hist1[index1] !== undefined) {
      hist1[index1]++
    }
    if (hist2[index2] !== undefined) {
      hist2[index2]++
    }
  }

  // 归一化直方图
  const totalPixels = imageData1.width * imageData1.height
  for (let i = 0; i < hist1.length; i++) {
    const val1 = hist1[i]
    const val2 = hist2[i]
    if (val1 !== undefined) {
      hist1[i] = val1 / totalPixels
    }
    if (val2 !== undefined) {
      hist2[i] = val2 / totalPixels
    }
  }

  // 计算卡方距离
  let chiSquare = 0
  for (let i = 0; i < hist1.length; i++) {
    const val1 = hist1[i] ?? 0
    const val2 = hist2[i] ?? 0
    const sum = val1 + val2
    if (sum > 0) {
      const diff = val1 - val2
      chiSquare += (diff * diff) / sum
    }
  }

  // 归一化到0-1范围
  return Math.min(chiSquare / 2, 1)
}

/**
 * 从 VideoFrame 中提取图像数据
 * @param videoFrame VideoFrame 对象
 * @param scaledSize 缩放尺寸
 * @returns 图像数据
 */
function extractFrameDataFromVideoFrame(videoFrame: VideoFrame, scaledSize: number): ImageData {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  // 计算保持宽高比的缩放尺寸
  const aspectRatio = videoFrame.displayWidth / videoFrame.displayHeight
  let width = scaledSize
  let height = scaledSize

  if (aspectRatio > 1) {
    height = Math.round(scaledSize / aspectRatio)
  }
  else {
    width = Math.round(scaledSize * aspectRatio)
  }

  canvas.width = width
  canvas.height = height

  // 绘制当前帧到canvas
  ctx.drawImage(videoFrame, 0, 0, width, height)

  return ctx.getImageData(0, 0, width, height)
}

/**
 * 从 VideoFrame 创建图片 blob URL
 * @param videoFrame VideoFrame 对象
 * @param previewSize 预览图片尺寸
 * @returns 图片 blob URL
 */
function createFrameImageBlobUrl(videoFrame: VideoFrame, previewSize: number = 320): Promise<string> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  // 计算保持宽高比的缩放尺寸
  const aspectRatio = videoFrame.displayWidth / videoFrame.displayHeight
  let width = previewSize
  let height = previewSize

  if (aspectRatio > 1) {
    height = Math.round(previewSize / aspectRatio)
  }
  else {
    width = Math.round(previewSize * aspectRatio)
  }

  canvas.width = width
  canvas.height = height

  // 绘制当前帧到canvas
  ctx.drawImage(videoFrame, 0, 0, width, height)

  // 转换为 blob URL
  return new Promise<string>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob))
      }
      else {
        resolve('')
      }
    }, 'image/jpeg', 0.8)
  })
}

/**
 * 格式化时间戳为可读格式
 * @param timestamp 时间戳（秒）
 * @returns 格式化的时间字符串 (MM:SS)
 */
export function formatTimestamp(timestamp: number): string {
  const minutes = Math.floor(timestamp / 60)
  const seconds = Math.floor(timestamp % 60)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/**
 * 使用 VideoFrame 分析分镜切换（适用于 mediabunny 库）
 * @param options 分析选项
 * @returns 分镜检测器对象
 */
export function createVideoFrameSceneDetector(options: AnalysisOptions = {
  threshold: 0.3,
  sampleInterval: 1.0,
  scaledSize: 128,
}) {
  let previousFrameData: ImageData | null = null
  let frameIndex = 0
  let lastProcessedTime = -1
  let isFirstFrame = true
  const sceneChanges: SceneChangePoint[] = []

  return {
    /**
     * 处理单个 VideoFrame
     * @param videoFrame VideoFrame 对象
     * @param timestamp 时间戳（秒）
     * @returns 是否检测到分镜切换和图片 URL（如果有的话）
     */
    async processFrame(videoFrame: VideoFrame, timestamp: number): Promise<{ isSceneChange: boolean, frameImageUrl?: string }> {
      // 根据采样间隔决定是否处理这一帧
    //   if (timestamp - lastProcessedTime < options.sampleInterval) {
    //     return { isSceneChange: false }
    //   }

      lastProcessedTime = timestamp

      // 提取当前帧数据
      const currentFrameData = extractFrameDataFromVideoFrame(videoFrame, options.scaledSize)

      let isSceneChange = false
      let frameImageUrl: string | undefined

      // 如果是第一帧，直接添加为第一个分镜
      if (isFirstFrame) {
        isSceneChange = true
        frameImageUrl = await createFrameImageBlobUrl(videoFrame)

        sceneChanges.push({
          timestamp,
          score: 0, // 第一帧没有差异分数
          frameIndex,
          frameImageUrl,
        })

        isFirstFrame = false
      }
      // 与前一帧比较
      else if (previousFrameData) {
        const difference = calculateHistogramDifference(previousFrameData, currentFrameData)

        // 如果差异超过阈值，认为是分镜切换
        if (difference > options.threshold) {
          isSceneChange = true
          // 创建首帧图片
          frameImageUrl = await createFrameImageBlobUrl(videoFrame)

          sceneChanges.push({
            timestamp,
            score: difference,
            frameIndex,
            frameImageUrl,
          })
        }
      }

      previousFrameData = currentFrameData
      frameIndex++

      return { isSceneChange, frameImageUrl }
    },

    /**
     * 获取检测到的分镜切换点
     */
    getSceneChanges(): SceneChangePoint[] {
      return [...sceneChanges]
    },

    /**
     * 重置检测器状态
     */
    reset() {
      previousFrameData = null
      frameIndex = 0
      lastProcessedTime = -1
      isFirstFrame = true
      sceneChanges.length = 0
    },

    /**
     * 获取当前统计信息
     */
    getStats() {
      return {
        totalFramesProcessed: frameIndex,
        scenesDetected: sceneChanges.length,
        lastProcessedTime,
      }
    },
  }
}
