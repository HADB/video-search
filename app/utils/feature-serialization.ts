/**
 * 特征向量序列化工具函数
 */
export class FeatureSerializationUtils {
  /**
   * 将 Float32Array 转换为数组以便序列化
   * @param features Float32Array 特征向量
   * @returns 数字数组
   */
  static serializeFeatures(features: Float32Array): number[] {
    return Array.from(features)
  }

  /**
   * 将数组转换回 Float32Array
   * @param featuresArray 数字数组
   * @returns Float32Array 特征向量
   */
  static deserializeFeatures(featuresArray: number[]): Float32Array {
    return new Float32Array(featuresArray)
  }

  /**
   * 将 SceneChangePoint 转换为可存储的格式
   * @param scene 包含 Float32Array 的分镜点
   * @returns 可存储的分镜点
   */
  static serializeSceneChangePoint(scene: SceneChangePoint): StoredSceneChangePoint {
    const stored: StoredSceneChangePoint = {
      timestamp: scene.timestamp,
      score: scene.score,
      frameIndex: scene.frameIndex,
      formattedTime: scene.formattedTime,
      thumbnailFileName: scene.thumbnailFileName,
      duration: scene.duration,
      formattedDuration: scene.formattedDuration,
    }

    // 如果有特征向量，则序列化
    if (scene.imageFeatures) {
      stored.imageFeatures = this.serializeFeatures(scene.imageFeatures)
    }

    return stored
  }

  /**
   * 将可存储的格式转换回 SceneChangePoint
   * @param storedScene 存储的分镜点
   * @returns 包含 Float32Array 的分镜点
   */
  static deserializeSceneChangePoint(storedScene: StoredSceneChangePoint): SceneChangePoint {
    const scene: SceneChangePoint = {
      timestamp: storedScene.timestamp,
      score: storedScene.score,
      frameIndex: storedScene.frameIndex,
      formattedTime: storedScene.formattedTime,
      thumbnailFileName: storedScene.thumbnailFileName,
      duration: storedScene.duration,
      formattedDuration: storedScene.formattedDuration,
    }

    // 如果有序列化的特征向量，则反序列化
    if (storedScene.imageFeatures) {
      scene.imageFeatures = this.deserializeFeatures(storedScene.imageFeatures)
    }

    return scene
  }

  /**
   * 将 VideoAnalysisResult 转换为可存储的格式
   * @param result 包含 Float32Array 的分析结果
   * @returns 可存储的分析结果
   */
  static serializeVideoAnalysisResult(result: VideoAnalysisResult): StoredSceneAnalysisResult {
    return {
      videoName: result.videoName,
      timestamp: result.timestamp,
      totalScenes: result.totalScenes,
      sceneChanges: result.sceneChanges.map((scene) => this.serializeSceneChangePoint(scene)),
      options: result.options,
      duration: result.duration,
    }
  }

  /**
   * 将可存储的格式转换回 VideoAnalysisResult
   * @param storedResult 存储的分析结果
   * @returns 包含 Float32Array 的分析结果
   */
  static deserializeVideoAnalysisResult(storedResult: StoredSceneAnalysisResult): Omit<VideoAnalysisResult, 'fileHandle'> {
    return {
      videoName: storedResult.videoName,
      timestamp: storedResult.timestamp,
      totalScenes: storedResult.totalScenes,
      sceneChanges: storedResult.sceneChanges.map((scene) => this.deserializeSceneChangePoint(scene)),
      options: storedResult.options,
      duration: storedResult.duration,
    }
  }

  /**
   * 批量序列化分镜数组
   * @param scenes 分镜数组
   * @returns 可存储的分镜数组
   */
  static serializeScenes(scenes: SceneChangePoint[]): StoredSceneChangePoint[] {
    return scenes.map((scene) => this.serializeSceneChangePoint(scene))
  }

  /**
   * 批量反序列化分镜数组
   * @param storedScenes 存储的分镜数组
   * @returns 分镜数组
   */
  static deserializeScenes(storedScenes: StoredSceneChangePoint[]): SceneChangePoint[] {
    return storedScenes.map((scene) => this.deserializeSceneChangePoint(scene))
  }

  /**
   * 检查分镜是否包含特征向量
   * @param scene 分镜点
   * @returns 是否包含特征向量
   */
  static hasFeatures(scene: SceneChangePoint | StoredSceneChangePoint): boolean {
    return Boolean(scene.imageFeatures && scene.imageFeatures.length > 0)
  }

  /**
   * 统计包含特征向量的分镜数量
   * @param scenes 分镜数组
   * @returns 统计结果
   */
  static getFeatureStats(scenes: SceneChangePoint[] | StoredSceneChangePoint[]): {
    total: number
    withFeatures: number
    withoutFeatures: number
    featureRate: number
  } {
    const total = scenes.length
    const withFeatures = scenes.filter((scene) => this.hasFeatures(scene)).length
    const withoutFeatures = total - withFeatures
    const featureRate = total > 0 ? withFeatures / total : 0

    return {
      total,
      withFeatures,
      withoutFeatures,
      featureRate,
    }
  }
}

/**
 * 特征向量数据验证工具
 */
export class FeatureValidationUtils {
  /**
   * 验证特征向量的有效性
   * @param features 特征向量
   * @returns 是否有效
   */
  static isValidFeatures(features: Float32Array | number[] | undefined): boolean {
    if (!features) {
      return false
    }
    if (features.length === 0) {
      return false
    }

    // 检查是否包含有效的数值
    for (let i = 0; i < features.length; i++) {
      const value = features[i]
      if (value === undefined || value === null || Number.isNaN(value)) {
        return false
      }
    }

    return true
  }

  /**
   * 验证特征向量的维度
   * @param features 特征向量
   * @param expectedDimensions 期望的维度
   * @returns 是否匹配
   */
  static validateDimensions(features: Float32Array | number[], expectedDimensions: number): boolean {
    return features.length === expectedDimensions
  }

  /**
   * 清理无效的特征向量
   * @param scenes 分镜数组
   * @returns 清理后的分镜数组
   */
  static cleanInvalidFeatures(scenes: SceneChangePoint[]): SceneChangePoint[] {
    return scenes.map((scene) => {
      if (scene.imageFeatures && !this.isValidFeatures(scene.imageFeatures)) {
        console.warn(`清理无效特征向量: 帧 ${scene.frameIndex}`)
        const cleanedScene = { ...scene }
        delete cleanedScene.imageFeatures
        return cleanedScene
      }
      return scene
    })
  }

  /**
   * 检测并修复损坏的特征数据
   * @param storedScenes 存储的分镜数据
   * @returns 修复后的数据
   */
  static repairCorruptedFeatures(storedScenes: StoredSceneChangePoint[]): StoredSceneChangePoint[] {
    return storedScenes.map((scene) => {
      if (scene.imageFeatures && !this.isValidFeatures(scene.imageFeatures)) {
        console.warn(`发现损坏的特征数据: 帧 ${scene.frameIndex}，已移除`)
        const repairedScene = { ...scene }
        delete repairedScene.imageFeatures
        return repairedScene
      }
      return scene
    })
  }
}
