import type { FeatureSearchResult, RuntimeSceneChangePoint } from '../../shared/types'
import { CLIPTextExtractor, getGlobalTextExtractor } from './text-feature-extractor'

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
      console.log('查询文本特征向量提取完成，维度:', queryFeatures.length)

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

  /**
   * 多关键词搜索（支持多个查询词）
   * @param queries 多个查询文本
   * @param allScenes 所有分镜数据
   * @param options 搜索选项
   * @returns 合并的搜索结果
   */
  async searchByMultipleTexts(
    queries: string[],
    allScenes: Map<string, SceneChangePoint[]>,
    options: {
      limit?: number
      minSimilarity?: number
      videoNames?: string[]
      combineMethod?: 'max' | 'average' // 多个查询结果的合并方式
    } = {},
  ): Promise<TextSearchResult[]> {
    const {
      limit = 20,
      minSimilarity = 0.15,
      videoNames = [],
      combineMethod = 'max',
    } = options

    if (queries.length === 0) {
      return []
    }

    // 过滤空查询
    const validQueries = queries.filter((q) => q.trim())
    if (validQueries.length === 0) {
      return []
    }

    console.log('开始多关键词搜索:', validQueries)
    const combinedResults = new Map<string, TextSearchResult>()

    // 遍历所有视频的分镜
    for (const [videoName, scenes] of allScenes) {
      if (videoNames.length > 0 && !videoNames.includes(videoName)) {
        continue
      }

      for (const scene of scenes) {
        // 需要有图像特征向量才能进行相似度计算
        if (!scene.imageFeatures) {
          continue
        }

        const similarities: number[] = []

        // 需要有图像特征向量才能进行相似度计算
        if (!scene.imageFeatures) {
          continue
        }

        // 计算每个查询文本与当前分镜的相似度
        for (const query of validQueries) {
          try {
            const queryFeatures = await this.textExtractor.extractFeatureFromText(query.trim())
            const similarity = CLIPTextExtractor.calculateTextImageSimilarity(
              queryFeatures,
              scene.imageFeatures,
            )
            similarities.push(similarity)
          }
          catch (error) {
            console.warn(`多关键词搜索匹配失败 (${query}):`, error)
          }
        }

        if (similarities.length === 0) {
          continue
        }

        // 根据合并方式计算最终相似度
        let finalSimilarity: number
        if (combineMethod === 'max') {
          finalSimilarity = Math.max(...similarities)
        }
        else {
          finalSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length
        }

        if (finalSimilarity >= minSimilarity) {
          const key = `${videoName}_${scene.frameIndex}`

          // 如果已存在更高相似度的结果，则保留更高的
          if (!combinedResults.has(key) || combinedResults.get(key)!.similarity < finalSimilarity) {
            combinedResults.set(key, {
              videoName,
              scene,
              similarity: finalSimilarity,
              queryText: validQueries.join(' + '),
            })
          }
        }
      }
    }

    // 转换为数组并排序
    const results = Array.from(combinedResults.values())
    results.sort((a, b) => b.similarity - a.similarity)

    console.log(`多关键词搜索完成，找到 ${results.length} 个匹配结果`)
    return results.slice(0, limit)
  }

  /**
   * 智能搜索建议（根据已有分镜内容推荐相关查询词）
   * @param allScenes 所有分镜数据
   * @param _sampleSize 采样大小（暂未使用）
   * @returns 建议的搜索词
   */
  async generateSearchSuggestions(
    allScenes: Map<string, SceneChangePoint[]>,
    _sampleSize: number = 50,
  ): Promise<string[]> {
    // 这里可以实现基于场景内容的搜索建议
    // 由于无法直接从图像特征逆向生成文本，这里提供一些通用的中文搜索建议
    const commonSuggestions = [
      '人物',
      '风景',
      '建筑',
      '动物',
      '食物',
      '交通工具',
      '室内',
      '室外',
      '白天',
      '夜晚',
      '城市',
      '乡村',
      '运动',
      '音乐',
      '聚会',
      '工作',
      '学习',
      '休闲',
      '春天',
      '夏天',
      '秋天',
      '冬天',
      '雨天',
      '晴天',
      '海滩',
      '山峰',
      '森林',
      '草原',
      '湖泊',
      '河流',
    ]

    // 随机返回一部分建议
    const shuffled = commonSuggestions.sort(() => 0.5 - Math.random())
    return shuffled.slice(0, Math.min(10, shuffled.length))
  }

  /**
   * 获取文本提取器状态
   */
  getExtractorStatus(): { initialized: boolean } {
    return {
      initialized: this.textExtractor.initialized,
    }
  }

  /**
   * 预热搜索服务（预加载模型）
   */
  async warmUp(): Promise<void> {
    try {
      console.log('预热文本搜索服务...')
      // 预热文本特征提取器
      await this.textExtractor.extractFeatureFromText('测试')
      console.log('文本搜索服务预热完成')
    }
    catch (error) {
      console.error('预热失败:', error)
      throw error
    }
  }
}

// 单例实例
let globalTextSearchService: TextSearchService | null = null

/**
 * 获取全局的文本搜索服务实例
 */
export function getGlobalTextSearchService(): TextSearchService {
  if (!globalTextSearchService) {
    globalTextSearchService = new TextSearchService()
  }
  return globalTextSearchService
}
