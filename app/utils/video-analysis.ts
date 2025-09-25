import type { AnalysisOptions, SceneChangePoint } from '../../shared/types'
import { FeatureSerializationUtils } from './feature-serialization'

/**
 * 保存分镜特征向量到本地文件系统
 * @param sceneChanges 分镜切换点数组
 * @param parentDirectoryHandle 视频所在目录的句柄
 * @param videoName 视频文件名
 * @returns 特征向量文件名
 */
export async function saveFeaturesToLocalDirectory(
  sceneChanges: SceneChangePoint[],
  parentDirectoryHandle: FileSystemDirectoryHandle,
  videoName: string,
): Promise<string> {
  // 创建 features 目录（如果不存在）
  let featuresDir: FileSystemDirectoryHandle
  try {
    featuresDir = await parentDirectoryHandle.getDirectoryHandle('features', { create: true })
  }
  catch (error) {
    console.error('创建 features 目录失败:', error)
    throw error
  }

  // 生成特征向量文件名：视频名.features.json
  const videoNameWithoutExt = videoName.replace(/\.[^/.]+$/, '')
  const featuresFileName = `${videoNameWithoutExt}.features.json`

  try {
    // 序列化分镜数据（包括特征向量）
    const serializedScenes = FeatureSerializationUtils.serializeScenes(sceneChanges)
    const featuresData = {
      videoName,
      timestamp: new Date().toISOString(),
      totalScenes: sceneChanges.length,
      sceneChanges: serializedScenes,
    }

    // 创建文件句柄
    const fileHandle = await featuresDir.getFileHandle(featuresFileName, { create: true })

    // 写入文件
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(featuresData, null, 2))
    await writable.close()

    console.log(`特征向量已保存: features/${featuresFileName}`)
    return featuresFileName
  }
  catch (error) {
    console.error('保存特征向量失败:', error)
    throw error
  }
}

/**
 * 从本地文件系统加载分镜特征向量
 * @param parentDirectoryHandle 视频所在目录的句柄
 * @param videoName 视频文件名
 * @returns 分镜切换点数组，如果文件不存在则返回 null
 */
export async function loadFeaturesFromLocalDirectory(
  parentDirectoryHandle: FileSystemDirectoryHandle,
  videoName: string,
): Promise<SceneChangePoint[] | null> {
  try {
    // 获取 features 目录
    const featuresDir = await parentDirectoryHandle.getDirectoryHandle('features')

    // 生成特征向量文件名
    const videoNameWithoutExt = videoName.replace(/\.[^/.]+$/, '')
    const featuresFileName = `${videoNameWithoutExt}.features.json`

    // 获取特征向量文件
    const fileHandle = await featuresDir.getFileHandle(featuresFileName)
    const file = await fileHandle.getFile()
    const text = await file.text()

    // 解析 JSON 数据
    const featuresData = JSON.parse(text)

    // 反序列化分镜数据（包括特征向量）
    const sceneChanges = FeatureSerializationUtils.deserializeScenes(featuresData.sceneChanges)

    console.log(`特征向量已加载: features/${featuresFileName}`)
    return sceneChanges
  }
  catch (error) {
    // 文件不存在或其他错误
    console.warn(`无法加载特征向量 ${videoName}:`, error)
    return null
  }
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
 * 从 VideoFrame 创建图片 Blob
 * @param videoFrame VideoFrame 对象
 * @param previewSize 预览图片尺寸
 * @returns 图片 Blob
 */
function createFrameImageBlob(videoFrame: VideoFrame, previewSize: number = 320): Promise<Blob | null> {
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

  // 转换为 blob
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob)
    }, 'image/jpeg', 0.8)
  })
}

/**
 * 保存分镜缩略图到本地文件系统
 * @param videoFrame VideoFrame 对象
 * @param parentDirectoryHandle 视频所在目录的句柄
 * @param videoName 视频文件名
 * @param frameIndex 帧索引
 * @param timestamp 时间戳
 * @returns 缩略图文件名
 */
export async function saveThumbnailToLocalDirectory(
  videoFrame: VideoFrame,
  parentDirectoryHandle: FileSystemDirectoryHandle,
  videoName: string,
  frameIndex: number,
  timestamp: number,
): Promise<string> {
  // 创建 thumbnails 目录（如果不存在）
  let thumbnailsDir: FileSystemDirectoryHandle
  try {
    thumbnailsDir = await parentDirectoryHandle.getDirectoryHandle('thumbnails', { create: true })
  }
  catch (error) {
    console.error('创建 thumbnails 目录失败:', error)
    throw error
  }

  // 生成缩略图文件名：将路径中的分隔符替换为下划线，避免文件系统问题
  const videoNameWithoutExt = videoName.replace(/\.[^/.]+$/, '').replace(/[/\\]/g, '_')
  const timestampStr = Math.floor(timestamp).toString().padStart(6, '0')
  const thumbnailFileName = `${videoNameWithoutExt}_frame_${frameIndex}_${timestampStr}.jpg`

  try {
    // 创建图片 blob
    const imageBlob = await createFrameImageBlob(videoFrame, 640)
    if (!imageBlob) {
      throw new Error('无法创建图片 blob')
    }

    // 创建文件句柄
    const fileHandle = await thumbnailsDir.getFileHandle(thumbnailFileName, { create: true })

    // 写入文件
    const writable = await fileHandle.createWritable()
    await writable.write(imageBlob)
    await writable.close()

    console.log(`缩略图已保存: thumbnails/${thumbnailFileName}`)
    return thumbnailFileName
  }
  catch (error) {
    console.error('保存缩略图失败:', error)
    throw error
  }
}

/**
 * 从本地文件系统加载缩略图
 * @param parentDirectoryHandle 视频所在目录的句柄
 * @param thumbnailFileName 缩略图文件名
 * @returns 缩略图 blob URL，如果文件不存在则返回 null
 */
export async function loadThumbnailFromLocalDirectory(
  parentDirectoryHandle: FileSystemDirectoryHandle,
  thumbnailFileName: string,
): Promise<string | null> {
  try {
    // 获取 thumbnails 目录
    const thumbnailsDir = await parentDirectoryHandle.getDirectoryHandle('thumbnails')

    // 获取缩略图文件
    const fileHandle = await thumbnailsDir.getFileHandle(thumbnailFileName)
    const file = await fileHandle.getFile()

    return URL.createObjectURL(file)
  }
  catch (error) {
    // 文件不存在或其他错误
    console.warn(`无法加载缩略图 ${thumbnailFileName}:`, error)
    return null
  }
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
 * 计算分镜长度并格式化
 * @param sceneChanges 分镜切换点数组
 * @param videoDuration 视频总时长（秒）
 * @returns 带有分镜长度信息的分镜切换点数组
 */
export function calculateSceneDurations(sceneChanges: SceneChangePoint[], videoDuration?: number): SceneChangePoint[] {
  if (sceneChanges.length === 0) {
    return sceneChanges
  }

  return sceneChanges.map((scene, index) => {
    let duration: number

    if (index < sceneChanges.length - 1) {
      // 不是最后一个分镜，计算到下一个分镜的时间差
      const nextScene = sceneChanges[index + 1]
      duration = nextScene ? nextScene.timestamp - scene.timestamp : 0
    }
    else if (videoDuration !== undefined) {
      // 最后一个分镜，计算到视频结束的时间差
      duration = videoDuration - scene.timestamp
    }
    else {
      // 无法确定时长
      duration = 0
    }

    return {
      ...scene,
      duration,
      formattedDuration: duration > 0 ? formatTimestamp(duration) : undefined,
    }
  })
}

/**
 * 使用 VideoFrame 分析分镜切换（适用于 mediabunny 库）
 * @param options 分析选项
 * @param parentDirectoryHandle 可选的目录句柄，用于保存缩略图
 * @param videoName 视频文件名，用于保存缩略图
 * @returns 分镜检测器对象
 */
export function createVideoFrameSceneDetector(
  options: AnalysisOptions = {
    threshold: 0.3,
    scaledSize: 128,
  },
  parentDirectoryHandle?: FileSystemDirectoryHandle,
  videoName?: string,
) {
  let previousFrameData: ImageData | null = null
  let frameIndex = 0
  let lastProcessedTime = -1
  let isFirstFrame = true
  const sceneChanges: SceneChangePoint[] = []

  // 特征提取器（如果启用）
  let imageFeatureExtractor: any = null
  let isFeatureExtractorInitialized = false

  // 预先初始化特征提取器
  const initFeatureExtractor = async () => {
    if (options.enableFeatureExtraction && !isFeatureExtractorInitialized) {
      try {
        const { getGlobalImageExtractor } = await import('./image-feature-extractor')
        imageFeatureExtractor = getGlobalImageExtractor()
        isFeatureExtractorInitialized = true
        console.log('图像特征提取器实例已创建，等待模型加载...')
      }
      catch (error) {
        console.warn('创建图像特征提取器实例失败:', error)
        isFeatureExtractorInitialized = true // 标记为已尝试初始化，避免重复尝试
        // 特征提取失败不影响分镜检测，继续执行
      }
    }
  }

  // 如果启用特征提取，立即开始初始化
  if (options.enableFeatureExtraction) {
    initFeatureExtractor()
  }

  return {
    /**
     * 初始化检测器（包括特征提取器）
     * @returns Promise<void>
     */
    async initialize(): Promise<void> {
      if (options.enableFeatureExtraction) {
        // 先确保实例已创建
        if (!isFeatureExtractorInitialized) {
          await initFeatureExtractor()
        }

        // 然后触发真正的模型加载
        if (imageFeatureExtractor) {
          try {
            // 创建一个 224x224 的临时 canvas 来触发初始化
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = 224 // CLIP 模型需要的尺寸
            tempCanvas.height = 224
            const tempCtx = tempCanvas.getContext('2d')!
            tempCtx.fillStyle = 'black'
            tempCtx.fillRect(0, 0, 224, 224)

            // 使用 canvas 创建 VideoFrame
            const tempVideoFrame = new VideoFrame(tempCanvas, { timestamp: 0 })

            // 这个调用会触发真正的模型加载
            await imageFeatureExtractor.extractFeatureFromImage(tempVideoFrame)

            // 清理临时资源
            tempVideoFrame.close()

            console.log('特征提取器模型加载完成')
          }
          catch (error) {
            console.warn('特征提取器初始化失败:', error)
          }
        }
      }
    },

    /**
     * 处理单个 VideoFrame
     * @param videoFrame VideoFrame 对象
     * @param timestamp 时间戳（秒）
     * @returns 是否检测到分镜切换和相关信息
     */
    async processFrame(videoFrame: VideoFrame, timestamp: number): Promise<{
      isSceneChange: boolean
      frameImageUrl?: string
      thumbnailFileName?: string
    }> {
      lastProcessedTime = timestamp

      // 提取当前帧数据
      const currentFrameData = extractFrameDataFromVideoFrame(videoFrame, options.scaledSize)

      let isSceneChange = false
      let frameImageUrl: string | undefined
      let thumbnailFileName: string | undefined

      // 如果是第一帧，直接添加为第一个分镜
      if (isFirstFrame) {
        isSceneChange = true
        frameImageUrl = await createFrameImageBlobUrl(videoFrame)

        // 保存缩略图到本地（如果提供了目录句柄）
        if (parentDirectoryHandle && videoName) {
          try {
            thumbnailFileName = await saveThumbnailToLocalDirectory(
              videoFrame,
              parentDirectoryHandle,
              videoName,
              frameIndex,
              timestamp,
            )
          }
          catch (error) {
            console.warn('保存缩略图失败，继续处理:', error)
          }
        }

        // 提取图像特征向量（如果启用）
        let imageFeatures: Float32Array | undefined
        if (imageFeatureExtractor) {
          try {
            imageFeatures = await imageFeatureExtractor.extractFeatureFromImage(videoFrame)
            if (imageFeatures) {
              console.log(`第一帧特征向量提取完成，维度: ${imageFeatures.length}`)
            }
          }
          catch (error) {
            console.warn('提取第一帧特征向量失败:', error)
          }
        }

        sceneChanges.push({
          timestamp,
          score: 0, // 第一帧没有差异分数
          frameIndex,
          frameImageUrl,
          thumbnailFileName,
          imageFeatures, // 添加特征向量
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

          // 保存缩略图到本地（如果提供了目录句柄）
          if (parentDirectoryHandle && videoName) {
            try {
              thumbnailFileName = await saveThumbnailToLocalDirectory(
                videoFrame,
                parentDirectoryHandle,
                videoName,
                frameIndex,
                timestamp,
              )
            }
            catch (error) {
              console.warn('保存缩略图失败，继续处理:', error)
            }
          }

          // 提取图像特征向量（如果启用）
          let imageFeatures: Float32Array | undefined
          if (imageFeatureExtractor) {
            try {
              const startTime = performance.now()
              imageFeatures = await imageFeatureExtractor.extractFeatureFromImage(videoFrame)
              const endTime = performance.now()
              if (imageFeatures) {
                console.log(`分镜 ${frameIndex} 特征向量提取完成，耗时 ${(endTime - startTime).toFixed(2)} ms，维度: ${imageFeatures.length}`)
              }
            }
            catch (error) {
              console.warn(`提取分镜 ${frameIndex} 特征向量失败:`, error)
            }
          }

          sceneChanges.push({
            timestamp,
            score: difference,
            frameIndex,
            frameImageUrl,
            thumbnailFileName,
            imageFeatures, // 添加特征向量
          })
        }
      }

      previousFrameData = currentFrameData
      frameIndex++

      return { isSceneChange, frameImageUrl, thumbnailFileName }
    },

    /**
     * 获取检测到的分镜切换点
     */
    getSceneChanges(): SceneChangePoint[] {
      return [...sceneChanges]
    },

    /**
     * 完成分析并保存特征向量到本地
     * @returns 保存的特征向量文件名，如果保存失败则返回 undefined
     */
    async finishAnalysis(): Promise<string | undefined> {
      if (parentDirectoryHandle && videoName && sceneChanges.length > 0) {
        // 检查是否有任何特征向量
        const hasFeatures = sceneChanges.some((scene) => scene.imageFeatures)

        if (hasFeatures) {
          try {
            const featuresFileName = await saveFeaturesToLocalDirectory(
              sceneChanges,
              parentDirectoryHandle,
              videoName,
            )
            console.log(`分析完成，特征向量已保存: ${featuresFileName}`)
            return featuresFileName
          }
          catch (error) {
            console.warn('保存特征向量失败:', error)
          }
        }
        else {
          console.log('分析完成，未提取特征向量')
        }
      }
      return undefined
    },

    /**
     * 从本地加载已保存的特征向量
     * @returns 是否成功加载特征向量
     */
    async loadSavedFeatures(): Promise<boolean> {
      if (parentDirectoryHandle && videoName) {
        try {
          const savedScenes = await loadFeaturesFromLocalDirectory(parentDirectoryHandle, videoName)

          if (savedScenes) {
            // 替换当前的分镜数据
            sceneChanges.length = 0
            sceneChanges.push(...savedScenes)
            console.log(`已加载保存的特征向量，共 ${savedScenes.length} 个分镜`)
            return true
          }
        }
        catch (error) {
          console.warn('加载特征向量失败:', error)
        }
      }
      return false
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
