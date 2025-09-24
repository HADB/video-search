import { pipeline } from '@huggingface/transformers'

/**
 * CLIP 图像特征提取器
 * 使用 Hugging Face Transformers 提取图像特征向量
 */
export class CLIPFeatureExtractor {
  private extractor: any = null
  private isInitialized = false
  private initPromise: Promise<void> | null = null

  /**
   * 初始化图像特征提取器
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      try {
        console.log('正在初始化 CLIP 图像特征提取器...')

        // 使用 Hugging Face Transformers pipeline
        this.extractor = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32', { device: 'webgpu', dtype: 'fp32' })

        this.isInitialized = true
        console.log('CLIP 图像特征提取器初始化完成')
      }
      catch (error) {
        console.error('CLIP 图像特征提取器初始化失败:', error)
        this.initPromise = null
        throw error
      }
    })()

    return this.initPromise
  }

  /**
   * 将 VideoFrame 转换为 Canvas
   * @param videoFrame VideoFrame 对象
   * @returns Canvas 元素
   */
  private createCanvasFromVideoFrame(videoFrame: VideoFrame): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = videoFrame.displayWidth
    canvas.height = videoFrame.displayHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('无法创建 Canvas 上下文')
    }

    ctx.drawImage(videoFrame, 0, 0)
    return canvas
  }

  /**
   * 从 VideoFrame 提取特征向量
   * @param videoFrame VideoFrame 对象
   * @returns 图像特征向量
   */
  async extractFeatureFromImage(videoFrame: VideoFrame): Promise<Float32Array> {
    await this.initialize()

    if (!this.extractor) {
      throw new Error('特征提取器未初始化')
    }

    try {
      console.log('开始提取图像特征向量...')

      // 将 VideoFrame 转换为 Canvas
      const canvas = this.createCanvasFromVideoFrame(videoFrame)

      // 使用 Transformers pipeline 提取特征
      const features = await this.extractor(canvas)

      // 转换为 Float32Array
      const featureArray = new Float32Array(features.data)

      // 检查原始特征向量的模长
      const magnitude = Math.sqrt(featureArray.reduce((sum, val) => sum + val * val, 0))
      console.log(`原始图像特征向量模长: ${magnitude.toFixed(4)}`)

      // CLIP 图像模型输出可能已经归一化，先检查
      let finalFeatures: Float32Array
      if (Math.abs(magnitude - 1.0) < 0.01) {
        console.log('CLIP 图像特征已归一化，直接使用')
        finalFeatures = featureArray
      }
      else {
        console.log('对图像特征进行 L2 归一化')
        finalFeatures = CLIPFeatureExtractor.normalizeFeatures(featureArray)
      }

      console.log(`图像特征向量提取完成，维度: ${finalFeatures.length}`)
      return finalFeatures
    }
    catch (error) {
      console.error('图像特征提取失败:', error)
      throw error
    }
  }

  /**
   * 从 File 提取特征向量（用于图像搜索）
   * @param imageFile 图像文件
   * @returns 图像特征向量
   */
  async extractFeatureFromFile(imageFile: File): Promise<Float32Array> {
    await this.initialize()

    if (!this.extractor) {
      throw new Error('特征提取器未初始化')
    }

    try {
      console.log('开始从文件提取图像特征向量...')

      // 将 File 转换为 HTMLImageElement
      const imageElement = await this.createImageElementFromFile(imageFile)

      // 使用 Transformers pipeline 提取特征
      const features = await this.extractor(imageElement)

      // 转换为 Float32Array
      const featureArray = new Float32Array(features.data)

      // 检查原始特征向量的模长
      const magnitude = Math.sqrt(featureArray.reduce((sum, val) => sum + val * val, 0))
      console.log(`原始文件图像特征向量模长: ${magnitude.toFixed(4)}`)

      // CLIP 图像模型输出可能已经归一化，先检查
      let finalFeatures: Float32Array
      if (Math.abs(magnitude - 1.0) < 0.01) {
        console.log('CLIP 文件图像特征已归一化，直接使用')
        finalFeatures = featureArray
      }
      else {
        console.log('对文件图像特征进行 L2 归一化')
        finalFeatures = CLIPFeatureExtractor.normalizeFeatures(featureArray)
      }

      console.log(`文件特征向量提取完成，维度: ${finalFeatures.length}`)
      return finalFeatures
    }
    catch (error) {
      console.error('文件特征提取失败:', error)
      throw error
    }
  }

  /**
   * 从 File 创建 HTMLImageElement
   * @param imageFile 图像文件
   * @returns HTMLImageElement
   */
  private async createImageElementFromFile(imageFile: File): Promise<HTMLImageElement> {
    const img = new Image()
    const objectURL = URL.createObjectURL(imageFile)

    return new Promise((resolve, reject) => {
      img.onload = () => {
        URL.revokeObjectURL(objectURL)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(objectURL)
        reject(new Error('无法从文件创建图像'))
      }
      img.crossOrigin = 'anonymous'
      img.src = objectURL
    })
  }

  /**
   * 规范化特征向量（L2 归一化）
   * @param features 原始特征向量
   * @returns 归一化后的特征向量
   */
  static normalizeFeatures(features: Float32Array): Float32Array {
    let norm = 0
    for (let i = 0; i < features.length; i++) {
      const value = features[i] ?? 0
      norm += value * value
    }

    norm = Math.sqrt(norm)

    if (norm === 0) {
      return new Float32Array(features.length)
    }

    const normalized = new Float32Array(features.length)
    for (let i = 0; i < features.length; i++) {
      const value = features[i] ?? 0
      normalized[i] = value / norm
    }

    return normalized
  }

  /**
   * 检查提取器是否已初始化
   */
  get initialized(): boolean {
    return this.isInitialized
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.extractor = null
    this.isInitialized = false
    this.initPromise = null
  }
}

// 单例实例
let globalImageExtractor: CLIPFeatureExtractor | null = null

/**
 * 获取全局的图像特征提取器实例
 */
export function getGlobalImageExtractor(): CLIPFeatureExtractor {
  if (!globalImageExtractor) {
    globalImageExtractor = new CLIPFeatureExtractor()
  }
  return globalImageExtractor
}
