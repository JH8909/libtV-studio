export let IMAGE_PRESET_CATEGORIES = [
  { id: 'storyboard', label: '分镜', icon: 'layout-grid' },
  { id: 'character', label: '角色', icon: 'user' },
  { id: 'product', label: '产品', icon: 'package' },
  { id: 'view', label: '视角', icon: 'view-360' },
  { id: 'lighting', label: '光影', icon: 'bulb' },
];

export let IMAGE_PRESETS = [
  {
    id: 'multi-camera-nine-grid', sourceId: 'builtin_md_1', category: 'storyboard',
    label: '多机位九宫格', icon: 'grid-3x3', aspectRatio: '1:1', quality: '1K',
    scene: '同一主体或场景的 9 个机位与角度参考图。',
    positive: 'A multi-camera angle reference sheet in 3x3 grid layout, showing [主体] from 9 different perspectives simultaneously: top-left front view, top-center 3/4 front view, top-right side profile, middle-left low angle, middle-center eye-level straight-on, middle-right high angle, bottom-left back view, bottom-center 3/4 back view, bottom-right top-down overhead view. [主体详细描述]. Consistent lighting across all 9 frames, uniform light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, professional studio photography, clean grid layout with thin white dividers between frames, character consistency maintained across all angles, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    negative: 'numbers, text, letters, labels, frame numbers, corner marks, annotations, captions, watermarks, signatures, logos, readable text, font, typography, grid numbers, sequence markers, page numbers, index, hard edge, glowing edge, white halo, light bleed, overexposed edge, cutout look, pasted on background, floating subject, disconnected shadow, pure white background, stark white, cold gray, bad anatomy, distorted face, extra fingers, deformed hands, inconsistent character design, lighting mismatch between frames, blurry, low quality, cropped, out of frame',
  },
  {
    id: 'multi-camera-nine-grid-4k', sourceId: 'builtin_md_2', category: 'storyboard',
    label: '多机位九宫格 4K', icon: 'badge-4k', aspectRatio: '1:1', quality: '4K',
    scene: '高分辨率 3×3 多机位参考图，适合精细材质与大屏输出。',
    positive: 'Ultra high resolution multi-camera angle reference sheet in 3x3 grid layout, 4K quality, showing [主体] from 9 different perspectives simultaneously: top-left front view, top-center 3/4 front view, top-right side profile, middle-left low angle, middle-center eye-level straight-on, middle-right high angle, bottom-left back view, bottom-center 3/4 back view, bottom-right top-down overhead view. [主体详细描述]. Consistent cinematic lighting across all 9 frames, uniform light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, professional studio photography with medium format film aesthetic, clean grid layout with thin white dividers between frames, character consistency maintained across all angles, fine organic film grain, zero digital sharpening, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    negative: 'numbers, text, letters, labels, frame numbers, corner marks, annotations, captions, watermarks, signatures, logos, readable text, font, typography, grid numbers, sequence markers, page numbers, index, hard edge, glowing edge, white halo, light bleed, overexposed edge, cutout look, pasted on background, floating subject, disconnected shadow, pure white background, stark white, cold gray, bad anatomy, distorted face, extra fingers, deformed hands, inconsistent character design, lighting mismatch between frames, blurry, low quality, cropped, out of frame, digital sharpening, oversharpened, plastic skin, over-smoothing',
  },
  {
    id: 'story-four-grid', sourceId: 'builtin_md_3', category: 'storyboard',
    label: '剧情推演四宫格', icon: 'layout-2', aspectRatio: '1:1', quality: '1K',
    scene: '用 2×2 四格表现同一事件的起因、发展、转折和结果。',
    positive: 'A 4-panel storyboard sequence in 2x2 grid, showing narrative progression of [事件/场景]: top-left [阶段1描述], top-right [阶段2描述], bottom-left [阶段3描述], bottom-right [阶段4描述]. Consistent character design across all panels, coherent lighting and color palette, uniform light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, cinematic composition, emotional arc from [情绪A] to [情绪B], film grain texture, clean thin white grid dividers, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    negative: 'numbers, text, letters, labels, frame numbers, corner marks, annotations, captions, watermarks, signatures, logos, readable text, font, typography, grid numbers, sequence markers, page numbers, index, hard edge, glowing edge, white halo, light bleed, overexposed edge, cutout look, pasted on background, floating subject, disconnected shadow, pure white background, stark white, cold gray, bad anatomy, distorted face, extra fingers, deformed hands, inconsistent character design, lighting mismatch between frames, discontinuous action, jump cut feel, blurry, low quality, cropped, out of frame',
  },
  {
    id: 'face-three-view', sourceId: 'builtin_md_4', category: 'character',
    label: '角色脸部三视图', icon: 'face-id', aspectRatio: '16:9', quality: '1K',
    scene: '角色脸部正面、四分之三侧面和侧面的一致性参考。',
    positive: 'Character face reference sheet, three views side by side in single row: left panel front view straight-on, center panel 3/4 angle view, right panel side profile view. [角色面部详细描述]. Consistent lighting from 45-degree top-side across all three views, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, neutral clean backdrop, professional character design sheet, clean linework, subtle skin texture, identical facial features maintained across all angles, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    negative: 'numbers, text, letters, labels, frame numbers, corner marks, annotations, captions, watermarks, signatures, logos, readable text, font, typography, grid numbers, sequence markers, page numbers, index, hard edge, glowing edge, white halo, light bleed, overexposed edge, cutout look, pasted on background, floating subject, disconnected shadow, pure white background, stark white, cold gray, bad anatomy, distorted face, asymmetrical eyes, crossed eyes, extra fingers, deformed hands, inconsistent facial features between panels, lighting mismatch, blurry, low quality, cropped, out of frame',
  },
  {
    id: 'product-three-view', sourceId: 'builtin_md_5', category: 'product',
    label: '产品三视图', icon: 'box', aspectRatio: '16:9', quality: '1K',
    scene: '产品正面、侧面和顶面的正投影视图。',
    positive: 'Product design reference sheet, three orthographic views in single row: front view, side view, top view. [产品详细描述]. Light warm gray background color F0EDE8, products softly blending with background with natural edge transition, no hard edges no white halo no light bleed, studio lighting with soft shadows, technical drawing aesthetic, precise proportions, material texture visible, no perspective distortion, professional product photography, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    negative: 'numbers, text, letters, labels, frame numbers, corner marks, annotations, captions, watermarks, signatures, logos, readable text, font, typography, grid numbers, sequence markers, page numbers, index, hard edge, glowing edge, white halo, light bleed, overexposed edge, cutout look, pasted on background, floating subject, disconnected shadow, pure white background, stark white, cold gray, distorted proportions, perspective distortion, blurry, low quality, cropped, out of frame, cluttered background, random objects, inconsistent material texture between views',
  },
  {
    id: 'storyboard-twenty-five-grid', sourceId: 'builtin_md_6', category: 'storyboard',
    label: '25 宫格连贯分镜', icon: 'grid-4x4', aspectRatio: '1:1', quality: '2K',
    scene: '用 5×5 网格生成 25 帧连续叙事分镜。',
    positive: 'A 5x5 cinematic storyboard grid, 25 sequential frames showing continuous narrative flow of [主体/场景/动作], naturally divided into 9 story beats progressing through beginning, development, escalation, twist, climax, and resolution. Scene transitions conveyed purely through visual continuity and character motion, absolutely no visible numbers, text, labels, frame counters, corner marks, or annotations anywhere on the image. Consistent character and environment across all 25 frames, smooth motion continuity between adjacent frames, uniform cinematic lighting and color palette, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, varied shot progression from wide to close-up, professional film storyboard aesthetic, subtle film grain, clean thin white grid dividers',
    negative: 'numbers, text, letters, labels, frame numbers, corner marks, annotations, captions, watermarks, signatures, logos, readable text, font, typography, grid numbers, sequence markers, page numbers, index, hard edge, glowing edge, white halo, light bleed, overexposed edge, cutout look, pasted on background, floating subject, disconnected shadow, pure white background, stark white, cold gray, bad anatomy, distorted face, extra fingers, deformed hands, inconsistent character design, lighting mismatch between frames, discontinuous action, jump cut feel, blurry, low quality, cropped, out of frame, different hairstyle between frames, different clothing between frames',
  },
  {
    id: 'cinematic-lighting-sheet', sourceId: 'builtin_md_7', category: 'lighting',
    label: '电影级光影方案', icon: 'bulb', aspectRatio: '3:2', quality: '1K',
    scene: '同一主体和构图下的 6 种电影光影对比方案。',
    positive: 'Cinematic lighting comparison sheet, 6 panels showing the same [主体/场景] under different lighting conditions: top-left golden hour warm backlight, top-center overcast soft diffused light, top-right neon night city light, bottom-left harsh midday direct sun, bottom-center Rembrandt 45-degree side light with triangle shadow, bottom-right dramatic low-key chiaroscuro. Consistent composition and subject across all panels, only lighting changes, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, professional cinematography reference, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    negative: 'numbers, text, letters, labels, frame numbers, corner marks, annotations, captions, watermarks, signatures, logos, readable text, font, typography, grid numbers, sequence markers, page numbers, index, hard edge, glowing edge, white halo, light bleed, overexposed edge, cutout look, pasted on background, floating subject, disconnected shadow, pure white background, stark white, cold gray, inconsistent subject between panels, different pose between panels, different costume between panels, cluttered background, blurry, low quality, cropped, out of frame',
  },
  {
    id: 'character-reference-sheet', sourceId: 'builtin_md_8', category: 'character',
    label: '角色设定参考表', icon: 'user-scan', aspectRatio: '16:9', quality: '2K',
    scene: '胸口特写加全身正面、侧面、背面三视图。',
    positive: 'Character reference sheet, left-right split layout: left one-third area is chest-up close-up front view portrait (shoulder-up framing, extreme facial detail clarity, gentle natural expression, bright eyes looking straight at camera, realistic skin texture with visible pores and subtle imperfections, refined classical makeup); right two-thirds area is three full-body views in horizontal row, from left to right: full-body front standing pose (arms hanging naturally, feet together, complete front costume and body proportions), full-body side profile view (weight slightly shifted, waist-hip curve and silhouette visible, complete side costume and footwear), full-body back view (complete back neckline, hairstyle from behind, back costume details). Consistent front-top-side lighting across all panels, soft diffused light quality, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, identical character design, costume, hairstyle and accessories across all panels, professional character design sheet style, clean edges, accurate proportions, material texture visible from all angles, absolutely no visible numbers, text, labels, frame counters, corner marks or annotations anywhere on the image',
    negative: 'numbers, text, letters, labels, frame numbers, corner marks, annotations, captions, watermarks, signatures, logos, readable text, font, typography, grid numbers, sequence markers, page numbers, index, hard edge, glowing edge, white halo, light bleed, overexposed edge, cutout look, pasted on background, floating subject, disconnected shadow, pure white background, stark white, cold gray, dividing line labels, panel markers, bad anatomy, distorted face, extra fingers, deformed hands, inconsistent character design, lighting mismatch between frames, different hairstyle between panels, different clothing between panels, blurry, low quality, cropped, out of frame, asymmetrical eyes, crossed eyes, plastic skin, over-smoothing, textureless skin, uniform skin tone, digital sharpening, filter look, CG look, retouched, airbrushed, multiple heads, mutated limbs, floating limbs, disconnected limbs, uneven panel sizes, broken layout',
  },
  {
    id: 'character-expression-sheet', sourceId: 'builtin_md_9', category: 'character',
    label: '角色六表情', icon: 'mood-smile', aspectRatio: '3:2', quality: '1K',
    scene: '同一角色的平静、微笑、大笑、悲伤、愤怒和惊讶六宫格。',
    positive: 'Character expression reference sheet in 2x3 grid layout, six basic expressions of the same character: top row from left to right: calm neutral expression (relaxed face, eyes looking straight ahead, lips naturally closed), gentle smile (corners of mouth slightly raised, eyes with smile lines, warm and approachable), joyful laugh (eyebrows and eyes curved upward, mouth open showing teeth, exuberant happiness); bottom row from left to right: sad tearful expression (slight furrow between brows, downturned outer eye corners, tears welling in eyes about to fall), angry stern expression (brows tightly locked, sharp piercing eyes with pressure, jaw slightly set), surprised astonished expression (eyes wide open, eyebrows raised high, mouth slightly open in O shape). All six expressions are chest-up close-up portraits of the same character, shoulder-up framing, extreme facial detail clarity, realistic skin texture preserved, no additional light source, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, identical character styling, hairstyle, makeup and accessories across all six panels, only facial expression changes, professional character expression sheet style, clean edges, absolutely no visible numbers, text, labels, frame counters, corner marks or annotations anywhere on the image',
    negative: 'numbers, text, letters, labels, frame numbers, corner marks, annotations, captions, watermarks, signatures, logos, readable text, font, typography, grid numbers, sequence markers, page numbers, index, expression name labels, emotion text, hard edge, glowing edge, white halo, light bleed, overexposed edge, cutout look, pasted on background, floating subject, disconnected shadow, pure white background, stark white, cold gray, bad anatomy, distorted face, extra fingers, deformed hands, inconsistent character design, different hairstyle between panels, different clothing between panels, lighting mismatch between panels, blurry, low quality, cropped, out of frame, asymmetrical eyes, crossed eyes, plastic skin, over-smoothing, textureless skin, uniform skin tone, digital sharpening, filter look, CG look, retouched, airbrushed, multiple heads, mutated limbs, floating limbs, disconnected limbs, uneven panel sizes, broken layout, extra rows, extra columns, missing panel, shadows on face, directional light, dramatic lighting, colored light',
  },
  {
    id: 'panorama-360', sourceId: 'builtin_md_10', category: 'view',
    label: '360° 全景图', icon: 'view-360', aspectRatio: '2:1', quality: '2K',
    scene: '可左右无缝循环拼接的空间全景图。',
    positive: '生成一个360度的全景VR图，左右边缘100%像素级无缝衔接，可无限循环拼接；上下极点（南北极）自然过渡，无明显断层或拉伸，保持[主体/场景]的一致性以及场景的逻辑性，封闭场景需要有合理的门或出口。',
    negative: 'seam, visible seam, hard seam, broken panorama, discontinuous edge, mismatched left and right edges, distorted poles, stretched ceiling, stretched floor, warped horizon, inconsistent scene logic, impossible space, no exit in closed room, text, letters, labels, watermark, logo, blurry, low quality',
  },
  {
    id: 'packaging-master', sourceId: 'builtin_md_11', category: 'product',
    label: '极简母版包装图', icon: 'package', aspectRatio: '3:4', quality: '1K',
    scene: '锁定一个稳定、可落地的正面商业包装母版。',
    positive: '生成一张稳定的商业包装母版图，只做一个方向，不做多方案发散。正面平视包装方案图，包装主体占画面中心，结构清晰，比例可信；明确预留品牌名区、产品名区、核心卖点区、规格容量区、成分/功效区、条码/合规信息区。适合[美妆/大健康食品]，整体高级、干净、可落地。参考图只用于控制气质、色彩和材质，不复制参考图品牌、Logo 或具体版式。不要三方向拼图，不要系列化，不要场景图，不要复杂背景；先把一个包装主体做准。',
    negative: 'readable text, random text, misspelled text, broken typography, fake logo, copied brand logo, three directions board, multiple concept board, series lineup, complex scene, background stronger than package, only mood image, no package body, distorted package structure, unrealistic packaging, overdecorated, cheap ecommerce style, blurry, low quality, watermark, signature',
  },
  {
    id: 'packaging-variants', sourceId: 'builtin_md_12', category: 'product',
    label: '极简一致性变体', icon: 'packages', aspectRatio: '16:9', quality: '1K',
    scene: '基于当前包装母版生成 3–4 个轻量 SKU 变体。',
    positive: '基于母版包装图和参考图，生成 3-4 个轻变体。目标是保持同一包装系统，而不是重新设计。必须保持：包装结构、主体比例、品牌位置、产品名位置、主版式骨架、信息层级。只允许变化：色彩比例、局部图形、材质表现、SKU/功效识别区、口味/成分的小标签区域。画面为 3-4 个包装并列展示，像同一品牌系列；每个 SKU 有清晰差异但骨架统一，适合电商缩略图和货架识别。',
    negative: 'new package structure, changed brand position, changed layout skeleton, inconsistent proportions, each sku different style, full redesign, too much text, broken labels, random text, weak shelf recognition, cluttered lineup, unrealistic shadows, distorted packaging, blurry, low quality, watermark',
  },
  {
    id: 'packaging-presentation', sourceId: 'builtin_md_13', category: 'product',
    label: '极简提案展示图', icon: 'presentation', aspectRatio: '16:9', quality: '1K',
    scene: '把当前包装做成棚拍、系列、材质和使用场景提案板。',
    positive: '基于最终母版或选定变体生成提案展示图。此步骤只负责把包装拍好看，不重新设计包装。包装主体必须清晰可见；生成横向提案板或 4 宫格，包含单品棚拍、系列陈列、材质特写、简单使用/货架/电商场景。背景只服务包装，不能抢主体。光影真实，材质高级，包装比例可信，适合客户汇报和作品集展示。',
    negative: 'redesign packaging, rewritten logo, rewritten text, changed package structure, changed layout, background overpowering packaging, package front not visible, cluttered scene, influencer style, unrealistic shadow, fake material, overexposed, low quality, blurry, watermark, signature',
  },
];

const LOCKED_ASPECT_PRESETS = new Set([
  'multi-camera-nine-grid', 'multi-camera-nine-grid-4k', 'story-four-grid',
  'face-three-view', 'product-three-view', 'storyboard-twenty-five-grid',
  'cinematic-lighting-sheet', 'character-reference-sheet', 'character-expression-sheet',
  'panorama-360', 'packaging-variants', 'packaging-presentation',
]);
const NARRATIVE_PRESETS = new Set(['story-four-grid', 'storyboard-twenty-five-grid']);

function presetSubjectPolicy(preset) {
  if (preset.id === 'packaging-master') return 'style-reference';
  if (['packaging-variants', 'packaging-presentation', 'product-three-view'].includes(preset.id)) return 'product-structure';
  if (preset.category === 'character') return 'character-identity';
  if (preset.category === 'lighting') return 'composition-lock';
  if (preset.category === 'view') return 'scene-continuity';
  return 'strict-reference';
}

export function normalizeImagePreset(preset) {
  if (!preset) return null;
  return {
    version: 1,
    enabled: true,
    aspectPolicy: LOCKED_ASPECT_PRESETS.has(preset.id) ? 'locked' : 'inherit',
    subjectPolicy: presetSubjectPolicy(preset),
    promptPlaceholder: NARRATIVE_PRESETS.has(preset.id)
      ? (preset.id === 'story-four-grid' ? '可选：补充起因、发展、转折和结果' : '可选：补充剧情目标、关键动作、转折和结尾')
      : '可选：补充需要调整的细节',
    validation: preset.validation || {
      expectedLayout: preset.id.includes('nine-grid') ? '3x3'
        : preset.id === 'story-four-grid' || preset.id === 'packaging-presentation' ? '2x2'
        : preset.id === 'storyboard-twenty-five-grid' ? '5x5'
        : preset.id === 'character-expression-sheet' || preset.id === 'cinematic-lighting-sheet' ? '2x3'
        : ['face-three-view', 'product-three-view'].includes(preset.id) ? '1x3'
        : preset.id === 'character-reference-sheet' ? 'reference-sheet'
        : preset.id === 'packaging-variants' ? 'series'
        : preset.id === 'panorama-360' ? 'equirectangular'
        : 'single',
    },
    ...preset,
  };
}

export function setImagePresetLibrary(library = {}) {
  const categories = Array.isArray(library.categories) ? library.categories : [];
  const presets = Array.isArray(library.presets) ? library.presets : [];
  if (categories.length) IMAGE_PRESET_CATEGORIES = categories;
  if (presets.length) IMAGE_PRESETS = presets.map(normalizeImagePreset).filter(preset => preset.enabled !== false);
}

export function imagePresetLibrarySnapshot() {
  return {
    categories: IMAGE_PRESET_CATEGORIES.map(category => ({ ...category })),
    presets: IMAGE_PRESETS.map(normalizeImagePreset),
  };
}

const SUBJECT_PLACEHOLDERS = [
  '[主体详细描述]', '[角色面部详细描述]', '[产品详细描述]', '[主体/场景/动作]',
  '[事件/场景]', '[主体/场景]', '[主体]',
];

export function imagePresetById(id) {
  return normalizeImagePreset(IMAGE_PRESETS.find(preset => preset.id === id));
}

export function imagePresetsForCategory(categoryId) {
  return IMAGE_PRESETS.filter(preset => preset.category === categoryId && preset.enabled !== false).map(normalizeImagePreset);
}

export function closestSupportedAspectRatio(width, height, supported = []) {
  const target = Number(width) / Number(height);
  if (!(target > 0)) return '';
  return supported
    .map(value => ({ value, ratio: String(value).split(':').map(Number) }))
    .filter(item => item.ratio.length === 2 && item.ratio.every(part => part > 0))
    .map(item => ({ value: item.value, distance: Math.abs(Math.log(target / (item.ratio[0] / item.ratio[1]))) }))
    .sort((a, b) => a.distance - b.distance)[0]?.value || '';
}

export function composePresetRequestPrompt(systemPrompt, visiblePrompt, originalPrompt = '') {
  const system = String(systemPrompt || '').trim();
  const visible = String(visiblePrompt || '').trim();
  const original = String(originalPrompt || '').trim();
  if (!system) return visible;
  const supplement = visible && visible !== original ? `用户补充或修改描述：${visible}` : '';
  return [system, supplement].filter(Boolean).join('\n\n');
}

export function composeImagePresetPrompt(preset, sourcePrompt) {
  const subject = String(sourcePrompt || '').trim() || '参考图片中的主体与场景';
  let positive = String(preset?.positive || '').trim();
  for (const placeholder of SUBJECT_PLACEHOLDERS) positive = positive.split(placeholder).join(subject);
  const replacements = {
    '[阶段1描述]': `建立${subject}的起始状态`,
    '[阶段2描述]': `延续参考图并推进${subject}的发展状态`,
    '[阶段3描述]': `保持主体一致并呈现${subject}的转折或升级`,
    '[阶段4描述]': `完成${subject}的结果与收束`,
    '[情绪A]': '建立与期待',
    '[情绪B]': '变化与收束',
    '[美妆/大健康食品]': '当前参考产品所属的真实品类',
  };
  for (const [placeholder, value] of Object.entries(replacements)) positive = positive.split(placeholder).join(value);
  const lockInstruction = {
    'style-reference': '参考图只用于控制品类、气质、色彩和材质方向；允许按当前预设重新设计包装，但不得复制参考品牌、Logo或具体版式。',
    'product-structure': '严格锁定参考产品的结构、比例、材质、颜色、Logo位置和关键识别特征；只允许当前预设指定的视角、陈列或轻量SKU变化。',
    'character-identity': '严格锁定参考角色的身份、脸型、五官、发型、服装和配饰；只允许当前预设指定的角度、姿态或表情变化。',
    'composition-lock': '严格锁定参考图的主体、姿态、构图、镜头和场景关系；只改变当前预设指定的光影条件。',
    'scene-continuity': '保持参考场景的空间关系、主体身份和关键识别特征，按当前预设扩展视角，不得制造不合理空间。',
    'strict-reference': '严格基于输入参考图片生成新的组合图片。锁定主体身份、造型、产品结构、材质、颜色、场景关系和关键识别特征；只允许当前预设明确指定的视角、分格和剧情变化。',
  }[preset?.subjectPolicy] || '严格基于输入参考图片生成新的组合图片，并保持主体一致。';
  return [
    lockInstruction,
    `主体描述：${subject}`,
    `生成任务：${positive}`,
  ].join('\n\n');
}
