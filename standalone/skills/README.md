# Skill 数据规范

每个 Skill 位于 `skills/<slug>/skill.json`。UI 从 `/api/skills` 读取公开字段（不含 `promptTemplates`）。

Schema：`skill.schema.json`（JSON Schema Draft 2020-12）。

## 文案字段分工（必读）

| 字段 | 展示位置 | 写法 | 禁止 |
|------|----------|------|------|
| **`cardSummary`** | 列表卡片正文 | 一句卖点，≤72 字 | 操作步骤、版本号、规格数字、tag 重复 |
| **`description`** | 详情页首段 | 完整价值说明，可含流程关键词 | 替代 `howToUse` 写操作指引 |
| **`howToUse`** | 详情页「怎么用」 | 「上传…并输入…；发送后执行…」 | 在 UI 层做字符串替换（已在 `skillCopyFields` 统一处理） |
| **`usage`** | 不展示 | 搜索用场景词 | 当作卡片摘要 |
| **`tags`** | 不展示 | 搜索/分类 | 在卡片上渲染 tag 云 |

### 示例（新中式美学 TVC）

```json
{
  "cardSummary": "新中式美学全案：从妆造、布景到广告成片，一站式惊艳视觉",
  "description": "从产品图片和卖点描述出发，按固定的品牌锚点、五镜头分镜、关键帧、首帧视频和声音方案，生成一支 15 秒新中式品牌 TVC。",
  "howToUse": "先在 Agent 中选择该 Skill，再上传产品图并输入产品卖点；发送后执行固定的画布工作流。"
}
```

规格行（分类 · 时长 · 画幅 · 镜数）由 `rules` + `category` 自动生成，**不要**写进 `cardSummary`。

## 新增 Skill 检查清单

- [ ] `id` 与目录名一致
- [ ] 填写 `cardSummary`、`description`、`howToUse`
- [ ] `cover` 指向可访问静态资源
- [ ] `inputs` 含必填项校验
- [ ] 运行 `pnpm test:design-system` 与 `node standalone/skill-schema-e2e.mjs`
