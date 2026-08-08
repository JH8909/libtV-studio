#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/.upstream"
mkdir -p "$TARGET"

# Pinned snapshots verified on 2026-08-07. Override with env vars when intentionally upgrading.
TONGFLOW_REF="${TONGFLOW_REF:-ff4fa3285fadcb69788abc29dbbc6de148185901}"
OPENCHATCUT_REF="${OPENCHATCUT_REF:-8b01756dbb97e4dd4327020e13dac6a8454656ec}"
MCP_VIDEO_GEN_REF="${MCP_VIDEO_GEN_REF:-2a841acc67e48a3004c10e6cd67a54dcf9198a95}"

clone_or_pin() {
  local name="$1" url="$2" ref="$3"
  if [ ! -d "$TARGET/$name/.git" ]; then
    git clone --filter=blob:none --no-checkout "$url" "$TARGET/$name"
  fi
  git -C "$TARGET/$name" fetch --all --prune
  git -C "$TARGET/$name" checkout --detach "$ref"
  printf '%-16s %s\n' "$name" "$(git -C "$TARGET/$name" rev-parse HEAD)"
}

clone_or_pin tongflow https://github.com/tong-io/tongflow.git "$TONGFLOW_REF"
clone_or_pin openchatcut https://github.com/0xsline/OpenChatCut.git "$OPENCHATCUT_REF"
clone_or_pin mcp-video-gen https://github.com/kevinten-ai/mcp-video-gen.git "$MCP_VIDEO_GEN_REF"
echo "Pinned upstreams are under $TARGET"
