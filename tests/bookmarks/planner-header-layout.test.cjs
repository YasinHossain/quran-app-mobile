const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const en = require('../../locales/en/common.json');
const bn = require('../../locales/bn/common.json');
const ar = require('../../locales/ar/common.json');
const ur = require('../../locales/ur/common.json');
const hi = require('../../locales/hi/common.json');

const LOCALES = { en, bn, ar, ur, hi };

test('Planner header translation keys exist and are non-empty across all locales', () => {
  const keys = ['binder_tab_planner', 'planner_header_description', 'planner_create_plan'];
  for (const [lang, dict] of Object.entries(LOCALES)) {
    for (const key of keys) {
      assert.ok(
        typeof dict[key] === 'string' && dict[key].trim().length > 0,
        `Expected key "${key}" to exist and be non-empty in locale "${lang}"`
      );
    }
  }
});

test('PlannerHeader component defines flex-1 and min-w-0 on text container to prevent collision with plus icon', () => {
  const componentPath = path.resolve(__dirname, '../../components/bookmarks/planner/PlannerHeader.tsx');
  const content = fs.readFileSync(componentPath, 'utf8');

  // Must have flex-1 on text container so it wraps within available width
  assert.match(
    content,
    /className="min-w-0 flex-1"/,
    'PlannerHeader text container must have "min-w-0 flex-1" so text wraps properly'
  );

  // Must have flex-shrink-0 or shrink-0 on action button and icon so they are not compressed
  assert.ok(
    content.includes('flex-shrink-0') || content.includes('shrink-0'),
    'PlannerHeader icon and button must have flex-shrink-0 to maintain fixed dimensions'
  );
});

test('Bookmarks folder header defines flex-1 and min-w-0 on text container to prevent collision with plus icon', () => {
  const bookmarksPath = path.resolve(__dirname, '../../app/(tabs)/bookmarks.tsx');
  const content = fs.readFileSync(bookmarksPath, 'utf8');

  // Must have min-w-0 flex-1 for folder header
  assert.match(
    content,
    /<View className="min-w-0 flex-1">[\s\S]*?{t\('binder_tab_all'\)}/,
    'Bookmarks folder header text container must have "min-w-0 flex-1"'
  );
});

test('Planner empty state translation keys exist across all locales with natural modern Bengali copy', () => {
  const emptyKeys = ['planner_empty_title', 'planner_empty_description'];
  for (const [lang, dict] of Object.entries(LOCALES)) {
    for (const key of emptyKeys) {
      assert.ok(
        typeof dict[key] === 'string' && dict[key].trim().length > 0,
        `Expected key "${key}" to exist and be non-empty in locale "${lang}"`
      );
    }
  }

  // Bengali copy must not use robotic/archaic terms like "বোতামে", "উপরের ডান কোণে থাকা", or "আপনার প্রথম"
  assert.ok(
    !bn.planner_empty_description.includes('বোতামে'),
    'Bengali planner empty description should use modern "বাটনে" rather than archaic "বোতামে"'
  );
  assert.ok(
    !bn.planner_empty_description.includes('উপরের ডান কোণে থাকা'),
    'Bengali planner empty description should avoid clunky "উপরের ডান কোণে থাকা" phrasing'
  );
  assert.ok(
    !bn.planner_empty_title.includes('আপনার প্রথম'),
    'Bengali planner empty title should avoid robotic literal translation "আপনার প্রথম"'
  );
});

test('PlannerEmptyState centers both title and description text', () => {
  const emptyStatePath = path.resolve(__dirname, '../../components/bookmarks/planner/PlannerEmptyState.tsx');
  const content = fs.readFileSync(emptyStatePath, 'utf8');

  assert.match(
    content,
    /Text className="[^"]*text-center[^"]*"[^>]*>\s*\{t\('planner_empty_title'\)\}/,
    'PlannerEmptyState title must have text-center class'
  );
  assert.match(
    content,
    /Text className="[^"]*text-center[^"]*"[^>]*>\s*\{t\('planner_empty_description'\)\}/,
    'PlannerEmptyState description must have text-center class'
  );
});

test('PlannerSection wraps PlannerEmptyState in a centered flex-1 container', () => {
  const sectionPath = path.resolve(__dirname, '../../components/bookmarks/planner/PlannerSection.tsx');
  const content = fs.readFileSync(sectionPath, 'utf8');

  assert.match(
    content,
    /<View className="flex-1 items-center justify-center[^"]*">\s*<PlannerEmptyState \/>\s*<\/View>/,
    'PlannerSection must wrap PlannerEmptyState in flex-1 items-center justify-center container'
  );
});

