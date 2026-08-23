import dns from "node:dns/promises";
import net from "node:net";
import { basename, join } from "node:path";
import { createWriteStream } from "node:fs";
import { promises as fsp } from "node:fs";
import { cleanFilename, contentTypeOnly, mediaMetadata, mimeFromExt } from "./media.mjs";

async function safeRemoteUrl(raw) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported remote URL protocol");
  if (["localhost", "0.0.0.0", "::1"].includes(url.hostname)) throw new Error("blocked remote URL host");
  if (net.isIP(url.hostname)) {
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) {
      throw new Error("blocked private remote IP");
    }
  } else {
    const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
    for (const a of addresses) {
      if (
        a.family === 4 &&
        (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(a.address) || /^172\.(1[6-9]|2\d|3[01])\./.test(a.address))
      ) {
        throw new Error("blocked private remote address");
      }
    }
  }
  return url;
}

async function readProviderOutput(output, fetchImpl = globalThis.fetch.bind(globalThis), signal) {
  switch (output.source.type) {
    case "bytes":
      return Buffer.from(output.source.dataBase64, "base64");
    case "file":
      return fsp.readFile(output.source.path);
    case "url": {
      const url = await safeRemoteUrl(output.source.url);
      const response = await fetchImpl(url, {
        redirect: "follow",
        headers: output.source.headers,
        signal,
      });
      if (!response.ok || !response.body) throw new Error(`output download failed ${response.status}`);
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        chunks.push(chunk);
      }
      return { buffer: Buffer.concat(chunks), responseMime: contentTypeOnly(response.headers.get("content-type") || ""), size };
    }
    default:
      throw new Error(`unsupported provider output source: ${output.source?.type}`);
  }
}

/**
 * Local ingest aligned with packages/storage ingestProviderOutput + ProviderOutput.
 * Persists bytes to assetsDir and returns fields for an Asset row.
 */
export async function ingestProviderOutput({
  projectId,
  jobId,
  output,
  assetsDir,
  maxRemoteBytes = 1024 * 1024 * 1024,
  fetchImpl = globalThis.fetch.bind(globalThis),
  signal,
}) {
  let buffer;
  let responseMime = "";
  if (output.source.type === "url") {
    const read = await readProviderOutput(output, fetchImpl, signal);
    buffer = read.buffer;
    responseMime = read.responseMime;
    if (buffer.length > maxRemoteBytes) throw new Error("remote output exceeds MAX_REMOTE_BYTES");
  } else {
    buffer = await readProviderOutput(output, fetchImpl, signal);
    if (buffer.length > maxRemoteBytes) throw new Error("remote output exceeds MAX_REMOTE_BYTES");
  }

  const mime =
    contentTypeOnly(output.mime || responseMime) ||
    (output.kind === "image" ? "image/png" : output.kind === "audio" ? "audio/mpeg" : "video/mp4");
  const fallbackName =
    output.source.type === "file"
      ? basename(output.source.path)
      : output.source.type === "url"
        ? basename(new URL(output.source.url).pathname) || `${jobId}.${output.kind === "image" ? "png" : "mp4"}`
        : `${jobId}.${output.kind === "image" ? "png" : "mp4"}`;
  const remoteName = cleanFilename(output.filename || fallbackName);
  const filename = `${jobId}-${remoteName}`;
  const target = join(assetsDir, filename);
  await fsp.writeFile(target, buffer, { flag: "wx" });
  const meta = await mediaMetadata(target);
  return {
    storageKey: filename,
    publicUrl: `/media/assets/${encodeURIComponent(filename)}`,
    filename: remoteName,
    mime: mime || mimeFromExt(filename),
    size: buffer.length,
    localPath: target,
    width: meta.width ?? output.metadata?.width,
    height: meta.height ?? output.metadata?.height,
    durationMs: meta.durationMs ?? output.metadata?.durationMs,
    metadata: { ...meta, ...(output.metadata || {}), size: buffer.length, generationId: jobId },
  };
}

/** Stream-to-disk path used when response body must not be buffered whole (large video). */
export async function ingestRemoteUrlToAsset({
  projectId,
  jobId,
  kind,
  rawUrl,
  assetsDir,
  metadata = {},
  downloadHeaders = {},
  maxRemoteBytes = 1024 * 1024 * 1024,
  fetchImpl = globalThis.fetch.bind(globalThis),
  signal,
  addAsset,
  now,
}) {
  const url = await safeRemoteUrl(rawUrl);
  const response = await fetchImpl(url, { redirect: "follow", headers: downloadHeaders, signal });
  if (!response.ok || !response.body) throw new Error(`output download failed ${response.status}`);
  const mime = contentTypeOnly(response.headers.get("content-type") || "") || (kind === "image" ? "image/png" : "video/mp4");
  const remoteName = cleanFilename(basename(url.pathname) || `${jobId}.${kind === "image" ? "png" : "mp4"}`);
  const filename = `${jobId}-${remoteName}`;
  const target = join(assetsDir, filename);
  const file = createWriteStream(target, { flags: "wx" });
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxRemoteBytes) throw new Error("remote output exceeds MAX_REMOTE_BYTES");
      if (!file.write(chunk)) await new Promise((r) => file.once("drain", r));
    }
    await new Promise((r, j) => file.end((err) => (err ? j(err) : r())));
  } catch (error) {
    file.destroy();
    await fsp.rm(target, { force: true });
    throw error;
  }
  return addAsset({
    projectId,
    kind,
    filename,
    mime,
    localPath: target,
    metadata: { ...metadata, generationId: jobId, generatedAt: now(), ...(await mediaMetadata(target)), size },
    source: "external",
  });
}
