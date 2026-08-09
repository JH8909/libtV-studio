#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { analyzeDom, analyzeHar, diffDom, runPipeline, writeYaml } from './core.mjs';

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error(`Usage:
  node tools/libtv-probe/cli.mjs analyze-har <input.har> <output.yaml>
  node tools/libtv-probe/cli.mjs analyze-dom <input.json> <output.json>
  node tools/libtv-probe/cli.mjs diff <before.json> <after.json> <output.json>
  node tools/libtv-probe/cli.mjs pipeline <session-dir> [repo-root]`);
  process.exitCode = 1;
}

async function json(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function writeJson(path, value) {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`);
}

if (command === 'analyze-har' && args.length === 2) {
  await writeYaml(resolve(args[1]), analyzeHar(await json(args[0])));
} else if (command === 'analyze-dom' && args.length === 2) {
  await writeJson(args[1], analyzeDom(await json(args[0])));
} else if (command === 'diff' && args.length === 3) {
  await writeJson(args[2], diffDom(await json(args[0]), await json(args[1])));
} else if (command === 'pipeline' && args.length >= 1 && args.length <= 2) {
  const result = await runPipeline(resolve(args[0]), resolve(args[1] ?? '.'));
  console.log(JSON.stringify({ endpoints: result.apiMap.endpoints.length, capabilities: result.capabilityMap.capabilities.length, benchmarks: result.benchmark.benchmarks.length }));
} else {
  usage();
}
