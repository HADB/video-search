<template>
  <div>
    <header class="border-b-1 border-default">
      <UContainer class="flex items-center gap-2 p-4 text-2xl">
        <UIcon name="custom:logo" />
        <h1 class="font-bold">
          分镜检索
        </h1>
      </UContainer>
    </header>
    <UContainer class="p-4">
      <slot />
    </UContainer>
  </div>
</template>
