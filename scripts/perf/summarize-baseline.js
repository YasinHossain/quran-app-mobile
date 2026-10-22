#!/usr/bin/env node

const fs = require('fs');

const path = process.argv[2];
if (!path) throw new Error('usage: summarize-baseline.js METRICS_CSV');

const lines = fs.readFileSync(path, 'utf8').trim().split(/\r?\n/);
const headers = lines.shift().split(',');
const rows = lines.map((line) => Object.fromEntries(line.split(',').map((value, index) => [headers[index], value])));
const selected = rows.filter((row) => row.label === 'home-initial' || /cycle-(1|10)-(reader|home)$/.test(row.label));

console.log('| Snapshot | RSS MB | Anon RSS MB | PSS MB | Native allocated MB | Views |');
console.log('|---|---:|---:|---:|---:|---:|');
for (const row of selected) {
  const mb = (key) => (Number(row[key]) / 1024).toFixed(1);
  console.log(`| ${row.label} | ${mb('total_rss_kb')} | ${mb('rss_anon_kb')} | ${mb('total_pss_kb')} | ${mb('native_heap_alloc_kb')} | ${row.views} |`);
}
