# 资料封面

独立 React 模块管理封面预览与选择。应用提供附件、预览 URL 和保存回调；组件不播放视频。

```powershell
pnpm --dir experiments/cover-ui install --ignore-scripts
pnpm --dir experiments/cover-ui build
```

输出为根目录 `cover-ui.js` 与许可证文件，样式位于 `cover-ui.css`。依赖版本由锁文件固定。

构建也生成按需加载的 `canvas-summary.js`。该模块复用画布的 Yjs 依赖，读取已有画布中字符最多的富文本框（忽略空白字符计数），不包含表格和固定字段。资料卡片展示来源，不使用正文或文件信息代替摘要。

指定封面保存在画布 JSON 的 `coverAssetId` 中。新媒体通过 `coverSourceId` 转换为资源 ID；自动封面保存 null。最多显示三层，超出显示剩余数量。取消编辑不会保存选择。
