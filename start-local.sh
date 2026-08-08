#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then echo "Node.js 22+ is required." >&2; exit 1; fi
MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$MAJOR" -lt 22 ]; then echo "Node.js 22+ is required; found $(node -v)." >&2; exit 1; fi
if ! command -v ffmpeg >/dev/null 2>&1; then echo "Warning: ffmpeg not found. Studio works, but Timeline MP4 export will fail until ffmpeg is installed." >&2; fi
cd "$ROOT"
exec node standalone/server.mjs
