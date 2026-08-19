import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const destDir = path.join(__dirname, "../public/model-icons");
const require = createRequire(import.meta.url);

/** @type {Record<string, string>} dest filename -> lobe-icons source filename */
const ICON_MAP = {
  "agnes.svg": "agnesai.svg",
  "doubao.svg": "doubao-color.svg",
  "deepseek.svg": "deepseek-color.svg",
  "openai.svg": "openai.svg",
  "google.svg": "google-color.svg",
  "qwen.svg": "qwen-color.svg",
  "flux.svg": "flux.svg",
  "kling.svg": "kling-color.svg",
  "gemini.svg": "gemini-color.svg",
  "anthropic.svg": "anthropic.svg",
  "hailuo.svg": "hailuo-color.svg",
  "midjourney.svg": "midjourney.svg",
  "sora.svg": "sora-color.svg",
  "volcengine.svg": "volcengine-color.svg",
};

function resolveIconsDir() {
  try {
    const pkg = require.resolve("@lobehub/icons-static-svg/package.json");
    return path.join(path.dirname(pkg), "icons");
  } catch {
    const local = path.join(__dirname, "../node_modules/@lobehub/icons-static-svg/icons");
    if (fs.existsSync(local)) return local;
    throw new Error("Install @lobehub/icons-static-svg first (pnpm add -D @lobehub/icons-static-svg).");
  }
}

function normalizeSvg(content) {
  return content
    .replace(/\sheight="1em"/g, "")
    .replace(/\swidth="1em"/g, "")
    .replace(/\sstyle="flex:none;line-height:1"/g, "")
    .replace(/fill="currentColor"/g, 'fill="#E8E8E8"');
}

const srcDir = resolveIconsDir();
fs.mkdirSync(destDir, { recursive: true });

for (const [destName, srcName] of Object.entries(ICON_MAP)) {
  const srcPath = path.join(srcDir, srcName);
  const destPath = path.join(destDir, destName);
  if (!fs.existsSync(srcPath)) {
    console.warn(`skip ${destName}: missing source ${srcName}`);
    continue;
  }
  fs.writeFileSync(destPath, normalizeSvg(fs.readFileSync(srcPath, "utf8")));
  console.log(`wrote ${destName} <- ${srcName}`);
}

const modelFallbackSrc = path.join(srcDir, "openrouter.svg");
const modelDest = path.join(destDir, "model.svg");
if (fs.existsSync(modelFallbackSrc)) {
  fs.writeFileSync(modelDest, normalizeSvg(fs.readFileSync(modelFallbackSrc, "utf8")));
  console.log("wrote model.svg <- openrouter.svg (generic fallback)");
}
