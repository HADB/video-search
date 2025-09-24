export interface EntryItem {
  name: string
  kind: 'file' | 'directory'
  handle: FileSystemFileHandle | FileSystemDirectoryHandle
  size?: number
  lastModified?: Date
  type?: string
}

export interface StoredDirectoryInfo {
  id: string
  name: string
}

// 视频分镜检测相关类型

/** 分镜切换点（支持不同的特征向量类型） */
export interface SceneChangePoint<T = Float32Array> {
  /** 分镜切换时间点（秒） */
  timestamp: number
  /** 差异度分数 (0-1，值越高差异越大) */
  score: number
  /** 帧索引 */
  frameIndex: number
  /** 格式化的时间戳 (MM:SS) */
  formattedTime?: string
  /** 缩略图文件名 */
  thumbnailFileName?: string
  /** 分镜长度（秒） */
  duration?: number
  /** 格式化的分镜长度 (MM:SS) */
  formattedDuration?: string
  /** 分镜首帧图片 blob URL（仅运行时） */
  frameImageUrl?: string
  /** 图像特征向量 */
  imageFeatures?: T
}

/** 运行时分镜切换点类型别名 */
export type RuntimeSceneChangePoint = SceneChangePoint<Float32Array>

/** 存储用分镜切换点类型别名 */
export type StoredSceneChangePoint = SceneChangePoint<number[]>

export interface VideoAnalysisResult {
  /** 视频文件名 */
  videoName: string
  /** 分析时间戳 */
  timestamp: string
  /** 总场景数（包括第一个场景） */
  totalScenes: number
  /** 分镜切换点数组 */
  sceneChanges: RuntimeSceneChangePoint[]
  /** 分析配置 */
  options: AnalysisOptions
  /** 视频时长（秒） */
  duration?: number
  /** 视频文件 handle */
  fileHandle?: FileSystemFileHandle
}

/** 视频场景分析结果集合 */
export interface SceneAnalysisResultsMap {
  [videoName: string]: VideoAnalysisResult
}

export interface VideoMetadata {
  /** 视频文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
  /** 视频时长（秒） */
  duration: number
  /** 视频分辨率 */
  resolution?: {
    width: number
    height: number
  }
  /** 帧率 */
  frameRate?: number
  /** 视频格式 */
  format?: string
}

export interface AnalysisOptions {
  /** 检测敏感度阈值 (0-1，值越低越敏感) */
  threshold: number
  /** 视频缩放尺寸，用于提高处理速度 */
  scaledSize: number
  /** 是否启用特征提取 */
  enableFeatureExtraction?: boolean
}

/** 持久化存储的分镜结果（不含 blob URLs 和 fileHandle） */
export interface StoredSceneAnalysisResult {
  /** 视频文件名 */
  videoName: string
  /** 分析时间戳 */
  timestamp: string
  /** 总场景数（包括第一个场景） */
  totalScenes: number
  /** 分镜切换点数组 */
  sceneChanges: StoredSceneChangePoint[]
  /** 分析配置 */
  options: AnalysisOptions
  /** 视频时长（秒） */
  duration?: number
}

/** 按目录路径组织的存储结构 */
export interface DirectorySceneAnalysisResults {
  [directoryPath: string]: {
    [videoName: string]: StoredSceneAnalysisResult
  }
}

/** 图像特征相关类型 */
export interface ImageFeatures {
  /** 特征向量维度 */
  dimensions: number
  /** 特征向量数据 */
  features: Float32Array
  /** 提取时间戳 */
  extractedAt: string
  /** 使用的模型名称 */
  modelName: string
}

/** 特征向量搜索结果 */
export interface FeatureSearchResult {
  /** 视频名称 */
  videoName: string
  /** 分镜信息 */
  scene: RuntimeSceneChangePoint
  /** 相似度分数 (0-1，值越高越相似) */
  similarity: number
  /** 匹配的特征向量 */
  features: Float32Array
}

/** 特征向量索引配置 */
export interface FeatureIndexConfig {
  /** 是否启用特征提取 */
  enabled: boolean
  /** 使用的模型名称 */
  modelName: string
  /** 特征向量维度 */
  dimensions: number
  /** 相似度搜索阈值 */
  similarityThreshold: number
}

/** 图像搜索查询 */
export interface ImageSearchQuery {
  /** 查询图像的特征向量 */
  queryFeatures: Float32Array
  /** 搜索结果数量限制 */
  limit?: number
  /** 最小相似度阈值 */
  minSimilarity?: number
  /** 指定搜索的视频范围 */
  videoNames?: string[]
}

/** 文本搜索查询 */
export interface TextSearchQuery {
  /** 查询文本 */
  text: string
  /** 搜索结果数量限制 */
  limit?: number
  /** 最小相似度阈值 */
  minSimilarity?: number
  /** 指定搜索的视频范围 */
  videoNames?: string[]
}

/** 文本搜索结果 */
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
