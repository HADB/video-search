<script setup lang="ts">
interface FileItem {
  name: string
  kind: 'file' | 'directory'
  handle: FileSystemFileHandle | FileSystemDirectoryHandle
  size?: number
  lastModified?: Date
  type?: string
}

interface Props {
  file: FileItem
  content: string
  type: string
}

const props = defineProps<Props>()

// 按照 NuxtUI 文档要求，使用 emit 方式
const emit = defineEmits<{ close: [boolean] }>()

// 下载文件
async function downloadFile(item: FileItem) {
  if (item.kind === 'directory') {
    return
  }

  try {
    const fileHandle = item.handle as FileSystemFileHandle
    const file = await fileHandle.getFile()
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    a.click()
    URL.revokeObjectURL(url)

    const toast = useToast()
    toast.add({
      title: '文件下载已开始',
      color: 'success',
    })
  }
  catch (error: any) {
    const toast = useToast()
    toast.add({
      title: '下载文件失败',
      description: error.message,
      color: 'error',
    })
  }
}

onUnmounted(() => {
  // 组件销毁时清理 blob URL
  if (props.content.indexOf('blob:') === 0) {
    URL.revokeObjectURL(props.content)
  }
})
</script>

<template>
  <UModal
    :close="{ onClick: () => emit('close', false) }"
    :title="file.name || '文件预览'"
  >
    <template #body>
      <div class="preview-container">
        <!-- 文本文件预览 -->
        <div v-if="type === 'text'" class="max-h-96 overflow-auto">
          <pre class="bg-gray-800 p-4 rounded text-sm font-mono whitespace-pre-wrap text-gray-200 border border-gray-700">{{ content }}</pre>
        </div>

        <!-- 图片预览 -->
        <div v-else-if="type === 'image'" class="flex justify-center">
          <img
            :src="content"
            class="max-w-full max-h-96 h-auto object-contain"
            alt="图片预览"
            style="min-height: 100px;"
          >
        </div>

        <!-- 视频预览 -->
        <div v-else-if="type === 'video'">
          <video
            :src="content"
            controls
            class="w-full max-h-80"
          >
            您的浏览器不支持视频播放
          </video>
        </div>

        <!-- 音频预览 -->
        <div v-else-if="type === 'audio'">
          <audio
            :src="content"
            controls
            class="w-full"
          >
            您的浏览器不支持音频播放
          </audio>
        </div>

        <!-- PDF预览 -->
        <div v-else-if="type === 'pdf'">
          <iframe
            :src="content"
            class="w-full h-96"
          />
        </div>

        <!-- 不支持预览的文件 -->
        <div v-else class="py-12">
          <div class="text-center">
            <div class="text-6xl text-gray-600 mb-4">
              📄
            </div>
            <p class="text-gray-400 text-lg mb-6">
              此文件类型暂不支持预览
            </p>
            <UButton
              icon="i-heroicons-arrow-down-tray"
              @click="downloadFile(file)"
            >
              下载文件
            </UButton>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end space-x-3">
        <UButton color="neutral" variant="ghost" @click="emit('close', false)">
          关闭
        </UButton>
        <UButton
          icon="i-heroicons-arrow-down-tray"
          @click="downloadFile(file)"
        >
          下载
        </UButton>
      </div>
    </template>
  </UModal>
</template>
