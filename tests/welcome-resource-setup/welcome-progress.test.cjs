const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('welcome screen exports and initial language defaults', () => {
  const defaults = require(path.join(root, 'src/data/initial-language-defaults.json'));
  assert.equal(defaults.en, 20);
  assert.equal(defaults.bn, 161);
  assert.equal(defaults.hi, 122);
  assert.equal(defaults.ur, 54);
  assert.equal(defaults.ar, null);
});

test('localizeDigits correctly localizes progress percentage digits for each UI language', () => {
  const { localizeDigits } = require(path.join(root, 'lib/i18n/localizeNumbers.ts'));

  assert.equal(localizeDigits('0', 'bn'), '০');
  assert.equal(localizeDigits('45', 'bn'), '৪৫');
  assert.equal(localizeDigits('100', 'bn'), '১০০');

  assert.equal(localizeDigits('45', 'en'), '45');
  assert.equal(localizeDigits('100', 'en'), '100');

  assert.equal(localizeDigits('45', 'hi'), '४५');
  assert.equal(localizeDigits('100', 'hi'), '१००');

  assert.equal(localizeDigits('45', 'ar'), '٤٥');
  assert.equal(localizeDigits('100', 'ar'), '١٠٠');

  assert.equal(localizeDigits('45', 'ur'), '۴۵');
  assert.equal(localizeDigits('100', 'ur'), '۱۰۰');
});

test('welcome.tsx includes download percentage display, progress fill bar, and speculative preloading', () => {
  const welcomeSource = fs.readFileSync(path.join(root, 'app/welcome.tsx'), 'utf8');

  // Verify percentage state and formatting
  assert.ok(welcomeSource.includes('downloadPercent'), 'tracks downloadPercent state');
  assert.ok(welcomeSource.includes('localizedPercent'), 'computes localizedPercent');
  assert.ok(welcomeSource.includes('localizeDigits'), 'uses localizeDigits for numeral formatting');

  // Verify visual progress bar fill
  assert.ok(welcomeSource.includes('buttonProgressFill'), 'renders buttonProgressFill');
  assert.ok(welcomeSource.includes('buttonContentRow'), 'renders buttonContentRow for z-index layering');

  // Verify pre-warming on language selection
  assert.ok(welcomeSource.includes('preloadInitialTranslationAsync'), 'pre-warms on selection');
  assert.ok(welcomeSource.includes('subscribeInitialTranslationProgress'), 'subscribes to live progress');

  // Verify increased timeout to allow mobile downloads to complete before navigation
  assert.ok(welcomeSource.includes('25000'), 'uses generous 25s timeout instead of 7s');
});

test('initialSetup.ts exports progress subscription and preloading utilities', () => {
  const setupSource = fs.readFileSync(path.join(root, 'lib/onboarding/initialSetup.ts'), 'utf8');

  assert.ok(setupSource.includes('export function subscribeInitialTranslationProgress'), 'exports progress subscriber');
  assert.ok(setupSource.includes('export function preloadInitialTranslationAsync'), 'exports preloadInitialTranslationAsync');
  assert.ok(setupSource.includes('export function cancelInitialTranslationAsync'), 'exports cancelInitialTranslationAsync');
  assert.ok(setupSource.includes('inFlightInstalls'), 'deduplicates in-flight installs');
});
