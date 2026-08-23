# QUill 全量 UI / UX 回归审查

审查日期：2026-08-20  
审查视口：本地 In-App Browser，窄屏约 520×840；同时覆盖桌面式右侧抽屉、弹窗和画布状态。

## 覆盖范围

- 启动、项目切换、空画布与当前画布
- 无限画布节点、素材库、时间线、导出
- Agent 空状态、对话、模型选择、文件上传、Skill 选择与 SkillRun
- Skill 广场、详情页、导入 Skill、图片类型 Skill
- 模型/API 配置与错误/空状态
- 键盘焦点、Escape、Enter/Space、弹窗背景隔离、辅助技术语义

## 首轮发现与修复

| 优先级 | 问题 | 修复结果 |
|---|---|---|
| P0 | 初始接口任一失败会让工作区半加载，且没有恢复路径 | 初始 GET 使用有限重试；新增“工作区暂时无法加载 / 重新加载”恢复条，并把失败信息放入可读状态区。 |
| P0 | 隐藏素材、技能、属性抽屉和收起后的时间线仍可能进入可访问交互树 | 初始 HTML 与运行时同时维护 `aria-hidden`、`inert` 和隐藏视觉状态；Skill 详情打开时背景技能抽屉也会隔离。 |
| P1 | Skill 卡片外层是 button 语义，内部又有“使用”按钮 | 外层改为可聚焦的 `group`，保留 Enter/Space 打开详情，内部“使用”独立工作；卡片增加“内置 / LiblibTV 导入”来源标签。 |
| P1 | 素材卡片、Agent 上传预览卡片同样存在外层按钮与内部下载/删除/移除按钮冲突 | 统一改为可聚焦卡片组，保留点击预览、Enter/Space 预览、拖拽和内部操作按钮。 |
| P1 | Agent 没有模型时是空白控件，用户无法知道下一步 | 显示“配置创意模型”，空菜单提供“去模型/API配置”入口。 |
| P1 | 模型名称被隐藏；模型下拉会遮住输入/上传区域 | 恢复模型名称并做省略显示；控件保持无外边框；菜单在无附件/有附件时分别预留上方空间，窄屏再向右侧安全区展开，避免覆盖输入区、确认条和参考图。 |
| P1 | 导入 Skill 使用浏览器原生 prompt，错误反馈不可控 | 改为应用内弹窗表单、内联错误、导入中禁用状态和重试；已用图片类型 UUID `86556cc18ca0486a8490fd363a029dbc` 实际回归成功并打开图片 Skill 详情。 |
| P2 | Skill 详情打开时背景抽屉仍有层级竞争 | 详情弹窗打开后背景抽屉添加 `modal-inert` 并隐藏，关闭后恢复焦点和可访问状态。 |

## 回归证据

首轮状态截图位于本目录：`01-baseline.png` 至 `17-import-skill-modal.png`。本轮另用 In-App Browser 实际走查并确认：

- 模型/API 弹窗能展示已配置模型、未配置 Provider 和保存入口。
- 时间线打开后显示剪切/复制/叠化等操作；收起后 `aria-hidden=true` 且 `inert` 生效。
- 素材卡片改为 `group` 后，Enter 能打开媒体预览；下载、删除、提示词按钮保持独立。
- Skill 详情弹窗打开后背景技能抽屉为 `aria-hidden=true`、`inert`、`visibility:hidden`。
- 图片类型 Liblib Skill 导入成功，导入后自动进入详情页。
- Agent 文件上传、预览、移除、Skill 选择、确认模式和 TVC SkillRun 全流程通过。

## 自动化结果

- `pnpm typecheck`：通过
- `pnpm test:design-system`：通过（包含本轮新增的启动恢复、隐藏层、卡片语义、模型布局、Skill 导入断言）
- `pnpm test:canvas`：通过
- `pnpm test:agent-playwright`：通过，51/51
- `pnpm test:keyboard`：通过
- `pnpm test:providers`：通过
- `pnpm test:media-provider`：通过
- `pnpm test:creative-agent`：通过
- `pnpm test:skill-run`：通过
- `pnpm test:image-presets`：通过
- `pnpm test:skill-schema`：通过
- `pnpm test:generation-reliability`：通过
- `pnpm test:agnes`：通过
- `node --check standalone/public/app.js` 与 `python3 scripts/validate-source.py`：通过

## 本轮自动排布与 Agent 复审

本轮使用本地 In-App Browser 当前画布，视口约 915×993；截图与 DOM 证据保存在本目录的 `18-auto-layout-menu.png`、`23-agent-preview-blocked.png`、`24-agent-preview-fixed.png`、`25-auto-layout-fixed.png` 等文件中。

1. 画布自动排布：先从空白画布右键打开“自动排布”，确认入口可达；执行后确认状态提示、撤销按钮和画布结果。原问题是只按节点类型分列、忽略 `asset` 节点、层内排序依赖旧坐标，且末端节点可能被画布底部裁切。现改为按非引用连线拓扑分层，引用素材置于流程左侧，使用稳定键排序，测量节点尺寸后再次适配画布，并建立画布历史快照。实测 7 个节点无重叠、无越界，撤销按钮可用。
2. Agent 模型选择：确认模型名称仍可见、触发器保持无边框；打开下拉后检查 `listbox` 语义、`aria-controls` 关联和带上传预览时的安全间距。实测菜单可见且没有遮住输入框或参考图。
3. Agent 文件上传与媒体预览：上传参考图后只显示缩略图并位于输入框上方；点击缩略图打开媒体预览。原问题是媒体预览层级低于 Agent，关闭按钮被右侧面板盖住。现将预览提升到 Agent 之上，补齐 `aria-hidden` 状态，Escape 优先关闭媒体预览并把焦点还给缩略图。实测关闭后 Agent 保持打开，预览正确隐藏。
4. Agent Skill、确认模式、历史菜单：分别打开并检查菜单可见性、选项语义、滚动容器和当前选中态，未发现新的阻断主流程问题；重复 Skill 名称仍通过来源与版本区分。

本轮结果：自动排布与 Agent 主输入链路通过；设计系统回归、画布回归和类型检查通过。证据中的 `23-agent-preview-blocked.png` 保留了修复前的真实遮挡状态，`24-agent-preview-fixed.png` 与 `25-auto-layout-fixed.png` 为修复后的对照。

## 仍需真实环境验证的风险

- 本轮 Provider 合同测试使用本地 fake Provider；真实 API 的额度、网络波动和最终视频编码仍需在配置真实密钥后验证。
- 删除素材、删除会话、重命名会话仍使用系统原生确认/输入框；不影响主创作链路，但后续可统一为应用内弹窗以保持视觉规范一致。
