const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const source = ts.transpileModule(
  readFileSync(path.join(__dirname, '../../components/motion/modalTransition.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
).outputText;

function mount(t, initialOpen, { reducedMotion = false, strict = false, ...initialOptions } = {}) {
  const animations = [];
  const frames = new Map();
  let nextFrame = 0;
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    stopAnimation() {
      if (this.animation) {
        const animation = this.animation;
        this.animation = null;
        animation.callback({ finished: false });
      }
    }
    interpolate(config) { return config; }
  }
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react-native-reanimated') return { useReducedMotion: () => reducedMotion };
      if (name === 'react-native') return {
        Easing: { bezier: () => 'easing' },
        Animated: {
          Value,
          timing(value, config) {
            return { start(callback) {
              const animation = { config, callback, finish() {
                value.value = config.toValue;
                value.animation = null;
                callback({ finished: true });
              } };
              value.animation = animation;
              animations.push(animation);
            } };
          },
        },
      };
      throw new Error(`Unexpected module: ${name}`);
    },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  let result;
  function Harness({ isOpen, options }) {
    result = exports.useModalTransition(isOpen, options);
    return null;
  }
  let root;
  const element = (isOpen, options) => {
    const child = React.createElement(Harness, { isOpen, options });
    return strict ? React.createElement(React.StrictMode, null, child) : child;
  };
  act(() => { root = create(element(initialOpen, initialOptions)); });
  t.after(() => act(() => root.unmount()));
  return {
    get current() { return result; }, animations,
    update(isOpen, options = initialOptions) { act(() => root.update(element(isOpen, options))); },
    show() { act(() => result.onModalShow()); },
    finish() { act(() => animations.at(-1).finish()); },
    flushFrames() { act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    }); },
    unmount() { act(() => root.unmount()); },
  };
}

test('first mount already open waits for native presentation, then animates from hidden', (t) => {
  let opened = 0;
  const hook = mount(t, true, { onAfterOpen: () => opened++ });
  assert.equal(hook.current.visible, true);
  assert.equal(hook.current.progress.value, 0);
  assert.equal(hook.animations.length, 0);
  hook.show();
  assert.equal(hook.animations[0].config.toValue, 1);
  assert.equal(hook.animations[0].config.useNativeDriver, true);
  assert.equal(opened, 0);
  assert.equal(hook.current.dismissEnabledRef.current, false);
  hook.finish();
  assert.equal(opened, 1);
  assert.equal(hook.current.dismissEnabledRef.current, true);
  hook.show();
  assert.equal(hook.animations.length, 1);
});

test('initially closed and subsequent opens use the same entrance', (t) => {
  const hook = mount(t, false);
  assert.equal(hook.current.visible, false);
  for (let i = 0; i < 2; i++) {
    hook.update(true);
    assert.equal(hook.current.progress.value, 0);
    hook.show();
    hook.finish();
    hook.update(false);
    assert.equal(hook.current.visible, true);
    hook.finish();
    assert.equal(hook.current.visible, false);
    hook.flushFrames();
  }
  assert.equal(hook.animations.length, 4);
});

test('reopening during exit reverses without requiring a second onShow', (t) => {
  let closed = 0;
  const hook = mount(t, true, { onAfterClose: () => closed++ });
  hook.show();
  hook.finish();
  hook.update(false);
  const staleExit = hook.animations.at(-1);
  hook.update(true);
  assert.equal(hook.animations.at(-1).config.toValue, 1);
  act(() => staleExit.callback({ finished: true }));
  hook.finish();
  hook.flushFrames();
  assert.equal(hook.current.visible, true);
  assert.equal(hook.current.dismissEnabledRef.current, true);
  assert.equal(closed, 0);
});

test('closing during entrance never fires the focus callback', (t) => {
  let opened = 0;
  const hook = mount(t, true, { onAfterOpen: () => opened++ });
  hook.show();
  const staleEntrance = hook.animations.at(-1);
  hook.update(false);
  act(() => staleEntrance.callback({ finished: true }));
  hook.finish();
  assert.equal(opened, 0);
  assert.equal(hook.current.visible, false);
});

test('content reset runs after exit and is cancelled if reopened before that frame', (t) => {
  let closed = 0;
  const hook = mount(t, true, { onAfterClose: () => closed++ });
  hook.show();
  hook.finish();
  hook.update(false);
  assert.equal(closed, 0);
  hook.finish();
  assert.equal(closed, 0);
  hook.update(true);
  hook.flushFrames();
  assert.equal(closed, 0);
  hook.show();
  hook.finish();
  hook.update(false);
  hook.finish();
  hook.flushFrames();
  assert.equal(closed, 1);
});

test('reduced motion skips animation but preserves presentation and completion callbacks', (t) => {
  let opened = 0;
  let closed = 0;
  const hook = mount(t, true, { reducedMotion: true, onAfterOpen: () => opened++, onAfterClose: () => closed++ });
  assert.equal(opened, 0);
  hook.show();
  assert.equal(hook.current.progress.value, 1);
  assert.equal(opened, 1);
  hook.update(false);
  assert.equal(hook.current.visible, false);
  hook.flushFrames();
  assert.equal(closed, 1);
  assert.equal(hook.animations.length, 0);
});

test('callback changes do not restart entrance and completion uses the latest callback', (t) => {
  let opened = 0;
  const hook = mount(t, true, { onAfterOpen: () => { throw new Error('stale callback'); } });
  hook.show();
  hook.update(true, { onAfterOpen: () => opened++ });
  assert.equal(hook.animations.length, 1);
  hook.finish();
  assert.equal(opened, 1);
});

test('unmount cancels pending completion work', (t) => {
  let closed = 0;
  const hook = mount(t, true, { onAfterClose: () => closed++ });
  hook.show();
  hook.finish();
  hook.update(false);
  hook.finish();
  hook.unmount();
  hook.flushFrames();
  assert.equal(closed, 0);
});

test('Strict Mode effect replay still animates first presentation', (t) => {
  const hook = mount(t, true, { strict: true });
  hook.show();
  hook.finish();
  assert.equal(hook.current.progress.value, 1);
  assert.equal(hook.current.dismissEnabledRef.current, true);
});

test('native presentation arriving during exit is remembered for a rapid reopen', (t) => {
  const hook = mount(t, true);
  hook.update(false);
  hook.show();
  hook.update(true);
  assert.equal(hook.animations.at(-1).config.toValue, 1);
  hook.finish();
  assert.equal(hook.current.dismissEnabledRef.current, true);
});

test('zero-duration handoff closes immediately and defers its action until the next frame', (t) => {
  let closed = 0;
  const hook = mount(t, true, { closeDuration: 0, onAfterClose: () => closed++ });
  hook.show();
  hook.finish();
  hook.update(false);
  assert.equal(hook.current.visible, false);
  assert.equal(hook.animations.length, 1);
  assert.equal(closed, 0);
  hook.flushFrames();
  assert.equal(closed, 1);
});

for (const [preset, openDuration, closeDuration] of [
  ['dialog', 200, 140],
  ['sheet', 240, 160],
  ['drawer', 240, 160],
  ['popover', 140, 100],
]) {
  test(`${preset} uses its shared entrance and exit timings`, (t) => {
    const hook = mount(t, true, { preset });
    hook.show();
    assert.equal(hook.animations.at(-1).config.duration, openDuration);
    hook.finish();
    hook.update(false);
    assert.equal(hook.animations.at(-1).config.duration, closeDuration);
    hook.finish();
    assert.equal(hook.current.visible, false);
  });
}

test('frequent drawers and action sheets stay in the app window portal', () => {
  const targets = [
    'app/(tabs)/index.tsx',
    'components/reader/settings/SettingsSidebar.tsx',
    'components/bookmarks/FolderActionsSheet.tsx',
    'components/surah/VerseActionsSheet.tsx',
  ];

  for (const target of targets) {
    const targetSource = readFileSync(path.join(__dirname, '../..', target), 'utf8');
    assert.match(targetSource, /<PortalOverlay/);
    assert.doesNotMatch(targetSource, /<Modal\b/);
  }
});

test('drawer data work is deferred until its entrance completes', () => {
  const homeSource = readFileSync(path.join(__dirname, '../../app/(tabs)/index.tsx'), 'utf8');
  const sidebarSource = readFileSync(
    path.join(__dirname, '../../components/reader/settings/SettingsSidebar.tsx'),
    'utf8'
  );
  const settingsSource = readFileSync(
    path.join(__dirname, '../../components/reader/settings/SettingsSidebarContent.tsx'),
    'utf8'
  );

  assert.match(homeSource, /onAfterOpen: \(\) => setIsMenuSettled\(true\)/);
  assert.match(homeSource, /enabled: isMenuSettled/);
  assert.match(sidebarSource, /onAfterOpen: \(\) => setIsDrawerSettled\(true\)/);
  assert.match(settingsSource, /enabled: dataEnabled &&/);
  assert.match(settingsSource, /initialNumToRender=\{2\}/);
});
