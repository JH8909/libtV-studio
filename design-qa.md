# Design QA — 视频下载入口

- Source visual truth: `C:\Users\JH4AEF~1.DES\AppData\Local\Temp\codex-clipboard-df1dd042-2b45-4458-9896-9cc0a0392c8b.png`
- Implementation screenshot: `E:\codex\libtv-studio-complete-v1.3\libtv-studio-complete-v1.3\design-qa-video-download.png`
- Combined comparison: `E:\codex\libtv-studio-complete-v1.3\libtv-studio-complete-v1.3\design-qa-video-download-comparison.png`
- Source pixels: 813 × 842
- Implementation viewport and pixels: 1280 × 720 CSS px, 1280 × 720 image pixels, device scale factor 1
- State: `Audit - 新用户旅程 2026-08-09`, 已生成视频节点展开

## Full-view comparison evidence

- 参考图中的下载按钮覆盖播放器右下方原生控制区；实现将下载入口移动到视频节点标题栏。
- 视频预览、输入区、连接线、画布工具栏及现有深色节点层级均保持不变。
- 图片与视频生成节点共用标题栏下载规则，避免同类节点出现两套操作位置。

## Focused comparison evidence

合并对比图下半部分对齐展示视频节点。实现中的下载按钮位于标题栏右侧，DOM 测量确认其矩形与视频矩形不相交；播放器的播放、音量、全屏和更多控制均无遮挡。

## Required fidelity surfaces

- Fonts and typography: 未修改标题、状态、提示词或参数文字。
- Spacing and layout rhythm: 下载按钮复用标题栏现有 28 × 28px 图标按钮尺寸与 2px 操作间距，不增加节点高度。
- Colors and visual tokens: 沿用现有标题栏按钮颜色、悬停态与键盘焦点描边。
- Image quality and asset fidelity: 视频和预览素材保持原始资源、比例与清晰度。
- Copy and content: 按钮保留“下载视频 / 下载图片”的 title 与 aria-label，图标语义不变。

## Interaction and runtime checks

- 标题栏下载按钮实际点击成功，继续调用原有 `downloadNodeOutput` 下载逻辑。
- 视频节点存在 1 个标题栏下载按钮，旧预览覆盖层数量为 0。
- 下载按钮与视频预览相交检测为 false。
- Browser console errors: none.
- Targeted interaction regression, JavaScript syntax and diff checks: passed.

## Comparison history

1. Initial P1: 下载按钮覆盖视频原生控制栏，影响播放器控制可用性。
2. Fix: 移除媒体预览覆盖层，将图片、视频下载入口统一放入生成节点标题栏。
3. Post-fix evidence: 标题栏下载按钮可见并可点击；按钮与视频预览不相交；播放器控制区完整显示。

## Findings

没有剩余 P0、P1 或 P2 问题。

final result: passed

## Latest iteration — 框选节点删除快捷键

- Delete / Backspace 现在只在真正的文本输入控件中让出默认行为。
- 框选或选中节点后，即使焦点仍停留在标题栏按钮上，Delete 也会删除所选节点；输入框内仍保留正常编辑行为。
- Browser verification: 选中节点并保持按钮焦点后按 Delete，节点数量成功减少 1；随后通过画布撤销恢复测试状态。
- Browser console errors: none.
- JavaScript syntax, targeted interaction regression and diff checks: passed.

final result: passed

## Latest iteration — 展开输入区的动态间距

- Implementation screenshot: `E:\\codex\\libtv-studio-complete-v1.3\\libtv-studio-complete-v1.3\\design-qa-expanded-spacing.png`
- 分镜布局现在按每一行图片/视频节点的实际高度计算，包含展开的输入区高度和 56px 安全间距。
- 打开或关闭任意分镜输入区时，后续镜头自动下移或回收，避免上下节点重叠。
- Browser verification: 第二镜展开后第三镜从 `1460px` 下移至 `1690px`，收起后恢复到 `1460px`。
- Browser console errors: none.
- JavaScript syntax, targeted interaction regression and diff checks: passed.

final result: passed

## Latest iteration — 竖向分镜与统一输入框

- Implementation screenshot: `E:\\codex\\libtv-studio-complete-v1.3\\libtv-studio-complete-v1.3\\design-qa-vertical-storyboard.png`
- 分镜节点按镜号纵向排列，每一行固定为“图片 → 视频”，已有分镜项目打开时会自动迁移到该布局。
- 文本、图片、视频生成节点的提示词输入框统一为 112px 高、圆角边框、内部滚动、禁止拖拽改变尺寸。
- Browser computed style confirmed `height: 112px`, `overflow: auto`, `resize: none`, `border-radius: 8px` across generation prompt inputs.
- Browser console errors: none.
- JavaScript syntax, targeted interaction regression and diff checks: passed.

final result: passed

## Latest iteration — 剧情连续性分析

- Implementation screenshot: `E:\\codex\\libtv-studio-complete-v1.3\\libtv-studio-complete-v1.3\\design-qa-continuity-report.png`
- 脚本查看器新增“连续性”入口，展示角色、场景、道具的跨镜头出现次数与单镜头孤立元素。
- 自动检查重复镜号、缺少画面动作、缺少景别/运镜和无法解析的时长。
- 生成分镜时将当前镜头实体、贯穿元素和上一镜承接关系写入图片/视频节点提示词与元数据。
- Browser console errors: none.
- JavaScript syntax, targeted interaction regression and diff checks: passed.

final result: passed

## Latest iteration — 脚本到分镜工作流

- Implementation screenshot: `E:\\codex\\libtv-studio-complete-v1.3\\libtv-studio-complete-v1.3\\design-qa-storyboard-workflow.png`
- Browser state: 打开“九宫格成片”结构化脚本，点击“生成分镜”
- 9 行脚本生成 9 组图片 → 视频节点，节点之间保留首帧连接，标题栏用“镜 1…镜 9”标识来源镜头。
- 生成后脚本查看器关闭，画布自动定位到新分镜；再次打开脚本时入口切换为“查看分镜”，避免重复创建。
- Browser console errors: none.
- JavaScript syntax, targeted interaction regression and diff checks: passed.

final result: passed
