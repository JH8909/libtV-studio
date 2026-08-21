# LibTV Studio 全量产品缺口审计与落地记录

> 审计日期：2026-08-20  
> 审计范围：Standalone 本地产品、当前 Agent/Skill/Canvas/Timeline 交互，以及 `Project → Workflow → GenerationJob → Asset → TimelineItem` 主链路。  
> 目标：把“有入口”与“真的能完成”区分开，优先修复会阻断 TVC 生产闭环的缺口。

## 1. 产品结论

项目的核心能力不是缺少更多生成按钮，而是需要保证这条链路完整可追踪：

```text
Skill 选择 → Agent 输入 → SkillRun → Canvas 节点 → GenerationJob → Asset → Timeline → 预览 / 下载
```

本轮已把核心链路从“能创建节点”补到“能恢复、能暂停、能重试、能取消、能查看本次产物并下载”。普通 Agent 对话仍保持只读，只有选择并确认 Skill 才会写入画布。

## 2. 六层能力对照

| 产品层 | 审计结论 | 当前状态 |
|---|---|---|
| 项目层 | 项目创建、切换、删除、保存和工作流版本冲突合并已有实现 | 已完成 |
| 画布层 | 节点、连线、依赖执行、参考素材、上传、预览、Timeline 和 MP4 导出已有闭环 | 已完成 |
| Agent 层 | 对话只读；模型、附件、Skill chip、手动/自动确认、历史、收藏和重命名已有实现 | 已完成 |
| Skill 层 | 技能卡片、二级详情、导入 Liblib 图片/视频/音频/文本类型、导入后注入 Agent 已有实现 | 已完成 |
| 执行层 | Job 状态、进度、重试、取消、SkillRun 步骤、刷新恢复和已有 Job 等待已补齐 | 已完成 |
| 资产层 | 生成结果本地持久化、素材库预览、全屏图片/视频预览、Timeline 引用、本次 SkillRun 筛选和下载已补齐 | 已完成 |

## 3. 本轮实际修复

### 3.1 SkillRun 运行闭环

- 项目重新打开时加载 SkillRun 历史，并恢复尚未进入人工确认点的自动任务。
- 运行过程中如果节点已经有 Job，不再重复提交；会等待并接管现有 Job 的最终状态。
- SkillRun 使用创建时保存的确认模式，不会因为用户后来切换 Agent 偏好而改变运行规则。
- Agent 中显示每次运行的步骤状态、历史入口、失败镜头重试、停止运行和画布定位。
- 增加服务端取消接口，取消 Job、节点和 SkillRun，并在刷新后保持“已取消”。

涉及文件：

- `standalone/public/app.js`
- `standalone/server.mjs`
- `standalone/skill-run.mjs`

### 3.2 Skill 规格可理解、可复用

技能详情不再只显示摘要，已展示完整的：

- 使用方式
- 固定步骤
- 输入字段、必填状态、类型和默认值
- 输出结果
- 规则、限制和连续性约束

这使 Skill 广场承担“发现和管理”，Agent 承担“选择和执行”，不会把复杂执行界面塞回技能广场。

涉及文件：

- `standalone/public/app.js`
- `standalone/public/styles.css`

### 3.3 结果沉淀闭环

- Agent 的某次 SkillRun 可以直接打开素材抽屉并按 `assetIds` 过滤本次结果。
- 素材卡片支持真实图片/视频预览、全屏预览和直接下载。
- 生成节点原有的预览、下载和加入 Timeline 能力保持不变。

涉及文件：

- `standalone/public/index.html`
- `standalone/public/app.js`
- `standalone/public/styles.css`

### 3.4 文档与回归

- `README.md` 已明确区分普通只读对话和确认后的 Skill 画布写入。
- 新增 `PROJECT_GAP_AUDIT.md` 记录本次全量审计、完成项和边界。
- 为 SkillRun 恢复/取消/结果筛选/素材下载补充静态和 API 回归断言。

## 4. 仍然没有伪装成“已完成”的能力

### P1：音频 Provider 适配器

当前 TVC Skill 会生成旁白、音乐和音效方案节点，并支持上传音频进入 Timeline 混音；但当前 Provider Registry 没有独立的 `audio.tts` / `audio.music` 真实生成适配器。因此这两个节点的状态是“方案可执行”，不是“已经生成音频资产”。

要真正完成，需要明确接入一个音频服务商的：模型发现、提交、轮询、下载、失败重试、时长约束和音轨入库协议。没有服务商协议和密钥时，继续写假音频生成会破坏产品可信度。

### P2：分享、克隆、团队与运行分析

当前项目是本地优先版本，尚未实现完整的：

- 项目/SkillRun 分享链接和权限
- 项目克隆与跨项目资产复制
- Skill 发布、版本回滚和团队权限
- 成本、耗时、成功率和下载率分析

这些不阻断单人 TVC 生成主链路，建议在音频真实生成和多用户存储边界明确后再做。

### 外部运行条件

- 图片/视频真实生成需要配置 Agnes、APIMart 或百炼等 Provider。
- Agnes 使用本地上传图片作为视频参考时，需要配置可访问的 `PUBLIC_BASE_URL`。
- Timeline MP4 导出和视频关键帧提取需要 FFmpeg。

## 5. 验证结果

本轮直接运行 Node 回归，不依赖 pnpm 的自动安装行为：

- Agent 浏览器流：51/51 通过
- SkillRun：通过
- Creative Agent：通过
- 生成可靠性：通过
- Canvas 交互：通过
- Design System：通过
- Skill Schema：通过
- Provider / Media Provider：通过
- Provider Settings 浏览器流：39/39 通过
- Keyboard、Agnes、Image Presets：通过

pnpm 脚本在当前非交互终端会因为 pnpm 尝试自动处理依赖目录而中止；这属于执行环境问题，不是本轮功能失败。等依赖安装策略固定后，可再恢复统一的 `pnpm test:*` 入口。

## 6. 下一步优先级

如果继续投入开发，顺序应是：

1. 选定并接入一个真实音频 Provider，完成旁白/音乐资产入库和 Timeline 自动混音。
2. 增加 SkillRun 产物的镜头级审核与批量重跑策略。
3. 再做项目分享/克隆、Skill 版本管理和团队协作。
