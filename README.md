# Video Search

在 Web 端实现 CLIP 索引本地视频，并通过关键词搜索视频内容。

## TODO

- [ ] 通过 File System Access 实现读写本地工作目录
  - [ ] 列表显示本地已授权的工作目录
  - [ ] 已授权的目录信息存储于 [sqlite wasm](https://github.com/sqlite/sqlite-wasm)
- [ ] 识别视频分镜，记录视频分镜时间点
- [ ] 通过 CLIP 实现每个分镜首帧的索引
- [ ] 通过某种数据库记录索引结果（[LanceDB](https://lancedb.github.io/lancedb/)）
- [ ] 通过关键词搜索，显示相似度前十的分镜
- [ ] 点击某个分镜，预览分镜内容
