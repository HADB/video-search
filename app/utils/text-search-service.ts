/**
 * 文本搜索结果
 */
export interface TextSearchResult {
  /** 视频名称 */
  videoName: string
  /** 分镜信息 */
  scene: RuntimeSceneChangePoint
  /** 相似度分数 (0-1，值越高越相似) */
  similarity: number
  /** 匹配的查询文本 */
  queryText: string
}

/**
 * 文本搜索查询参数
 */
export interface TextSearchQuery {
  /** 查询文本 */
  text: string
  /** 搜索结果数量限制 */
  limit?: number
  /** 最小相似度阈值 (0-1) */
  minSimilarity?: number
  /** 指定搜索的视频范围 */
  videoNames?: string[]
}

/**
 * 基于文本的视频分镜搜索服务
 */
export class TextSearchService {
  private textExtractor: CLIPTextExtractor

  constructor() {
    this.textExtractor = getGlobalTextExtractor()
  }

  /**
   * 根据文本查询搜索相似的分镜
   * @param query 搜索查询参数
   * @param allScenes 所有分镜数据（来自不同视频）
   * @returns 搜索结果数组
   */
  async searchByText(
    query: TextSearchQuery,
    allScenes: Map<string, RuntimeSceneChangePoint[]>,
  ): Promise<TextSearchResult[]> {
    const {
      text,
      limit = 10,
      minSimilarity = 0.2,
      videoNames = [],
    } = query

    if (!text.trim()) {
      return []
    }

    try {
      console.log('开始文本搜索:', text)

      // 提取查询文本的特征向量
      const queryFeatures = await this.textExtractor.extractFeatureFromText(text.trim())

      const results: TextSearchResult[] = []

      // 遍历所有视频的分镜
      for (const [videoName, scenes] of allScenes) {
        // 如果指定了视频名称范围，则过滤
        if (videoNames.length > 0 && !videoNames.includes(videoName)) {
          continue
        }

        // 遍历该视频的所有分镜
        for (const scene of scenes) {
          // 需要有图像特征向量才能进行相似度计算
          if (!scene.imageFeatures) {
            continue
          }

          try {
            // 计算文本特征与图像特征的相似度
            const similarity = CLIPTextExtractor.calculateTextImageSimilarity(
              queryFeatures,
              scene.imageFeatures,
            )

            // 只保留相似度超过阈值的结果
            if (similarity >= minSimilarity) {
              results.push({
                videoName,
                scene,
                similarity,
                queryText: text,
              })
            }
          }
          catch (error) {
            console.warn(`文本-图像相似度计算失败 (${videoName}, 场景 ${scene.frameIndex}):`, error)
          }
        }
      }

      // 按相似度降序排序并返回限制数量的结果
      results.sort((a, b) => b.similarity - a.similarity)
      console.log(`文本搜索完成，找到 ${results.length} 个匹配结果`)

      return results.slice(0, limit)
    }
    catch (error) {
      console.error('文本搜索失败:', error)
      throw error
    }
  }
}
