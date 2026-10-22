/* eslint-disable no-console */
const fs = require('fs/promises');
const path = require('path');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function syncDir({ source, destination }) {
  if (!(await exists(source))) {
    throw new Error(`Source not found: ${source}`);
  }

  const stat = await fs.stat(source);
  const recursive = stat.isDirectory();

  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive });
}

async function main() {
  const mobileRoot = path.resolve(__dirname, '..');
  const webRoot = process.argv[2]
    ? path.resolve(mobileRoot, process.argv[2])
    : path.resolve(mobileRoot, '..', 'quran-app');

  const mappings = [
    {
      source: path.join(webRoot, 'src', 'domain'),
      destination: path.join(mobileRoot, 'src', 'core', 'domain'),
    },
    {
      source: path.join(webRoot, 'src', 'application'),
      destination: path.join(mobileRoot, 'src', 'core', 'application'),
    },
    {
      source: path.join(webRoot, 'data', 'juz.json'),
      destination: path.join(mobileRoot, 'src', 'data', 'juz.json'),
    },
  ];

  console.log(`Syncing core from: ${webRoot}`);
  for (const mapping of mappings) {
    console.log(`- ${path.relative(mobileRoot, mapping.destination)}`);
    await syncDir(mapping);
  }
  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
