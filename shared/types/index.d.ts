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
export interface SceneChangePoint {
  /** 分镜切换时间点（秒） */
  timestamp: number
  /** 差异度分数 (0-1，值越高差异越大) */
  score: number
  /** 帧索引 */
  frameIndex: number
  /** 格式化的时间戳 (MM:SS) */
  formattedTime?: string
  /** 分镜首帧图片 blob URL */
  frameImageUrl?: string
  /** 缩略图文件名 */
  thumbnailFileName?: string
  /** 分镜长度（秒） */
  duration?: number
  /** 格式化的分镜长度 (MM:SS) */
  formattedDuration?: string
}

export interface VideoAnalysisResult {
  /** 视频文件名 */
  videoName: string
  /** 分析时间戳 */
  timestamp: string
  /** 总场景数（包括第一个场景） */
  totalScenes: number
  /** 分镜切换点数组 */
  sceneChanges: SceneChangePoint[]
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

/** 持久化存储的分镜切换点（不含 blob URL） */
export interface StoredSceneChangePoint {
  /** 分镜切换时间点（秒） */
  timestamp: number
  /** 差异度分数 (0-1，值越高差异越大) */
  score: number
  /** 帧索引 */
  frameIndex: number
  /** 格式化的时间戳 (MM:SS) */
  formattedTime?: string
  /** 分镜首帧图片文件名 */
  thumbnailFileName?: string
  /** 分镜长度（秒） */
  duration?: number
  /** 格式化的分镜长度 (MM:SS) */
  formattedDuration?: string
}

/** 按目录路径组织的存储结构 */
export interface DirectorySceneAnalysisResults {
  [directoryPath: string]: {
    [videoName: string]: StoredSceneAnalysisResult
  }
}
