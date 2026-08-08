import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ProviderOutput } from "@libtv/shared";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "asset.bin";
}

function client() {
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: required("S3_ENDPOINT"),
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY"),
      secretAccessKey: required("S3_SECRET_KEY"),
    },
  });
}

async function readOutput(output: ProviderOutput): Promise<Buffer> {
  switch (output.source.type) {
    case "bytes":
      return Buffer.from(output.source.dataBase64, "base64");
    case "file":
      return readFile(output.source.path);
    case "url": {
      const response = await fetch(output.source.url, { headers: output.source.headers });
      if (!response.ok) throw new Error(`provider output download failed: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    }
  }
}

export async function ingestProviderOutput(args: {
  projectId: string;
  jobId: string;
  output: ProviderOutput;
}) {
  const bucket = required("S3_BUCKET");
  const fallback = args.output.source.type === "file" ? basename(args.output.source.path) : `${randomUUID()}.bin`;
  const filename = safeFilename(args.output.filename || fallback);
  const key = `${args.projectId}/${args.jobId}/${randomUUID()}-${filename}`;
  const body = await readOutput(args.output);
  await client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: args.output.mime,
  }));

  const publicBase = (process.env.S3_PUBLIC_BASE_URL || `${required("S3_ENDPOINT").replace(/\/$/, "")}/${bucket}`).replace(/\/$/, "");
  return {
    storageKey: key,
    publicUrl: `${publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`,
    filename,
    mime: args.output.mime,
    size: body.byteLength,
  };
}
