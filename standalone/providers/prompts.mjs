/** Prompt composition helpers shared by video/image adapters. */

const SEEDANCE_AUDIO_PREFIXES = {
  silent: "【声音配置】静音模式。不要生成环境音、动作音效、背景音乐、人声口播或旁白。",
  ambient:
    "【声音配置】保留真实环境音和动作音效，例如脚步声、倒水声、开盖声、包装摩擦声、产品接触声和空间氛围声；不要人声口播，不要背景音乐。",
  music:
    "【声音配置】生成真实环境音、动作音效和轻快背景音乐；不要人声口播或旁白。背景音乐不能盖过关键动作音效。",
  voiceover:
    "【声音配置】生成真实环境音、动作音效和人声口播/旁白；背景音乐不生成或仅保留极轻的铺底音乐。口播节奏必须贴合画面动作。",
  full: "【声音配置】环境音、动作音效、背景音乐和人声口播全部允许。环境音要贴合画面动作，背景音乐要符合广告节奏，人声口播要清晰自然。",
};

const SEEDANCE_PRODUCT_LOCK_PREFIX =
  "【通用产品外观硬约束】\n产品外观唯一以产品参考图和本次产品专属约束为准。分镜图只用于参考镜头顺序、构图、人物/手部/身体局部动作、场景、光线和画面节奏，不用于参考或覆盖产品外观。所有镜头中的产品必须保持产品参考图里的真实品类、轮廓、结构、颜色、材质、纹理、比例、包装/组合关系和可见关键识别细节。禁止把 logo、标识、文字、图案、标签或结构细节移动到错误物理位置，禁止为了规避生成难度而删除、弱化、放大、缩小或强行摆正。";

const SEEDANCE_GRID_PREFIX =
  "【九宫格分镜直出规则】\n输入的3x3九宫格分镜图锁定9个镜头的读取顺序、构图、主体位置、场景、光线、人物/手部/产品动作、画面节奏和整体视觉风格。读取顺序固定为从上到下、从左到右。不得跳格、重排、合并成不可辨认的新镜头，也不得新增九宫格和脚本中不存在的场景、道具、人物动作或产品呈现方式。所有镜头必须符合真实物理世界逻辑。";

export function imagePromptWithNegativeFallback(req) {
  const prompt = String(req.prompt || "").trim();
  const negative = String(req.params?.negativePrompt || "").trim();
  return negative
    ? `${prompt}\n\nNegative constraints — do not generate any of the following:\n${negative}`
    : prompt;
}

export function seedancePrompt(req) {
  const params = req.params || {};
  const audioMode = SEEDANCE_AUDIO_PREFIXES[params.audioMode] ? params.audioMode : "ambient";
  const blocks = [SEEDANCE_AUDIO_PREFIXES[audioMode]];
  if (params.referenceMode === "grid-storyboard") blocks.push(SEEDANCE_GRID_PREFIX);
  if (params.injectProductLock === true || params.productLock) blocks.push(SEEDANCE_PRODUCT_LOCK_PREFIX);
  if (params.productLock) blocks.push(`【本次产品专属约束】\n${String(params.productLock).trim()}`);
  if (params.referenceNote) blocks.push(String(params.referenceNote).trim());
  blocks.push(req.prompt);
  return blocks.filter(Boolean).join("\n\n");
}

export function recursivelyFindUrl(value, kind) {
  const candidates = [];
  const walk = (v, key = "") => {
    if (typeof v === "string" && /^https?:\/\//.test(v)) candidates.push({ url: v, key: key.toLowerCase() });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}[${i}]`));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, k));
  };
  walk(value);
  const preferred = kind === "image" ? /(image|images|png|jpg|jpeg|webp)/ : /(video|mp4|webm|mov)/;
  return candidates.find((c) => preferred.test(c.key) || preferred.test(c.url.toLowerCase()))?.url || candidates[0]?.url;
}

export function firstResolvedRef(references, roles, kind) {
  for (const ref of references || []) {
    if (!roles.includes(ref.role)) continue;
    if (kind && ref.kind !== kind) continue;
    return ref;
  }
  return null;
}
