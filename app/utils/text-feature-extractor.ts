import { AutoModel, AutoTokenizer } from '@huggingface/transformers'

/**
 * Chinese CLIP 文本特征提取器
 * 使用 Hugging Face Transformers 的 AutoModel 提取文本特征向量
 *
 * 使用 Chinese CLIP 模型，支持中文文本编码
 * 与图像特征在同一特征空间中，可以进行有效的跨模态相似度计算
 */
export class CLIPTextExtractor {
  private tokenizer: any = null
  private model: any = null
  private isInitialized = false
  private initPromise: Promise<void> | null = null

  /**
   * 初始化文本特征提取器
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
        console.log('正在初始化 Chinese CLIP 文本特征提取器...')

        // 加载 tokenizer 和 Chinese CLIP 模型
        this.tokenizer = await AutoTokenizer.from_pretrained('Xenova/chinese-clip-vit-base-patch16')
        this.model = await AutoModel.from_pretrained('Xenova/chinese-clip-vit-base-patch16', { device: 'webgpu', dtype: 'fp32' })

        this.isInitialized = true
        console.log('Chinese CLIP 文本特征提取器初始化完成')
      }
      catch (error) {
        console.error('Chinese CLIP 文本特征提取器初始化失败:', error)
        this.initPromise = null
        throw error
      }
    })()

    return this.initPromise
  }

  /**
   * 从文本提取特征向量
   * @param text 输入文本
   * @returns 文本特征向量
   */
  async extractFeatureFromText(text: string): Promise<Float32Array> {
    await this.initialize()

    if (!this.tokenizer || !this.model) {
      throw new Error('文本特征提取器未初始化')
    }

    try {
      console.log('开始提取文本特征向量:', text.slice(0, 50))
      const startTime = performance.now()

      // 使用 tokenizer 对文本进行编码，指定序列长度为52（与Chinese CLIP模型保持一致）
      const textInputs = this.tokenizer([text], {
        padding: true,
        truncation: true,
        max_length: 52, // Chinese CLIP 模型的标准序列长度
      })

      // Chinese CLIP 模型需要同时提供文本和图像输入
      // 创建一个虚拟的图像输入作为占位符
      const { Tensor } = await import('@huggingface/transformers')
      const dummyImageData = new Float32Array(1 * 3 * 224 * 224).fill(0) // [batch, channels, height, width]
      const pixelValues = new Tensor(
        'float32',
        dummyImageData,
        [1, 3, 224, 224], // [batch_size, channels, height, width]
      )

      const inputs = {
        ...textInputs,
        pixel_values: pixelValues,
      }

      console.log('Chinese CLIP 模型输入（包含虚拟图像张量）:', inputs)
      const outputs = await this.model(inputs)
      console.log('Chinese CLIP Model outputs:', outputs)

      // 尝试不同的输出字段来获取文本特征
      let textEmbeds = null
      if (outputs.unnorm_text_features) {
        console.log('找到 unnorm_text_features 输出（Chinese CLIP 标准输出）')
        textEmbeds = outputs.unnorm_text_features
      }
      else if (outputs.text_embeds) {
        console.log('找到 text_embeds 输出')
        textEmbeds = outputs.text_embeds
      }
      else if (outputs.last_hidden_state) {
        console.log('使用 last_hidden_state，提取 CLS token 表示')
        // 如果没有 text_embeds，从 last_hidden_state 中提取 CLS token
        const lastHiddenState = outputs.last_hidden_state
        // 假设 batch_size=1，取第一个序列的第一个 token ([CLS])
        const hiddenSize = lastHiddenState.dims[2] // 隐藏层维度
        textEmbeds = {
          data: lastHiddenState.data.slice(0, hiddenSize),
        }
      }
      else if (outputs.pooler_output) {
        console.log('使用 pooler_output')
        textEmbeds = outputs.pooler_output
      }
      else {
        console.error('可用的输出字段:', Object.keys(outputs))
        throw new Error('无法从模型输出中提取文本特征，请检查模型输出格式')
      }

      // 转换为 Float32Array
      const featureArray = new Float32Array(textEmbeds.data as ArrayLike<number>)

      // 检查原始特征向量的模长
      const magnitude = Math.sqrt(featureArray.reduce((sum, val) => sum + val * val, 0))
      console.log(`原始文本特征向量模长: ${magnitude.toFixed(4)}`)

      // CLIP 文本模型输出可能已经归一化，先检查
      let finalFeatures: Float32Array
      if (Math.abs(magnitude - 1.0) < 0.01) {
        console.log('CLIP 文本特征已归一化，直接使用')
        finalFeatures = featureArray
      }
      else {
        console.log('对文本特征进行 L2 归一化')
        finalFeatures = CLIPTextExtractor.normalizeFeatures(featureArray)
      }
      console.log(`文本特征向量提取完成，耗时: ${performance.now() - startTime} ms`)
      return finalFeatures
    }
    catch (error) {
      console.error('文本特征提取失败:', error)
      throw error
    }
  }

  /**
   * 批量提取多个文本的特征向量
   * @param texts 文本数组
   * @returns 特征向量数组
   */
  async extractFeaturesFromTexts(texts: string[]): Promise<Float32Array[]> {
    const features: Float32Array[] = []

    for (const text of texts) {
      try {
        const feature = await this.extractFeatureFromText(text)
        features.push(feature)
      }
      catch (error) {
        console.error(`提取文本特征失败: "${text.slice(0, 30)}"`, error)
        // 为失败的文本添加零向量（CLIP 的特征向量维度通常是 512）
        features.push(new Float32Array(512))
      }
    }

    return features
  }

  /**
   * 计算文本与图像特征向量之间的余弦相似度
   * @param textFeatures 文本特征向量
   * @param imageFeatures 图像特征向量
   * @returns 余弦相似度（0到1，值越高越相似）
   */
  static calculateTextImageSimilarity(textFeatures: Float32Array, imageFeatures: Float32Array): number {
    if (textFeatures.length !== imageFeatures.length) {
      throw new Error('文本和图像特征向量长度不匹配')
    }

    // 检查输入向量是否已经归一化
    const textMagnitude = Math.sqrt(textFeatures.reduce((sum, val) => sum + val * val, 0))
    const imageMagnitude = Math.sqrt(imageFeatures.reduce((sum, val) => sum + val * val, 0))

    // 如果向量已经接近归一化（模长接近1），就直接使用
    // 否则进行归一化处理
    let normalizedTextFeatures = textFeatures
    let normalizedImageFeatures = imageFeatures

    if (Math.abs(textMagnitude - 1.0) > 0.01) {
      console.log('文本向量需要归一化')
      normalizedTextFeatures = CLIPTextExtractor.normalizeFeatures(textFeatures)
    }

    if (Math.abs(imageMagnitude - 1.0) > 0.01) {
      console.log('图像向量需要归一化')
      normalizedImageFeatures = CLIPTextExtractor.normalizeFeatures(imageFeatures)
    }

    // 计算余弦相似度 = 点积（对于归一化向量）
    let dotProduct = 0
    for (let i = 0; i < normalizedTextFeatures.length; i++) {
      const textF = normalizedTextFeatures[i] ?? 0
      const imageF = normalizedImageFeatures[i] ?? 0
      dotProduct += textF * imageF
    }

    // 确保余弦相似度在合理范围内
    if (Math.abs(dotProduct) > 1.1) {
      console.error(`异常的余弦相似度: ${dotProduct}，重新计算...`)

      // 强制重新归一化
      const forceNormText = CLIPTextExtractor.normalizeFeatures(textFeatures)
      const forceNormImage = CLIPTextExtractor.normalizeFeatures(imageFeatures)

      dotProduct = 0
      for (let i = 0; i < forceNormText.length; i++) {
        dotProduct += (forceNormText[i] ?? 0) * (forceNormImage[i] ?? 0)
      }

      console.log(`重新计算的余弦相似度: ${dotProduct.toFixed(6)}`)
    }

    // 将余弦相似度限制在 [-1, 1] 范围内
    dotProduct = Math.max(-1, Math.min(1, dotProduct))

    // 转换为 [0, 1] 范围
    return (dotProduct + 1) / 2
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
    console.log('Chinese CLIP 文本特征提取器资源已清理')
  }
}

// 单例实例
let globalTextExtractor: CLIPTextExtractor | null = null

/**
 * 获取全局的文本特征提取器实例
 */
export function getGlobalTextExtractor(): CLIPTextExtractor {
  if (!globalTextExtractor) {
    globalTextExtractor = new CLIPTextExtractor()
  }
  return globalTextExtractor
}
