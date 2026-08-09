# LibTV Probe

CDP-first 的可观察行为采集与离线分析工具。它用于建立产品能力证据，不用于复制 LibTV 的接口设计，也不获取服务器端代码、凭据、密钥或越权数据。

## 工作流

`CAPTURE → PARSE → DIFF → INFER → VERIFY → BENCHMARK`

每个 Action 会保存：

```text
actions/<ACTION_ID>/
  action.json
  before/page.json
  before/screenshot.png
  after/page.json
  after/screenshot.png
  diff/dom.json
  diff/storage.json
  network/requests.json
  network/events-meta.json
```

`page.json` 默认通过只读页面求值保存结构化语义 DOM；大型画布的完整 `DOMSnapshot.captureSnapshot` 可能明显拖慢 Action，因此只在定向验证时通过 `includeRawDom: true` 开启，并对常见敏感词脱敏。网络文件只保留 URL、方法、状态及推导后的 request/response schema，不保存请求头或原始请求/响应正文。CDP 通道超时时，Action 仍会保存 DOM、截图和明确的网络缺失原因，不伪造网络 evidence。

浏览器插件禁止读取 cookies、localStorage、sessionStorage、浏览器档案和密码，因此 `diff/storage.json` 会明确记录 `captured: false`。刷新后持久化行为应通过页面重新进入和 DOM/网络结果验证，而不是读取浏览器存储。

## 浏览器内采集一个 Action

在已连接、已登录且获得正常授权的内置浏览器会话中导入：

```js
const probe = await import('E:/codex/libtv-studio-complete-v1.3/libtv-studio-complete-v1.3/tools/libtv-probe/browser-capture.mjs');
const cdp = await tab.capabilities.get('cdp');
const action = await probe.startAction({
  tab,
  cdp,
  outputDir: 'E:/codex/libtv-studio-complete-v1.3/libtv-studio-complete-v1.3/reverse-engineering/libtv/evidence/sessions/SESSION-002/actions',
  actionId: 'A001',
  name: 'Create image node',
  category: 'image-node',
  priority: 'P0',
  trigger: 'Canvas add-node control → Image',
  inputs: {},
});
```

执行一个正常用户交互后结束采集：

```js
await probe.finishAction(action, {
  outputs: { node: 'image node' },
  persistence: 'not yet verified',
});
```

一次 Action 只覆盖一个可明确命名的用户意图。拖拽、快捷键、画布空间行为、悬停、上下文菜单和失败恢复仍需定向点击验证。

## 离线命令

```powershell
node tools/libtv-probe/cli.mjs analyze-har session.har api-map.yaml
node tools/libtv-probe/cli.mjs analyze-dom before.json before-semantic.json
node tools/libtv-probe/cli.mjs diff before.json after.json diff.json
node tools/libtv-probe/cli.mjs pipeline reverse-engineering/libtv/evidence/sessions/SESSION-002 .
node --test tools/libtv-probe/test/libtv-probe.test.mjs
```

`pipeline` 只基于采集到的 Action/HAR 生成：

- `reverse-engineering/libtv/spec/API_MAP.yaml`
- `reverse-engineering/libtv/spec/CAPABILITY_MAP.yaml`
- `reverse-engineering/libtv/benchmark/PARITY_BENCHMARK.yaml`

真实输出不得使用合成 fixture；测试 fixture 仅在临时目录中运行。
