const fs = require('fs');
const path = require('path');

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function run() {
  try {
    console.log('Fetching translations...');
    const translationsData = await fetchJson('https://api.quran.com/api/v4/resources/translations');
    const translations = (translationsData.translations || [])
      .map(t => ({
        id: t.id,
        name: t.translated_name?.name || t.name,
        authorName: t.author_name || '',
        languageName: t.language_name || ''
      }))
      .filter(t => t.id && t.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log('Fetching tafsirs...');
    const tafsirsData = await fetchJson('https://api.quran.com/api/v4/resources/tafsirs');
    const tafsirs = (tafsirsData.tafsirs || [])
      .map(t => ({
        id: t.id,
        name: t.name,
        lang: t.language_name,
        authorName: t.author_name || '',
        slug: t.slug || ''
      }))
      .filter(t => t.id && t.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    const dataDir = path.join(__dirname, '..', 'src', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(dataDir, 'translations.json'),
      JSON.stringify(translations, null, 2)
    );
    console.log(`Saved ${translations.length} translations to src/data/translations.json`);

    fs.writeFileSync(
      path.join(dataDir, 'tafsirs.json'),
      JSON.stringify(tafsirs, null, 2)
    );
    console.log(`Saved ${tafsirs.length} tafsirs to src/data/tafsirs.json`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
