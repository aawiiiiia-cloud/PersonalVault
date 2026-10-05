# 知行台 · 方法论驱动的个人知识工作台

这是一个用于验证知识管理流程的本地桌面初版。重点不是模拟完整的笔记软件，而是把以下过程嵌入界面：

1. 捕获原始信息；
2. 围绕明确目标开展项目；
3. 通过复盘把经历转化为经验；
4. 把经验提炼为可以再次调用的知识。

## 使用

开发环境使用 Node.js 24 和 npm。首次运行执行 `npm ci`，然后在 Windows 上双击 `启动桌面版.cmd`，或执行 `npm run desktop`。桌面版支持选择文件、拖入画布、独立预览和定位文件。程序会自动寻找带有 `vault.json` 的 `PersonalVault`；也可以通过环境变量 `PERSONAL_VAULT_PATH` 指定资料库的绝对路径。

`启动知识工作台.cmd` 是浏览器备用入口，启动后访问 `http://127.0.0.1:4173/`。浏览器支持通过选择和拖拽上传附件，但不能直接取得任意本地文件的完整路径。

网页仍保留浏览器副本；在“数据管理”中点击“把当前卡片写入移动硬盘”，每条内容会保存为一份独立 Markdown 文件，同时生成卡片清单。

桌面版启动时会读取移动硬盘中的最新状态，每次保存也会自动同步到 `PersonalVault`。浏览器备用版仍需通过左下角“数据管理”手动写入移动硬盘。迁移包会保留全部字段与关联；Markdown 是便于长期阅读和迁移的独立副本。

## 当前边界

- 已实现：分层导航、随手记双向分类、领域、项目、附属于项目的复盘、项目待办列表、知识、资料、只读详情与显式编辑、可恢复回收站、双向关系展示、数据完整性检查、独立 Markdown 卡片、桌面文件入库、可重建的 SQLite 全文检索，以及按用户明确搜索意图加载的 multilingual-e5-base 本地多语言语义检索。应用启动、普通浏览、精确检索和数据状态检查均不会加载语义模型。
- 已实现画布与附件呈现：项目、知识、资料支持自由画布、画廊与列表、自动及指定封面。独立预览按图片、视频、音频、阅读、模型等类型分组；支持 PDF、文本/Markdown、CSV、PSD 预览、EPUB 阅读和 3D 模型旋转缩放。工程文件使用统一附件卡片。
- 已实现附件存储：每张卡片独立保存到 `文件/项目|知识|资料/<卡片标题>--<卡片ID>/`，附件清单按卡片拆分并建立索引；不同卡片导入相同文件分别保存。新附件保存到卡片时自动建立对应目录。批量迁移工具见 `scripts/migrate-attachment-folders.mjs`。
- 已保存附件以资料库原文件为准，独立预览按需读取当前文件；未保存附件使用临时草稿缓存，保存成功后释放。原文件缺失时显示缺失提示，恢复文件需要明确操作。数据管理提供缓存占用查看和清理。删除画布中的附件块仅移除引用，不会自动删除资料库原文件。
- 已实现双向关系图谱；尚未实现：用较大规模真实检索测试集继续调优、Agent 接入、Windows/macOS 正式安装包。

SQLite 文件位于 `PersonalVault\系统\索引\knowledge.sqlite`。它不是原始数据；删除或损坏后，可在“数据管理”中从卡片一键重建。

默认语义模型位于 `PersonalVault\系统\模型\onnx-community\multilingual-e5-base-ONNX`；278MB 模型权重只在当前开发阶段下载一次，Windows 与 Mac 共用。对应向量目录位于 `PersonalVault\系统\索引\semantic-multilingual-e5-base-q8.sqlite`。不同模型使用不同目录，均可删除和重建；旧 BGE-small 目录保留用于回退。程序及运行组件仍需在每台电脑分别安装一次，但插拔硬盘不需要重复安装。详细取舍见 `向量检索技术决策.md`。

Windows 自动按 DirectML → WebGPU → CPU 尝试推理设备；Apple 芯片 Mac 自动按 Core ML → WebGPU → CPU 尝试。当前 Windows 主机已经验证使用 DirectML。

## 资料库与构建

资料库包含 `卡片/`、`文件/`、`系统/`。个人资料、附件、缓存和模型不提交到 Git。当前演示数据可以从左下角重置。

自由画布与文件预览源码在 `experiments/blocksuite-edgeless/`，封面及画廊模块源码在 `experiments/cover-ui/`。根目录已包含生产构建产物；修改这些源码后，安装对应依赖并重新构建：

```powershell
pnpm --dir experiments/blocksuite-edgeless install --frozen-lockfile
pnpm --dir experiments/cover-ui install --frozen-lockfile
npm run build:canvas
npm run build:cover
npm run check
npm test
```

桌面测试与画布浏览器测试使用独立临时资料库及浏览器配置目录，自动启动的子进程以临时目录为工作目录，避免 Windows 拼写检查组件在沙箱环境中将乱码空目录写到项目根目录。相关系统问题见 [Codex issue #41889](https://github.com/openai/codex/issues/41889)。本地截图、探测脚本和测试浏览器缓存位于 `ui-demos/previews/`，不提交到 Git。

## 推荐验证方式

先真实使用一周，只观察三个问题：

- 是否比普通空白笔记更容易开始记录？
- 项目模板是否帮助你提前区分“复用什么”和“自己做什么”？
- 复盘是否真的产生了下一次能使用的知识？

下一版应由上述问题的实际答案决定，而不是单纯增加功能。
