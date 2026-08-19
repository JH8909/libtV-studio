import { basename, extname, join } from "node:path";
import { existsSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { spawn } from "node:child_process";

export function contentTypeOnly(value = "") {
  return value.split(";")[0].trim().toLowerCase();
}

export function mimeFromExt(file) {
  const ext = extname(file).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".htm": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".ogg": "audio/ogg",
      ".aac": "audio/aac",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".ttf": "font/ttf",
      ".json": "application/json",
      ".txt": "text/plain; charset=utf-8",
      ".md": "text/markdown; charset=utf-8",
      ".csv": "text/csv; charset=utf-8",
      ".xml": "application/xml",
      ".pdf": "application/pdf",
    }[ext] || "application/octet-stream"
  );
}

export function kindFromMime(mime, filename = "") {
  if ((mime || "").startsWith("image/")) return "image";
  if ((mime || "").startsWith("video/")) return "video";
  if ((mime || "").startsWith("audio/")) return "audio";
  const ext = extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) return "image";
  if ([".mp4", ".webm", ".mov", ".mkv"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".aac", ".m4a", ".ogg"].includes(ext)) return "audio";
  return "document";
}

export function cleanFilename(name = "asset.bin") {
  return basename(name).replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]+/g, "_").slice(0, 120) || "asset.bin";
}

export function execFile(command, args, { cwd, timeout = 120000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timeout`));
    }, timeout);
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolvePromise({ stdout, stderr })
        : reject(new Error(`${command} exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

export async function mediaMetadata(file) {
  try {
    const { stdout } = await execFile(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file],
      { timeout: 15000 },
    );
    const data = JSON.parse(stdout);
    const video = data.streams?.find((s) => s.codec_type === "video");
    const audio = data.streams?.find((s) => s.codec_type === "audio");
    return {
      width: video?.width,
      height: video?.height,
      hasAudio: Boolean(audio),
      durationMs: data.format?.duration ? Math.round(Number(data.format.duration) * 1000) : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Local media helpers used by MediaProvider adapters (read storageKey, normalize images).
 * Aligns with ProviderGenerationReference.storageKey / url from packages/shared.
 */
export function createMediaAccess({ assetsDir, hasFfmpeg, publicBaseUrl, externalReferenceMode = "data-uri" }) {
  async function normalizeImage(storageKey, mimeHint) {
    const src = join(assetsDir, storageKey);
    const mime = contentTypeOnly(mimeHint || mimeFromExt(src));
    if (["image/png", "image/jpeg", "image/webp"].includes(mime)) return { path: src, mime, storageKey };
    if (!hasFfmpeg) {
      throw new Error(`reference image (${mime}) must be PNG/JPEG/WebP; install ffmpeg to normalize it`);
    }
    const filename = `provider-norm-${storageKey.replace(/[^\w.-]+/g, "_")}.png`;
    const target = join(assetsDir, filename);
    if (!existsSync(target)) {
      await execFile("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-frames:v", "1", target], {
        timeout: 30000,
      });
    }
    return { path: target, mime: "image/png", storageKey: filename };
  }

  async function readBytes(storageKey) {
    return fsp.readFile(join(assetsDir, storageKey));
  }

  function publicUrlFor(storageKey) {
    if (!publicBaseUrl) return null;
    return `${publicBaseUrl.replace(/\/$/, "")}/media/assets/${encodeURIComponent(storageKey)}`;
  }

  async function imageReferenceValue(storageKey, mimeHint, { providerUrl } = {}) {
    const normalized = await normalizeImage(storageKey, mimeHint);
    const pub = publicUrlFor(normalized.storageKey);
    if (pub) return pub;
    if (typeof providerUrl === "string" && /^https:\/\//i.test(providerUrl)) return providerUrl;
    if (externalReferenceMode === "data-uri") {
      const bytes = await fsp.readFile(normalized.path);
      if (bytes.length > 20 * 1024 * 1024) throw new Error("reference image too large for data-uri; set PUBLIC_BASE_URL");
      return `data:${normalized.mime};base64,${bytes.toString("base64")}`;
    }
    throw new Error("cloud image reference requires PUBLIC_BASE_URL or EXTERNAL_REFERENCE_MODE=data-uri");
  }

  return { normalizeImage, readBytes, publicUrlFor, imageReferenceValue, assetsDir };
}
