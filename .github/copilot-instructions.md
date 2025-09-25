# 项目简介

在 Web 端实现逐帧检测本地视频，并识别出切换分镜的时间点，通过 CLIP 索引每个分镜的首帧，并通过关键词搜索出指定分镜的功能。

## 技术栈

- **前端框架**: Nuxt 3 + Vue 3
- **UI 库**: Nuxt UI
- **视频处理**: MediaBunny
- **存储**: localStorage + File System Access API
- **类型系统**: TypeScript

## 注意事项

- 本项目使用了 Nuxt，会自动 import utils、components、composables、types 等目录的方法和组件等，无需手动 import
- 类型定义统一放到 `shared/types.ts` 中
- 不要生成测试或示例代码，直接在当前项目代码中新增或修改
- 不要执行 `pnpm dev` 命令，我会帮你运行并测试
- 不要输出总结，不要自动生成说明文档
- 代码尽可能简洁明了、高性能，不要写冗余代码，在必要时请提取公共方法
