#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
import subprocess
import re
import os

root = Path(__file__).resolve().parents[1]
for path in root.rglob("package.json"):
    if "node_modules" in path.parts:
        continue
    json.loads(path.read_text(encoding="utf-8"))

required = [
    root / "apps/web/src/components/studio-shell.tsx",
    root / "packages/canvas/src/studio-canvas.tsx",
    root / "packages/canvas/src/nodes.tsx",
    root / "packages/editor/src/timeline-panel.tsx",
    root / "packages/media-gateway/src/model-validation.ts",
]
missing = [str(path.relative_to(root)) for path in required if not path.exists()]
if missing:
    raise SystemExit(f"missing required source files: {missing}")

sources = [str(path.relative_to(root)) for base in (root / "apps", root / "packages") for path in base.rglob("*.ts") if "node_modules" not in path.parts] + [str(path.relative_to(root)) for base in (root / "apps", root / "packages") for path in base.rglob("*.tsx") if "node_modules" not in path.parts]
tsc = ["node", str(root / "node_modules/typescript/bin/tsc")] if os.name == "nt" else ["tsc"]
cmd = [*tsc, "--noEmit", "--target", "ES2023", "--module", "ESNext", "--moduleResolution", "bundler", "--jsx", "react-jsx", "--skipLibCheck", "--noResolve", *sources]
proc = subprocess.run(cmd, cwd=root, text=True, encoding="utf-8", errors="replace", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
parse_codes = {"1005", "1109", "1128", "1136", "1144", "1160", "1381", "1382", "1434", "1472", "17008"}
parse_errors = []
for line in proc.stdout.splitlines():
    match = re.search(r"error TS(\d+):", line)
    if match and match.group(1) in parse_codes:
        parse_errors.append(line)
if parse_errors:
    raise SystemExit("TypeScript parser errors:\n" + "\n".join(parse_errors))
print(f"OK: {len(sources)} TypeScript files have no parser diagnostics; package JSON files parse successfully.")
print("Note: this is a parser check; run pnpm typecheck for dependency-aware validation.")
