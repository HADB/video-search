import { del, get, set } from 'idb-keyval'

/**
 * 检查浏览器是否支持文件系统访问API
 * @returns 浏览器是否支持文件系统访问API
 */
export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/**
 * 验证目录句柄是否仍然有效
 * @param handle 目录句柄
 * @param mode 权限模式，默认为 'readwrite'
 * @returns 如果句柄有效且有读写权限，返回 true；否则返回 false
 */
export async function requestDirectoryPermission(handle: FileSystemDirectoryHandle, mode: FileSystemPermissionMode = 'readwrite'): Promise<boolean> {
  try {
    // 尝试获取权限
    const permission = await handle.queryPermission({ mode })
    if (permission === 'granted') {
      return true
    }

    // 如果权限是 'prompt'，尝试请求权限
    if (permission === 'prompt') {
      const requestPermission = await handle.requestPermission({ mode })
      return requestPermission === 'granted'
    }

    return false
  }
  catch (error) {
    console.error('验证目录句柄失败:', error)
    return false
  }
}

/**
 * 创建新目录
 * @param parentHandle 父目录句柄
 * @param newDirName 新目录名称
 * @returns 新创建的目录句柄
 */
export async function createNewDirectory(parentHandle: FileSystemDirectoryHandle, newDirName: string) {
  return await parentHandle.getDirectoryHandle(newDirName, { create: true })
}

/**
 * 创建新文件
 * @param parentHandle 父目录句柄
 * @param newFileName 新文件名称
 * @returns 新创建的文件句柄
 */
export async function createNewFile(parentHandle: FileSystemDirectoryHandle, newFileName: string) {
  return await parentHandle.getFileHandle(newFileName, { create: true })
}

/**
 * 删除目录或文件
 * @param handle 目录句柄
 * @param name 名称
 * @param isDirectory 是否为目录
 */
export async function deleteEntry(handle: FileSystemDirectoryHandle, name: string, isDirectory: boolean) {
  await handle.removeEntry(name, { recursive: isDirectory })
}

/**
 * 写入文件
 * @param handle 文件句柄
 * @param file 文件对象
 * @param onProgress 进度回调
 * @returns 如果写入成功，返回 true；否则返回 false
 */
export async function writeFile(handle: FileSystemFileHandle, file: File, onProgress: (progress: number) => void): Promise<boolean> {
  try {
    const writable = await handle.createWritable()
    const chunkSize = 1024 * 1024 // 1MB chunks
    let offset = 0

    while (offset < file.size) {
      const chunk = file.slice(offset, offset + chunkSize)
      await writable.write(chunk)
      offset += chunk.size
      onProgress(offset / file.size)
    }

    await writable.close()
    return true
  }
  catch (error) {
    console.error('写入文件失败:', error)
    return false
  }
}

/**
 * 读取文件
 * @param handle 文件句柄
 * @returns 文件对象
 */
export async function readFile(handle: FileSystemFileHandle) {
  return await handle.getFile()
}

/**
 * 列出目录中的所有条目
 * @param handle 目录句柄
 * @returns 目录条目数组
 */
export async function listDirectoryEntryItems(handle: FileSystemDirectoryHandle) {
  const entryItems: Array<EntryItem> = []

  for await (const entry of handle.values()) {
    const item: EntryItem = {
      name: entry.name,
      kind: entry.kind,
      handle: entry,
    }
    if (entry.kind === 'file') {
      const file = await entry.getFile()
      item.size = file.size
      item.lastModified = new Date(file.lastModified)
      item.type = file.type
    }
    entryItems.push(item)
  }
  entryItems.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
  return entryItems
}

/**
 * 格式化文件大小
 * @param bytes 文件大小（字节）
 * @returns 格式化后的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B'
  }
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / (k ** i)).toFixed(2))} ${sizes[i]}`
}

/**
 * 保存目录句柄到 IndexedDB
 * @param handle 目录句柄
 * @returns 生成的唯一目录 ID
 */
export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const id = crypto.randomUUID()
  await set(id, handle)
  return id
}

/**
 * 获取目录句柄
 * @param id 目录 ID
 * @returns 目录句柄
 */
export async function getDirectoryHandle(id: string) {
  return await get<FileSystemDirectoryHandle>(id)
}

/**
 * 移除目录句柄
 * @param id 目录 ID
 * @returns 如果移除成功，返回 true；否则返回 false
 */
export async function removeDirectoryHandle(id: string) {
  return await get(id) && await del(id)
}

/**
 * 比较两个文件系统条目是否相同
 * @param handle1 文件系统句柄 1
 * @param handle2 文件系统句柄 2
 * @returns 如果两个条目相同，返回 true；否则返回 false
 */
export async function isSameEntry(handle1?: FileSystemHandle, handle2?: FileSystemHandle) {
  return handle1 && handle2 && await handle1.isSameEntry(handle2)
}

/**
 * 下载文件的公共函数
 * @param handle 文件句柄
 * @param filename 文件名
 * @returns Promise<void>
 */
export async function downloadFile(handle: FileSystemFileHandle, filename: string): Promise<void> {
  const file = await handle.getFile()
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
