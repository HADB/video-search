<script setup lang="ts">
interface Props {
  item: EntryItem
}

const props = defineProps<Props>()

// 按照 NuxtUI 文档要求，使用 emit 方式
const emit = defineEmits<{ close: [boolean] }>()

// 确认删除
function confirmDelete() {
  emit('close', true)
}

// 取消删除
function cancel() {
  emit('close', false)
}
</script>

<template>
  <UModal
    :close="{ onClick: () => cancel() }"
    title="确认删除"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex items-start space-x-3">
          <div class="flex-shrink-0">
            <UIcon
              name="heroicons:exclamation-triangle"
              class="text-2xl text-warning-500"
            />
          </div>
          <div class="flex-1">
            <p class="text-gray-900 dark:text-gray-100 font-medium mb-2">
              确定要删除{{ props.item.kind === 'directory' ? '文件夹' : '文件' }} "{{ props.item.name }}" 吗？
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ props.item.kind === 'directory' ? '文件夹及其所有内容将被永久删除，此操作无法撤销。' : '文件将被永久删除，此操作无法撤销。' }}
            </p>
          </div>
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
          color="error"
          @click="confirmDelete"
        >
          删除
        </UButton>
      </div>
    </template>
  </UModal>
</template>
