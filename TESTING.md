# 测试与回归

Standalone 运行时以 `standalone/*-e2e.mjs` 脚本做自动化验收。历史版本测试结论见 [CHANGELOG.md](./CHANGELOG.md)。

## 常用命令

从仓库根目录：

```bash
pnpm test:design-system      # UI token / 组件约定
pnpm test:skill-schema       # Skill 文案字段
pnpm test:playwright           # Agent + Skill 广场 Playwright E2E
pnpm test:agent-playwright     # 同上
pnpm test:creative-agent     # Agent API 契约
pnpm test:canvas             # 画布交互
pnpm test:keyboard           # 快捷键
pnpm test:providers          # Provider 契约（本地 fake endpoint）
pnpm test:media-provider
pnpm test:agnes
pnpm test:generation-reliability
pnpm test:image-presets
```

或直接：

```bash
node standalone/design-system-e2e.mjs
node standalone/skill-schema-e2e.mjs
node standalone/agent-playwright-e2e.mjs
```

## 设计规范校验

UI/UX 约定以 [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) 为准；`test:design-system` 对 CSS/JS 做静态断言，不替代人工视觉走查。

## Provider 测试说明

`test:providers` 等脚本使用本地 fake vendor，**不会产生付费 API 调用**。真实密钥仅用于手动联调。
