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
export interface VideoSceneChangePoint {
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
}

export interface VideoAnalysisProgress {
  /** 当前进度 (0-1) */
  progress: number
  /** 当前处理的帧索引 */
  currentFrame: number
  /** 总帧数 */
  totalFrames: number
  /** 当前检测到的场景数量 */
  scenesDetected: number
  /** 处理开始时间 */
  startTime?: number
  /** 预计剩余时间（毫秒） */
  estimatedTimeLeft?: number
}

export interface VideoAnalysisOptions {
  /** 检测敏感度阈值 (0-1，值越低越敏感) */
  threshold: number
  /** 采样间隔（秒），每隔多少秒分析一帧 */
  sampleInterval: number
  /** 视频缩放尺寸，用于提高处理速度 */
  scaledSize: number
}

export interface VideoAnalysisResult {
  /** 视频文件名 */
  videoName: string
  /** 分析时间戳 */
  timestamp: string
  /** 总场景数（包括第一个场景） */
  totalScenes: number
  /** 分镜切换点数组 */
  sceneChanges: VideoSceneChangePoint[]
  /** 分析配置 */
  options: VideoAnalysisOptions
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
