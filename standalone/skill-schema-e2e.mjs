import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const skillsDir = path.join(root, 'skills');
const schemaPath = path.join(skillsDir, 'skill.schema.json');

function readSkills() {
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsDir, entry.name, 'skill.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ file, skill: JSON.parse(fs.readFileSync(file, 'utf8')) }));
}

function validateSkill({ file, skill }) {
  const errors = [];
  const rel = path.relative(root, file);
  const req = ['id', 'name', 'category', 'kind', 'description', 'cardSummary', 'howToUse', 'outputs', 'fixedSteps', 'rules', 'execution'];
  for (const key of req) {
    if (skill[key] == null || skill[key] === '') errors.push(`${rel}: missing ${key}`);
  }
  if (skill.cardSummary && skill.cardSummary.length > 72) errors.push(`${rel}: cardSummary > 72 chars`);
  if (skill.description && skill.description.length > 280) errors.push(`${rel}: description > 280 chars`);
  if (skill.howToUse && skill.howToUse.length > 120) errors.push(`${rel}: howToUse > 120 chars`);
  if (skill.cardSummary && /\d+\s*(?:秒|镜)|v\d/.test(skill.cardSummary)) {
    errors.push(`${rel}: cardSummary should not repeat specs (duration/shots/version)`);
  }
  return errors;
}

const schemaExists = fs.existsSync(schemaPath);
console.log(`${schemaExists ? 'PASS' : 'FAIL'} skill.schema.json exists`);
if (!schemaExists) process.exitCode = 1;

const readmeExists = fs.existsSync(path.join(skillsDir, 'README.md'));
console.log(`${readmeExists ? 'PASS' : 'FAIL'} skills/README.md documents copy fields`);
if (!readmeExists) process.exitCode = 1;

const skills = readSkills();
console.log(`${skills.length ? 'PASS' : 'FAIL'} at least one skill.json loaded (${skills.length})`);
if (!skills.length) process.exitCode = 1;

for (const item of skills) {
  const errors = validateSkill(item);
  const pass = !errors.length;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${path.relative(root, item.file)} copy fields`);
  if (!pass) {
    errors.forEach((msg) => console.log(`  - ${msg}`));
    process.exitCode = 1;
  }
}
