# LibTV Studio — 统一设计规范

> **版本**：2026-08-19（Standalone `standalone/public`）  
> **适用范围**：Standalone 运行时 UI（画布、侧栏、Agent、Skill 广场、模态层）  
> **实现来源**：`standalone/public/styles.css`、`standalone/public/app.js`、`standalone/public/index.html`  
> **自动化校验**：`pnpm test:design-system` → `standalone/design-system-e2e.mjs`

画布指针交互见下文 **§18 画布交互契约**。测试与回归见 [TESTING.md](./TESTING.md)。

---

## 1. 设计原则

1. **一套几何语言**：所有表面、控件、浮层共用四级圆角与 `--ds-*` 表面令牌，禁止在新组件中引入 ad-hoc 圆角或阴影。
2. **深色工作区优先**：画布与节点保持紧凑信息密度；侧栏、Skill、Agent 等「阅读型」面板使用更大字号（13–22px）。
3. **图标优先、文字辅助**：顶栏、抽屉头、详情导航等操作位使用 Tabler 图标 + `title`/`aria-label`；禁止用 Unicode 箭头（如 `←`）代替图标。
4. **浮层互斥**：同一时刻只允许一个 transient 菜单/下拉展开；打开 Agent、抽屉、时间线或模态前调用 `preparePrimarySurface()` 收拢冲突状态。
5. **语义分离**：Agent 对话只读；Skill 确认后才写入画布。UI 文案与交互必须体现这一边界。
6. **可访问性默认**：图标按钮必须有 `aria-label`；焦点环使用 `--ds-accent`；Tooltip 由 `initUnifiedTooltips()` 统一托管，禁止原生 `title` 气泡。

---

## 2. 设计令牌（Design Tokens）

### 2.1 圆角层级

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-control` | 6px | 菜单项、chip、小按钮、节点内控件 |
| `--radius-surface` | 8px | 卡片内层、输入框、素材缩略图 |
| `--radius-container` | 10px | 节点、抽屉（非贴边）、popover、工具条 |
| `--radius-pill` | 999px | 状态 badge、筛选 chip、药丸标签 |

### 2.2 表面与边框（Studio 主色）

| Token | 典型值 | 用途 |
|-------|--------|------|
| `--ds-surface` | `#1b1b1b` | 基底、预览舞台 |
| `--ds-surface-raised` | `#242424` | 卡片、popover、节点菜单 |
| `--ds-surface-active` | `#303030` | hover / active / 选中行 |
| `--ds-border` | `#3b3b3b` | 默认描边 |
| `--ds-border-strong` | `#454545` | 强调描边、浮层外框 |
| `--ds-accent` | `#8fcce9` | 焦点环、进度条、选中高亮 |

### 2.3 间距刻度（Spacing）

| Token | 值 | 典型用途 |
|-------|-----|----------|
| `--space-1` | 4px | 紧凑 gap、chip 内边距 |
| `--space-2` | 8px | 列表项间距、nav margin |
| `--space-3` | 12px | 卡片 padding、section gap |
| `--space-4` | 16px | 详情页 section 间距 |
| `--space-5` | 20px | 区块分隔 |
| `--space-6` | 24px | 抽屉底部 padding |

**新组件**应优先使用 spacing token，避免新增 magic number。

### 2.4 字体刻度（Typography）

| Token | 值 | 用途 |
|-------|-----|------|
| `--text-meta` | 11px | 筛选 chip、搜索框 |
| `--text-body-sm` | 12px | 规格/meta、角标 |
| `--text-body` | 13px | 列表摘要、Agent 输入 |
| `--text-body-lg` | 14px | 详情区块正文 |
| `--text-body-xl` | 15px | 详情 lead、主操作说明 |
| `--text-title-sm` | 16px | Skill 卡片标题 |
| `--text-title-md` | 18px | 欢迎卡片标题 |
| `--text-title-lg` | 22px | Skill 详情 / Agent 空状态标题 |
| `--line-body` | 1.6 | 正文行高 |
| `--line-title` | 1.35 | 标题行高 |

### 2.5 文字色（Ink）

| Token | 值 | 用途 | 对比度备注 |
|-------|-----|------|------------|
| `--ds-ink-strong` | `#f3fbfd` | 标题 | 主文字 |
| `--ds-ink-body` | `#b4c2c5` | 列表摘要 | 正文 |
| `--ds-ink-muted` | `#8fa3a9` | 卡片底部 specs | 较 `#7f9399` 提升可读性 |
| `--ds-ink-subtle` | `#93a8ae` | 详情 specs | meta |

### 2.6 Light CTA

| Token | 值 | 用途 |
|-------|-----|------|
| `--ds-cta-bg` | `#f1f3f3` | Skill「使用」默认底 |
| `--ds-cta-bg-hover` | `#fff` | hover 底 |
| `--ds-cta-ink` | `#1a2022` | CTA 文字/图标 |
| `--ds-cta-shadow` | `0 4px 14px rgba(0,0,0,.18)` | hover 阴影 |

所有 Light CTA 必须写 `:hover:not(:disabled)` 覆盖全局 `button:hover`。

### 2.7 浮层（Overlay）语言

所有 transient 表面共用：

```css
--ds-overlay-surface: var(--ds-surface-raised);
--ds-overlay-border: var(--ds-border-strong);
--ds-overlay-radius: var(--radius-container);
--ds-overlay-shadow: 0 18px 42px rgba(0,0,0,.45);
--ds-overlay-padding: 6px;
--ds-overlay-gap: 2px;
```

**适用组件**：`.app-select-popover`、节点/画布右键菜单、图片预设 popover、Agent 模型/来源菜单、节点 context toolbar、全屏预览控制条等。

**例外**：`.custom-video-controls` 为透明无边框，不套用 overlay 外框（视频沉浸播放）。

### 2.8 层级（z-index）

| Token / 区域 | 值 | 说明 |
|--------------|-----|------|
| `--z-drawer` | 70 | 浮动抽屉 |
| `--z-popover` | 120 | 下拉 popover |
| `--z-modal` | 200 | 模态 |
| Agent overlay | 5000 | 右侧 Agent 面板 |
| `.app-tooltip` | 6000 | 统一 Tooltip |

### 2.9 Agent 专用令牌

Agent 面板在 `.agent-panel` 内使用 `--agent-*` OKLCH 色板（page / surface / hover / ink / line / accent）。与 Studio `--ds-*` **并存**：Agent 内组件优先 `--agent-*`，不要混用 Studio 全局 button 样式。

### 2.10 侧栏宽度

```css
--studio-side-panel-width: min(440px, 100vw);
```

素材库、技能广场、属性、Agent 共用贴右全高 shell（`top: 0; bottom: 0; border-radius: 0`）。

### 2.11 响应式断点

| Token / 媒体查询 | 行为 |
|------------------|------|
| `--bp-compact: 900px` | 顶栏 chip 隐藏文字；侧栏 `--studio-side-panel-width: min(320px, 100vw)` |
| `--bp-narrow: 700px` | Agent 全宽贴边；隐藏宽度拖拽条；Prompt 模型菜单缩窄 |
| `@media (max-width: 1588px)` | 欢迎卡片 3 列自适应 |
| `@media (max-width: 540px)` | 欢迎卡片紧凑模式 |

侧栏与 Agent 默认宽度：`min(440px, 100vw)`。

---

## 3. Skill 文案 Schema

字段分工与校验见 [standalone/skills/README.md](./standalone/skills/README.md) 与 `skill.schema.json`。

| 字段 | UI 位置 | 函数 |
|------|---------|------|
| `cardSummary` | 列表卡片 | `skillCopyFields().cardBlurb` |
| `description` | 详情 lead | `skillCopyFields().detailLead` |
| `howToUse` | 详情「怎么用」 | `skillCopyFields().howToUse`（统一 normalize） |
| `rules` + `category` | 规格行 | `skillDetailSpecs()` |

校验：`pnpm test:skill-schema`

---

## 4. 字体与排版（分区速查）

### 3.1 基准

- **字体栈**：`Inter, ui-sans-serif, system-ui, …`（`:root`）
- **Agent 面板**：`system-ui, -apple-system, "Segoe UI", sans-serif`，字距 `-0.01em`

### 3.2 密度分区

| 区域 | 标题 | 正文 | 辅助/meta | 说明 |
|------|------|------|-----------|------|
| **画布节点** | 12px strong | 11–12px | 9–10px | 紧凑，不改为网页大号字 |
| **Skill 列表卡片** | 16px / 600 | 13px blurb | 12px specs（底部） | 网页可读密度 |
| **Skill 详情** | 22px / 600 | 15px lead，14–15px 区块 | 13px specs | 三层信息：标题 → 价值 → 怎么用 → 流程 → 产出 |
| **Agent** | 22px 空状态标题 | 14px 消息/输入 | 11–12px meta | Prompt Bar 固定 120px 高 |
| **顶栏 chip** | — | 11px | — | 小屏可隐藏文字仅留图标 |

### 3.3 Skill 广场信息层次（现行规范）

**列表卡片**（`skill-card`）仅保留：

1. 封面 + 类型角标（视频/…）
2. 标题
3. `cardSummary` 摘要（`skill.json`，最多 3 行）
4. 规格行在**底部**：`分类 · 时长 · 画幅 · 镜数`
5. 右上角「使用」

**禁止**在卡片上重复：tag 云、作者、版本号、长 `description`、操作说明。

**详情页**（`skill-detail-view`）：

1. `icon-btn` + `chevron-left` 返回（无文字箭头）
2. 封面 → 标题 + specs → 完整 description
3. **怎么用**（主区块）→ **执行流程**（≤4 步，长列表取首/中/尾）→ **你会得到**（一句摘要）

---

## 5. 图标

- **来源**：Tabler Icons outline，经 `/vendor/icons/{name}.svg` 提供
- **渲染**：`icon(name)` → `<i class="ui-icon" style="--icon:url(...)">`
- **尺寸约定**：

| 场景 | 图标尺寸 |
|------|----------|
| `.icon-btn` / `.tool-btn` | 18px |
| 节点 context toolbar | 16px |
| Agent Prompt Bar 控件 | 16px |
| Skill 使用按钮 | 14–15px |

- **仅图标按钮**：必须同时设置 `title` 与 `aria-label`（Tooltip 迁移后原生 `title` 会被移除）

---

## 6. 按钮

### 5.1 类型

| 类名 / 模式 | 尺寸 | 默认态 | Hover | 用途 |
|-------------|------|--------|-------|------|
| **全局 `button`** | 自适应 | `#161d28` + 边框 | `#1c2634` | 画布、时间线等通用操作 |
| **`.icon-btn`** | 30×30（抽屉头 32×32） | transparent | `#353535` 或 `--ds-surface-active` | 刷新、关闭、返回 |
| **`.tool-btn`** | 30×30 | transparent | `#353535` | 画布底栏工具 |
| **`.top-chip`** | 自适应 | 透明/弱底 | active：`#2a323a` | 顶栏入口，互斥 `aria-pressed` |
| **Light CTA** | 见下 | `#f1f3f3` 底 + `#1a2022` 字 | `#fff` + 轻阴影 | Skill「使用」 |
| **Agent `.agent-send-btn`** | 28×28 | `--agent-ink` 底 | `--agent-ink-2` | 发送 |

### 5.2 Light CTA（Skill 使用按钮）— 重要例外

`.skill-use-button` 与 `.skill-detail-use` **必须**覆盖全局 `button:hover`：

```css
.skill-use-button:hover:not(:disabled),
.skill-detail-use:hover:not(:disabled) {
  background: #fff;
  border-color: transparent;
  color: #1a2022;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0,0,0,.18);
}
```

新建任何「浅色主按钮」时，须同样用 `:hover:not(:disabled)` 显式声明，避免被全局深色 hover 覆盖。

### 5.3 焦点

- 图标与画布控件：`outline: 2px solid var(--ds-accent); outline-offset: 2px`
- 视频进度条：无 thumb、无 focus 矩形（`outline: none`）

---

## 7. 下拉与选择器

- **禁止**在 UI 中使用原生 `<select>`；统一 `appSelectMarkup()` → `<details class="app-select">`
- Summary 高度：30px（项目选择 36px，Provider 34px）
- Popover：`max-height: min(320px, …)`，Provider 内须能 escape 卡片裁剪
- **互斥组**：`INTERACTION_DETAILS_SELECTOR` 内的 details 同时只能 open 一个；`pointerdown` 外部点击关闭

---

## 8. Tooltip

由 `initUnifiedTooltips()` 实现：

1. 扫描 `[title]`、`button[aria-label]`、`summary[aria-label]`
2. 迁移到 `data-tooltip`，移除原生 `title`
3. 350ms 延迟显示；`pointerover` / `focusin` 触发
4. 样式：`.app-tooltip`，与 overlay 同色板，`z-index: 6000`

**规范**：所有仅图标控件必须有可读标签；不要依赖浏览器默认 title。

---

## 9. Studio 布局与面板

### 8.1 顶栏（Studio Chrome）

- 分组：`top-action-group` + `top-action-sep`（素材/技能 | 时间线/导出 | 模型/Agent）
- 互斥高亮：`syncStudioChrome()` 同步 `aria-pressed` 与 `.active`
- Agent 打开时显示 `top-chip-dot` 提示

### 8.2 右侧抽屉

- 贴边全高，宽度 `--studio-side-panel-width`
- 头部：`drawer-header` 48px，左标题 + 右 `icon-btn` 组
- 打开任一抽屉前 `preparePrimarySurface()`

### 8.3 主表面切换（`preparePrimarySurface`）

打开 Agent / 抽屉 / 模态 / 时间线时统一：

1. 关闭所有 control dropdowns
2. 隐藏右键菜单
3. 收起节点 composer 展开态
4. 关闭 asset / skill / inspector 抽屉
5. 收起时间线（若逻辑要求）

---

## 10. Creative Agent

### 9.1 布局

- `agent-overlay`：`top: 44px`（顶栏下），可拖拽改宽，持久化 `libtv.agentWidth`
- Prompt Bar：固定 **120px** 高 grid；模型为 **71px 图标按钮**，无 chevron
- 空状态：明确文案「对话只给建议；使用技能才会改画布」

### 9.2 行为边界

| 能力 | 允许 | 禁止 |
|------|------|------|
| 对话 | 创意建议、卡片 | 直接改画布 |
| Skill | 选 Skill → 确认 → 写节点 | 未确认静默写入 |
| 附件 | Prompt Bar 上传 | — |
| 卡片 | 复制、收藏、定位素材/节点 | 执行生成 |

### 9.3 会话

- 历史：rename / delete / 收藏筛选
- SSE error 须有用户可见反馈
- 模型选择持久化 `libtv.agentModel`

---

## 11. 生成节点与媒体

### 10.1 预览壳

- 连接壳圆角 14px / 13px 内媒（`generator-preview`）— **勿改**（design-system e2e 锁定）
- 上传节点：虚线框 + 蓝色 hover（`#8fcce9`）

### 10.2 生成中 Loading

- 图片/视频：预览区 **pixel-grid loader**（Drive 变体）
- 生成中隐藏节点 header 的 badge 与 progress 条
- 进度条：provider 确定性 / phase 不确定性；`updateNodeProgressDom` 增量更新，禁止每 tick `renderNode`

### 10.3 自定义视频播放器

- 节点、lightbox、全屏共用一套 control
- 控制条：**默认隐藏**；hover 显示；中心播放后 `controls-suppressed` 直至 pointer leave
- 控制条无背景框、无边框；白色细进度条，无 thumb
- 空状态：占位图标 +「文生视频 / 首帧视频」，非仅居中播放钮

### 10.4 节点操作

- 下载/放大/时间线：标题栏或 context toolbar，**不遮挡**播放器原生控制区
- 预览展开：keyboard 可访问，`Enter`/`Space` + focus 恢复

---

## 12. 动效

| 场景 | 时长 | 缓动 |
|------|------|------|
| 抽屉/Agent 宽度过渡 | 180ms | ease |
| Tooltip | 120ms | ease |
| Skill CTA hover | 120ms | ease |
| Agent 卡片/消息入场 | 280ms | cubic-bezier(.23,1,.32,1) |

**Reduced motion**：`prefers-reduced-motion: reduce` 下进度条改为静态条，动画时长压至 0.01ms。

---

## 13. 无障碍 checklist

- [ ] 图标按钮：`aria-label` + `data-tooltip`
- [ ] 顶栏/抽屉互斥态：`aria-pressed`
- [ ] 下拉 summary：`aria-expanded`
- [ ] Skill 卡片：`role="button"` + `aria-label`
- [ ] 模态：打开时 focus trap，关闭恢复 focus（`prepareModalOpen` / `closeModalElement`）
- [ ] 生成预览 toggle：`tabindex="0"` + `aria-expanded`

---

## 14. 自动化 enforcement

运行：

```bash
pnpm test:design-system
pnpm test:skill-schema
```

`design-system-e2e.mjs` 当前覆盖（节选）：

- 四级 radius token 存在
- 无原生 `<select>`
- Skill 详情/列表排版与 Light CTA hover
- Pixel-grid loader、视频 control 行为
- Agent shell、Prompt Bar 尺寸、空状态文案
- Overlay 统一外框、统一 Tooltip
- `preparePrimarySurface`、菜单互斥

**新增 UI 时**：若引入新 pattern，应同步追加 e2e 断言，防止回归。

---

## 15. 相关文档

| 文档 | 内容 |
|------|------|
| [TESTING.md](./TESTING.md) | 回归命令与测试说明 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构 invariant、上游集成 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本变更记录 |
| [standalone/skills/README.md](./standalone/skills/README.md) | Skill 文案字段分工 |
| [standalone/skills/skill.schema.json](./standalone/skills/skill.schema.json) | Skill JSON Schema |

---

## 16. 画布交互契约

保持节点操作可预测，避免 drag/pan/connect 争抢同一 pointer 序列。Provider 密钥仅存服务端，节点只持久化 `capability + providerId + modelId + params + references`。

### 空白画布

- **双击**：在点击坐标打开 Add Node  catalog
- **右键**：Add Node / Fit / 鼠标模式 / 素材 / 时间线
- **滚轮**：以光标为中心缩放
- **Hand 模式或 Space+拖拽**：平移
- **Select 模式 + 点击空白**：清除节点/连线选中

### 节点

- **拖标题栏**（Select）：pointer capture 移动，pointer-up 提交
- **右键节点**：运行/重跑、复制、断开、属性、删除
- **输出端口 → 输入端口**：连线 + 实时预览
- 禁止自环、重复边、成环
- 文本 → AI Text / Image / Video；图片 → Image Edit / Video 参考；音视频 Asset → Video 参考

### 鼠标模式与快捷键

| 键 | 模式 |
|----|------|
| V | Select：选中/移动节点与片段 |
| H | Hand：平移画布 |
| C | Connect：优先连线手柄 |
| Space（按住） | 临时 Hand |
| F | 适配全部节点 |
| Delete / Backspace | 删除选中（输入框内除外） |

### 节点类型

- **Manual Text** — 手写创意/提示词
- **AI Text** — 分镜、视频脚本、图片提示词、改写
- **Image** — 文生图或图生图（视参考连接）
- **Video** — 文生视频 / 首帧 / 首尾帧 / 参考生成
- **Asset** — 上传或生成的媒体

---

## 17. Backlog（剩余项）

以下项已在 v1.1 落地或部分落地：

| 项 | 状态 | 说明 |
|----|------|------|
| 间距刻度 `--space-*` | ✅ 已落地 | Skill 广场已引用；画布节点逐步迁移 |
| Typography token | ✅ 已落地 | Skill 详情/列表已用 `var(--text-*)` |
| Light CTA token | ✅ 已落地 | `--ds-cta-*`，e2e 校验 hover |
| 响应式断点表 | ✅ 已文档化 | `--bp-compact` / `--bp-narrow` |
| Skill 文案 schema | ✅ 已落地 | `skill.schema.json` + README + `test:skill-schema` |
| 对比度 | ⚠️ 部分 | `--ds-ink-muted` 已提亮；Agent `--agent-ink-3` 待抽检 |
| Playwright 视觉快照 | ⬜ 待做 | 可基于 `agent-playwright-e2e` 扩展 Skill 详情截图 |
| i18n | ⬜ 待做 | 文案仍硬编码中文 |
| Agent 排版 token 化 | ⬜ 待做 | Agent 仍用局部 px，可映射到 `--text-*` |

---

## 18. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-08-19 | 初版：Design System v1 tokens、Skill 广场、Light CTA、Agent/视频/Loader |
| 2026-08-19 | v1.1：`--space-*` / `--text-*` / `--ds-cta-*` / `--ds-ink-*`；Skill schema + `skillCopyFields`；断点文档 |
| 2026-08-19 | 文档整理：画布交互并入本文 §16；测试合并为 TESTING.md；上游说明并入 ARCHITECTURE.md |
