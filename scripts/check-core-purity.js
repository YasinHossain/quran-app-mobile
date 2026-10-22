/* eslint-disable no-console */
const fs = require('fs/promises');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..');

const targetDirectories = [
  path.join(mobileRoot, 'src', 'core', 'domain'),
  path.join(mobileRoot, 'src', 'core', 'application'),
];

/** @type {Array<{name: string; pattern: RegExp; message: string}>} */
const rules = [
  {
    name: 'platform-import',
    pattern:
      /\b(?:from|require)\s*(?:\(|)\s*['"](?:react-native|expo(?:-[^'"]+)?|next(?:\/[^'"]+)?|react-dom)['"]\s*\)?/,
    message:
      'Shared core must not import platform-specific modules (react-native/expo/next/react-dom).',
  },
  {
    name: 'browser-global',
    pattern: /\b(?:window|document)\s*\./,
    message: 'Shared core must not reference browser globals (window/document).',
  },
  {
    name: 'web-storage',
    pattern: /\b(?:localStorage|sessionStorage)\b/,
    message: 'Shared core must not reference Web Storage (localStorage/sessionStorage).',
  },
];

async function exists(absolutePath) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function listTsFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTsFiles(absolutePath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.tsx?$/.test(entry.name)) continue;
    files.push(absolutePath);
  }

  return files;
}

async function main() {
  const missing = [];
  for (const dir of targetDirectories) {
    if (!(await exists(dir))) missing.push(path.relative(mobileRoot, dir));
  }
  if (missing.length > 0) {
    console.error(`Core purity check skipped (missing directories): ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const files = (
    await Promise.all(targetDirectories.map((dir) => listTsFiles(dir)))
  ).flat();

  /** @type {Array<{file: string; lineNumber: number; rule: string; message: string; line: string}>} */
  const violations = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const rule of rules) {
        if (!rule.pattern.test(line)) continue;
        violations.push({
          file: path.relative(mobileRoot, file),
          lineNumber: index + 1,
          rule: rule.name,
          message: rule.message,
          line: line.trim(),
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log('Core purity check passed.');
    return;
  }

  console.error('Core purity check failed.');
  console.error('The following violations were found in shared core files:');
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.lineNumber} [${violation.rule}] ${violation.message}`
    );
    console.error(`  ${violation.line}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

