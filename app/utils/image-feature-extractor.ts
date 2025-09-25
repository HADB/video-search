import { AutoModel, AutoTokenizer } from '@huggingface/transformers'

/**
 * Chinese CLIP 图像特征提取器
 * 使用 Hugging Face Transformers 的 AutoModel 提取图像特征向量
 */
export class CLIPFeatureExtractor {
  private tokenizer: any = null
  private model: any = null
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
        console.log('正在初始化 Chinese CLIP 图像特征提取器...')

        // 加载 tokenizer 和 Chinese CLIP 模型
        this.tokenizer = await AutoTokenizer.from_pretrained('Xenova/chinese-clip-vit-base-patch16')
        this.model = await AutoModel.from_pretrained('Xenova/chinese-clip-vit-base-patch16', { device: 'webgpu', dtype: 'fp32' })

        this.isInitialized = true
        console.log('Chinese CLIP 图像特征提取器初始化完成')
      }
      catch (error) {
        console.error('Chinese CLIP 图像特征提取器初始化失败:', error)
        this.initPromise = null
        throw error
      }
    })()

    return this.initPromise
  }

  /**
   * 从 VideoFrame 加载图像并转换为张量
   * @param videoFrame VideoFrame 对象
   * @returns 图像张量
   */
  private async loadImageTensor(videoFrame: VideoFrame): Promise<any> {
    const { Tensor } = await import('@huggingface/transformers')

    // 创建 canvas 并绘制 VideoFrame
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    // Chinese CLIP 模型需要 224x224 的输入
    canvas.width = 224
    canvas.height = 224

    // 绘制 VideoFrame 到 canvas
    ctx.drawImage(videoFrame, 0, 0, 224, 224)

    // 获取像素数据
    const imageData = ctx.getImageData(0, 0, 224, 224)
    const { data } = imageData

    // 转换为 RGB格式，并归一化到[0, 1]
    const pixelData = new Float32Array(3 * 224 * 224)

    for (let i = 0; i < 224 * 224; i++) {
      const pixelIndex = i * 4 // RGBA
      const tensorIndex = i

      // RGB分离并归一化，安全访问数组元素
      pixelData[tensorIndex] = (data[pixelIndex] ?? 0) / 255.0 // R
      pixelData[224 * 224 + tensorIndex] = (data[pixelIndex + 1] ?? 0) / 255.0 // G
      pixelData[224 * 224 * 2 + tensorIndex] = (data[pixelIndex + 2] ?? 0) / 255.0 // B
    }

    // 创建张量 [1, 3, 224, 224]
    const tensor = new Tensor('float32', pixelData, [1, 3, 224, 224])
    return tensor
  }

  /**
   * 从 VideoFrame 提取特征向量
   * @param videoFrame VideoFrame 对象
   * @returns 图像特征向量
   */
  async extractFeatureFromImage(videoFrame: VideoFrame): Promise<Float32Array> {
    await this.initialize()

    if (!this.tokenizer || !this.model) {
      throw new Error('特征提取器未初始化')
    }

    try {
      console.log('开始提取图像特征向量...')
      const startTime = performance.now()

      // 将 VideoFrame 转换为像素值张量
      const pixelValues = await this.loadImageTensor(videoFrame)

      // 创建虚拟文本输入（Chinese CLIP需要同时提供文本和图像）
      const dummyTextInputs = this.tokenizer([''], {
        padding: true,
        truncation: true,
        max_length: 52,
      })

      const inputs = {
        ...dummyTextInputs,
        pixel_values: pixelValues,
      }

      console.log('提取图像特征的模型输入:', inputs)
      const outputs = await this.model(inputs)
      console.log('图像特征提取输出:', outputs)

      // 获取图像特征
      let imageEmbeds = null
      if (outputs.unnorm_image_features) {
        console.log('找到 unnorm_image_features 输出（Chinese CLIP 标准输出）')
        imageEmbeds = outputs.unnorm_image_features
      }
      else if (outputs.image_embeds) {
        console.log('找到 image_embeds 输出')
        imageEmbeds = outputs.image_embeds
      }

      if (!imageEmbeds || !imageEmbeds.data) {
        console.error('无法从模型输出中获取图片特征')
        throw new Error('无法从模型输出中获取图片特征')
      }

      console.log('图片特征维度:', imageEmbeds.dims)
      const featureArray = new Float32Array(imageEmbeds.data)

      // 检查原始特征向量的模长
      const magnitude = Math.sqrt(featureArray.reduce((sum, val) => sum + val * val, 0))
      console.log(`原始图像特征向量模长: ${magnitude.toFixed(4)}`)

      // Chinese CLIP 图像模型输出可能已经归一化，先检查
      let finalFeatures: Float32Array
      if (Math.abs(magnitude - 1.0) < 0.01) {
        console.log('Chinese CLIP 图像特征已归一化，直接使用')
        finalFeatures = featureArray
      }
      else {
        console.log('对图像特征进行 L2 归一化')
        finalFeatures = CLIPFeatureExtractor.normalizeFeatures(featureArray)
      }

      console.log(`图像特征向量提取完成，耗时: ${performance.now() - startTime} ms`)
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

    if (!this.tokenizer || !this.model) {
      throw new Error('特征提取器未初始化')
    }

    try {
      console.log('开始从文件提取图像特征向量...')

      // 将 File 转换为像素值张量
      const pixelValues = await this.loadImageTensorFromFile(imageFile)

      // 创建虚拟文本输入（Chinese CLIP需要同时提供文本和图像）
      const dummyTextInputs = this.tokenizer([''], {
        padding: true,
        truncation: true,
        max_length: 52,
      })

      const inputs = {
        ...dummyTextInputs,
        pixel_values: pixelValues,
      }

      console.log('提取文件图像特征的模型输入:', inputs)
      const outputs = await this.model(inputs)
      console.log('文件图像特征提取输出:', outputs)

      // 获取图像特征
      let imageEmbeds = null
      if (outputs.unnorm_image_features) {
        console.log('找到 unnorm_image_features 输出（Chinese CLIP 标准输出）')
        imageEmbeds = outputs.unnorm_image_features
      }
      else if (outputs.image_embeds) {
        console.log('找到 image_embeds 输出')
        imageEmbeds = outputs.image_embeds
      }

      if (!imageEmbeds || !imageEmbeds.data) {
        console.error('无法从模型输出中获取文件图片特征')
        throw new Error('无法从模型输出中获取文件图片特征')
      }

      console.log('文件图片特征维度:', imageEmbeds.dims)
      const featureArray = new Float32Array(imageEmbeds.data)

      // 检查原始特征向量的模长
      const magnitude = Math.sqrt(featureArray.reduce((sum, val) => sum + val * val, 0))
      console.log(`原始文件图像特征向量模长: ${magnitude.toFixed(4)}`)

      // Chinese CLIP 图像模型输出可能已经归一化，先检查
      let finalFeatures: Float32Array
      if (Math.abs(magnitude - 1.0) < 0.01) {
        console.log('Chinese CLIP 文件图像特征已归一化，直接使用')
        finalFeatures = featureArray
      }
      else {
        console.log('对文件图像特征进行 L2 归一化')
        finalFeatures = CLIPFeatureExtractor.normalizeFeatures(featureArray)
      }

      return finalFeatures
    }
    catch (error) {
      console.error('文件特征提取失败:', error)
      throw error
    }
  }

  /**
   * 从 File 加载图像并转换为张量
   * @param imageFile 图像文件
   * @returns 图像张量
   */
  private async loadImageTensorFromFile(imageFile: File): Promise<any> {
    const { Tensor } = await import('@huggingface/transformers')

    return new Promise((resolve, reject) => {
      const img = new Image()
      const objectURL = URL.createObjectURL(imageFile)

      img.onload = () => {
        try {
          // 创建canvas并绘制图片
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!

          // Chinese CLIP模型需要224x224的输入
          canvas.width = 224
          canvas.height = 224

          // 绘制图片到canvas
          ctx.drawImage(img, 0, 0, 224, 224)

          // 获取像素数据
          const imageData = ctx.getImageData(0, 0, 224, 224)
          const { data } = imageData

          // 转换为RGB格式，并归一化到[0, 1]
          const pixelData = new Float32Array(3 * 224 * 224)

          for (let i = 0; i < 224 * 224; i++) {
            const pixelIndex = i * 4 // RGBA
            const tensorIndex = i

            // RGB分离并归一化，安全访问数组元素
            pixelData[tensorIndex] = (data[pixelIndex] ?? 0) / 255.0 // R
            pixelData[224 * 224 + tensorIndex] = (data[pixelIndex + 1] ?? 0) / 255.0 // G
            pixelData[224 * 224 * 2 + tensorIndex] = (data[pixelIndex + 2] ?? 0) / 255.0 // B
          }

          // 创建张量 [1, 3, 224, 224]
          const tensor = new Tensor('float32', pixelData, [1, 3, 224, 224])

          URL.revokeObjectURL(objectURL)
          resolve(tensor)
        }
        catch (error) {
          URL.revokeObjectURL(objectURL)
          reject(error)
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(objectURL)
        reject(new Error(`Failed to load image file: ${imageFile.name}`))
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
    this.tokenizer = null
    this.model = null
    this.isInitialized = false
    this.initPromise = null
    console.log('Chinese CLIP 图像特征提取器资源已清理')
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
