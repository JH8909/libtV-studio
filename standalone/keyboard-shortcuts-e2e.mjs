import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const source = await readFile(join(ROOT, 'public', 'app.js'), 'utf8');

const checks = [
  ['space pan state is initialized', /spaceDown:\s*false/.test(source)],
  ['text entry is the only Space exception', /function keyboardTargetAllowsTextEntry/.test(source) && /textarea/.test(source) && /input\[type="text"\]/.test(source)],
  ['Space keydown is handled before focused controls', /window\.addEventListener\('keydown',e=>\{if\(handleSpacePanKeydown\(e\)\)return;[\s\S]*?\},\{capture:true\}\);/.test(source)],
  ['Space keydown consumes browser and control defaults', /function handleSpacePanKeydown/.test(source) && /e\.preventDefault\(\);e\.stopPropagation\(\);return true;/.test(source)],
  ['Space keyup consumes focused button activation', /function handleSpacePanKeyup/.test(source) && /window\.addEventListener\('keyup',handleSpacePanKeyup,\{capture:true\}\);/.test(source)],
  ['old editing-gated Space shortcut is gone', !/e\.code===['"]Space['"]&&!editing/.test(source)],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`keyboard shortcut regression: ${failed.join(', ')}`);

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
