<script setup lang="ts">
interface Props {
  existingFolders: string[]
}

const props = defineProps<Props>()

// 按照 NuxtUI 文档要求，使用 emit 方式
const emit = defineEmits<{ close: [string | null] }>()

const folderName = ref('')
const toast = useToast()

// 确认创建文件夹
function confirmCreate() {
  const finalFolderName = folderName.value.trim()

  if (!finalFolderName) {
    toast.add({
      title: '创建失败',
      description: '请输入文件夹名称',
      color: 'error',
    })
    return
  }

  // 检查文件夹是否已存在
  if (props.existingFolders.includes(finalFolderName)) {
    toast.add({
      title: '创建失败',
      description: `文件夹 "${finalFolderName}" 已存在`,
      color: 'error',
    })
    return
  }

  // 返回文件夹名称
  emit('close', finalFolderName)
}

// 取消创建
function cancel() {
  emit('close', null)
}
</script>

<template>
  <UModal
    :close="{ onClick: () => cancel() }"
    title="新建文件夹"
  >
    <template #body>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            文件夹名称
          </label>
          <UInput
            v-model="folderName"
            placeholder="请输入文件夹名称"
            autofocus
            size="md"
            @keydown.enter="confirmCreate"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          @click="cancel"
        >
          取消
        </UButton>
        <UButton
          color="primary"
          :disabled="!folderName.trim()"
          @click="confirmCreate"
        >
          创建
        </UButton>
      </div>
    </template>
  </UModal>
</template>
