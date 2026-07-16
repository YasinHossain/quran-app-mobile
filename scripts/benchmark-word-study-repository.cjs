const { performance } = require('node:perf_hooks');
const {
  NodeWordStudyDatabaseProvider,
  loadRepositoryModule,
} = require('../tests/word-study-repository/helpers.cjs');

const { SQLiteWordStudyRepository } = loadRepositoryModule();

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function measure(iterations, operation) {
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    await operation(index);
    samples.push(performance.now() - started);
  }
  return {
    iterations,
    p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...samples).toFixed(3)),
  };
}

async function main() {
  const provider = new NodeWordStudyDatabaseProvider();
  try {
    const repository = new SQLiteWordStudyRepository(provider);
    const db = await provider.getDatabaseAsync();
    const locations = (await db.getAllAsync(
      'SELECT location FROM word_analysis ORDER BY location LIMIT 250;'
    )).map((row) => row.location);

    const lookup = await measure(200, async (index) => {
      repository.clearCache();
      await repository.findByLocation(locations[index % locations.length]);
    });
    const lemma = await measure(100, () =>
      repository.findOccurrences({ scope: 'lemma', lemmaId: '671', limit: 50 })
    );
    const root = await measure(100, () =>
      repository.findOccurrences({ scope: 'root', rootId: '1438', limit: 50 })
    );
    const result = {
      profile: 'Node 24 node:sqlite CI-equivalent; OS file cache warm; repository LRU cold per lookup',
      lookup,
      first50Lemma: lemma,
      first50Root: root,
      thresholdsMs: { lookupP95: 50, occurrenceP95: 100 },
      passed: lookup.p95Ms < 50 && lemma.p95Ms < 100 && root.p95Ms < 100,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.passed) process.exitCode = 1;
  } finally {
    await provider.closeAsync();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
