const assert = require('node:assert/strict');
const { existsSync, readdirSync, readFileSync } = require('node:fs');
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
        Animated: {
          Value,
          spring(value, config) {
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
    exports,
    get current() { return result; }, animations,
    backdropStyle(isDark) { return exports.modalBackdropStyle(result.progress, isDark); },
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

test('modal backdrop uses a softer light theme and a gentle entrance curve', (t) => {
  const hook = mount(t, false);
  const light = hook.backdropStyle(false);
  const dark = hook.backdropStyle(true);

  assert.equal(light.backgroundColor, 'rgba(0,0,0,0.34)');
  assert.equal(dark.backgroundColor, 'rgba(0,0,0,0.46)');
  assert.deepEqual([...light.opacity.inputRange], [0, 0.5, 1]);
  assert.deepEqual([...light.opacity.outputRange], [0, 0.28, 1]);
});

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

// Integrate the native spring the way the Android driver does, against real elapsed time.
function simulateSpring(config, from, to) {
  const step = 0.0001;
  let x = from;
  let v = 0;
  let reached99At = null;
  for (let t = step; t < 2; t += step) {
    v += (config.stiffness * (to - x) - config.damping * v) / config.mass * step;
    x += v * step;
    const travelled = (x - from) / (to - from);
    if (reached99At === null && travelled >= 0.99) reached99At = t;
    if (config.overshootClamping && travelled >= 1) return { endMs: t * 1000, reached99Ms: reached99At * 1000, speedAtEnd: Math.abs(v) };
    if (Math.abs(to - x) <= config.restDisplacementThreshold && Math.abs(v) <= config.restSpeedThreshold) {
      return { endMs: t * 1000, reached99Ms: reached99At * 1000, speedAtEnd: Math.abs(v) };
    }
  }
  throw new Error('spring never settled');
}

for (const [preset, openDuration, closeDuration] of [
  ['dialog', 200, 140],
  ['sheet', 240, 160],
  ['drawer', 240, 160],
  ['popover', 140, 100],
]) {
  test(`${preset} springs track its shared entrance and exit durations`, (t) => {
    const hook = mount(t, true, { preset });
    hook.show();
    const entrance = hook.animations.at(-1).config;
    assert.equal(entrance.useNativeDriver, true);
    const open = simulateSpring(entrance, 0, 1);
    // Visually complete at the preset duration, then a short settle with no overshoot.
    assert.ok(Math.abs(open.reached99Ms - openDuration) <= openDuration * 0.05, `${preset} open 99% at ${open.reached99Ms}ms`);
    assert.ok(open.endMs <= openDuration * 1.3);
    hook.finish();

    hook.update(false);
    const exit = hook.animations.at(-1).config;
    const close = simulateSpring(exit, 1, 0);
    // Exits end at the preset duration while still moving, like an accelerate curve.
    assert.ok(Math.abs(close.endMs - closeDuration) <= closeDuration * 0.03, `${preset} close ends at ${close.endMs}ms`);
    assert.ok(close.speedAtEnd > 1000 / closeDuration);
    hook.finish();
    assert.equal(hook.current.visible, false);
  });
}

test('bottom tabs keep the outgoing tab moving when the tab view re-renders mid-switch', () => {
  // Applied by scripts/postinstall.js; fails loudly if an expo-router update stops it matching.
  const tabView = readFileSync(
    path.join(__dirname, '../../node_modules/expo-router/build/react-navigation/bottom-tabs/views/BottomTabView.js'),
    'utf8'
  );
  assert.match(
    tabView,
    /const previousRouteKey = previousRouteKeyRef\.current;\n\s*\/\/ quran-app: animate tabs only on focus change\n\s*if \(previousRouteKey === focusedRouteKey\) return;/
  );
});

test('modal motion avoids 60 fps sampled native timing animations', () => {
  const motionSource = readFileSync(path.join(__dirname, '../../components/motion/modalTransition.ts'), 'utf8');
  assert.doesNotMatch(motionSource, /Animated\.timing/);
});

test('frequent drawers and action sheets stay in the app window portal', () => {
  const read = (target) => readFileSync(path.join(__dirname, '../..', target), 'utf8');
  for (const target of [
    'app/(tabs)/index.tsx',
    'components/reader/settings/SettingsSidebar.tsx',
    'components/motion/BottomSheet.tsx',
  ]) {
    assert.match(read(target), /<PortalOverlay/);
  }

  for (const target of [
    'components/bookmarks/FolderActionsSheet.tsx',
    'components/surah/VerseActionsSheet.tsx',
    'components/word-study/WordQuickSheet.tsx',
    'components/word-study/full-study/DictionaryGuideSheet.tsx',
    'components/word-study/full-study/GrammarGuideSheet.tsx',
    'components/word-study/full-study/MorphologyGuideSheet.tsx',
    'components/word-study/full-study/OccurrenceGuideSheet.tsx',
  ]) {
    const targetSource = read(target);
    assert.match(targetSource, /<BottomSheet/);
    assert.doesNotMatch(targetSource, /<Modal\b/);
  }
});

test('re-rendering a transitioning surface reuses its animated style nodes', (t) => {
  const hook = mount(t, false);
  const { progress } = hook.current;
  const motion = hook.exports;

  // A new interpolation per render would make the native driver re-attach mid-slide.
  assert.equal(motion.verticalSheetTransform(progress, 420), motion.verticalSheetTransform(progress, 420));
  assert.notEqual(motion.verticalSheetTransform(progress, 420), motion.verticalSheetTransform(progress, 480));
  assert.equal(motion.sideSheetTransform(progress, -320), motion.sideSheetTransform(progress, -320));
  assert.equal(motion.dialogTransform(progress), motion.dialogTransform(progress));
  assert.equal(motion.horizontalSlideSceneStyle(progress, 400), motion.horizontalSlideSceneStyle(progress, 400));
  assert.equal(hook.backdropStyle(true), hook.backdropStyle(true));
  assert.notEqual(hook.backdropStyle(true), hook.backdropStyle(false));
  assert.deepEqual(
    [...motion.verticalSheetTransform(progress, 420).transform[0].translateY.outputRange],
    [420, 0]
  );
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

test('warmed resource panels slide in their own layers while other panels wait for commit', () => {
  const settingsSource = readFileSync(
    path.join(__dirname, '../../components/reader/settings/SettingsSidebarContent.tsx'),
    'utf8'
  );
  const openPanelSource = settingsSource.slice(
    settingsSource.indexOf('const openPanel = React.useCallback'),
    settingsSource.indexOf('const closePanel = React.useCallback')
  );

  // The layer is chosen natively before setPanel, so a warm list never waits on a commit.
  assert.match(
    openPanelSource,
    /selectLayer\(nextPanel\);\s*setPanel\(\{ type: nextPanel \}\);[\s\S]*Animated\.spring\(navProgress/
  );
  assert.match(
    openPanelSource,
    /if \(getSubPanelLayer\(nextPanel\) !== 'other'\) \{[\s\S]*startAnimation\(\);[\s\S]*return;/
  );
  // Both resource lists stay warm offscreen in their own layers, headers included, so
  // opening one swaps no title or list. Hiding one with opacity left its rows undrawn.
  assert.match(settingsSource, /const shouldWarmResourceLists = dataEnabled && !hideRootWhenSubPanel;/);
  assert.match(
    settingsSource,
    /const isTafsirLayerMounted =\s*subPanelLayer === 'tafsir' \|\| \(shouldWarmResourceLists && showTafsirSetting\)/
  );
  assert.match(settingsSource, /title=\{t\('tafsir_panel_title'\)\} onBack=\{goBack\}/);
  assert.doesNotMatch(settingsSource, /opacity: 0,/);
  assert.match(settingsSource, /Animated\.multiply\(navProgress, layerSelection\[layer\]\)/);
  assert.match(openPanelSource, /requestAnimationFrame\(\(\) => \{[\s\S]*startAnimation\(\)/);
});

test('direct tafsir manager open keeps unrelated settings work off the entrance path', () => {
  const sidebarSource = readFileSync(
    path.join(__dirname, '../../components/reader/settings/SettingsSidebar.tsx'),
    'utf8'
  );
  const settingsSource = readFileSync(
    path.join(__dirname, '../../components/reader/settings/SettingsSidebarContent.tsx'),
    'utf8'
  );

  assert.doesNotMatch(sidebarSource, /renderToHardwareTextureAndroid/);
  assert.match(
    settingsSource,
    /const \[isRootContentMounted, setIsRootContentMounted\] = React\.useState\(/
  );
  assert.match(
    settingsSource,
    /!isSubPanel \|\| \(!hideRootWhenSubPanel && isRootContentMounted\)/
  );
  assert.match(
    settingsSource,
    /panel\.type === 'translations' \|\|[\s\S]*panel\.type === 'root' && activeTab === 'translations'/
  );
  assert.match(
    settingsSource,
    /enabled: dataEnabled && \(panel\.type === 'root' \|\| panel\.type === 'mushaf'\)/
  );
  assert.match(settingsSource, /isActive=\{dataEnabled && subPanelLayer === 'tafsir'\}/);
});

const NavigationContext = React.createContext(undefined);

function createNavigationStub() {
  const transitionEndListeners = new Set();
  return {
    addListener(type, callback) {
      assert.equal(type, 'transitionEnd');
      transitionEndListeners.add(callback);
      return () => transitionEndListeners.delete(callback);
    },
    emitTransitionEnd() { act(() => [...transitionEndListeners].forEach((callback) => callback())); },
  };
}

function mountPortalOverlay(t, initialProps, { navigation } = {}) {
  const portalSource = ts.transpileModule(
    readFileSync(path.join(__dirname, '../../components/motion/PortalOverlay.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.React } }
  ).outputText;
  const hookSource = ts.transpileModule(
    readFileSync(path.join(__dirname, '../../components/navigation/useScreenTransitionSettled.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
  ).outputText;
  const idleCallbacks = new Map();
  const timers = new Map();
  let nextIdle = 0;
  let nextTimer = 0;
  const timerGlobals = {
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
  };
  const hookExports = {};
  vm.runInNewContext(hookSource, {
    exports: hookExports,
    require(name) {
      if (name === 'react') return React;
      if (name === 'expo-router/react-navigation') return { NavigationContext };
      throw new Error(`Unexpected module: ${name}`);
    },
    ...timerGlobals,
  });
  const exports = {};
  vm.runInNewContext(portalSource, {
    exports,
    require(name) {
      if (name === 'react') return React;
      if (name === '@/components/navigation/useScreenTransitionSettled') return hookExports;
      if (name === 'react-native') return {
        BackHandler: { addEventListener: () => ({ remove() {} }) },
        Platform: { OS: 'android' },
        StyleSheet: { create: (styles) => styles },
        View: (props) => React.createElement('View', props, props.children),
      };
      if (name === '@/providers/OverlayPortalContext') return {
        OverlayPortal: ({ children, modal }) => React.createElement('Portal', { modal }, children),
      };
      throw new Error(`Unexpected module: ${name}`);
    },
    requestIdleCallback(callback) { idleCallbacks.set(++nextIdle, callback); return nextIdle; },
    cancelIdleCallback(id) { idleCallbacks.delete(id); },
  });
  let root;
  const element = (props) => React.createElement(
    NavigationContext.Provider,
    { value: navigation },
    React.createElement(
      exports.PortalOverlay,
      { onRequestClose() {}, ...props },
      React.createElement('Content')
    )
  );
  act(() => { root = create(element(initialProps)); });
  t.after(() => act(() => root.unmount()));
  return {
    update(props) { act(() => root.update(element(props))); },
    pendingIdleCount() { return idleCallbacks.size; },
    runTimers() { act(() => {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    }); },
    runIdle() { act(() => {
      const callbacks = [...idleCallbacks.values()];
      idleCallbacks.clear();
      callbacks.forEach((callback) => callback());
    }); },
    layout() { act(() => root.root.findByType('View').props.onLayout()); },
    overlay() { return root.root.findAllByType('View')[0] ?? null; },
    portal() { return root.root.findAllByType('Portal')[0] ?? null; },
  };
}

test('kept-mounted overlays stay inert while closed and announce every reopen', (t) => {
  let shown = 0;
  const onShow = () => shown++;
  const overlay = mountPortalOverlay(t, { keepMounted: true, visible: false, onShow });

  assert.equal(overlay.overlay(), null);
  overlay.runTimers();
  overlay.runIdle();
  overlay.layout();
  assert.equal(shown, 0);
  assert.equal(overlay.overlay().props.pointerEvents, 'none');
  assert.equal(overlay.overlay().props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(overlay.portal().props.modal, false);

  for (const expectedShows of [1, 2]) {
    overlay.update({ keepMounted: true, visible: true, onShow });
    assert.equal(shown, expectedShows);
    assert.equal(overlay.overlay().props.pointerEvents, 'auto');
    assert.equal(overlay.portal().props.modal, true);
    overlay.update({ keepMounted: true, visible: false, onShow });
    assert.equal(overlay.overlay().props.pointerEvents, 'none');
  }
});

test('kept-mounted overlays warm only after the host screen transition ends', (t) => {
  // The JS thread idles while a native stack push slides; warming then mounted hidden sheets on
  // the UI thread mid-transition and dropped frames on slower phones.
  const navigation = createNavigationStub();
  const overlay = mountPortalOverlay(t, { keepMounted: true, visible: false }, { navigation });

  assert.equal(overlay.pendingIdleCount(), 0);
  overlay.runIdle();
  assert.equal(overlay.overlay(), null);

  navigation.emitTransitionEnd();
  assert.equal(overlay.pendingIdleCount(), 1);
  overlay.runIdle();
  assert.equal(overlay.overlay().props.pointerEvents, 'none');
});

test('regular overlays unmount when closed and wait for layout before announcing', (t) => {
  let shown = 0;
  const onShow = () => shown++;
  const overlay = mountPortalOverlay(t, { visible: true, onShow });

  assert.equal(shown, 0);
  overlay.layout();
  assert.equal(shown, 1);
  overlay.update({ visible: false, onShow });
  assert.equal(overlay.overlay(), null);
});

function mountOverlayPortalHost(t) {
  const providerSource = ts.transpileModule(
    readFileSync(path.join(__dirname, '../../providers/OverlayPortalContext.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.React } }
  ).outputText;
  const exports = {};
  vm.runInNewContext(providerSource, {
    exports,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react-native') return {
        StyleSheet: { create: (styles) => styles },
        View: (props) => React.createElement('View', props, props.children),
      };
      throw new Error(`Unexpected module: ${name}`);
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
  });
  let root;
  const element = (portalProps) => React.createElement(
    exports.OverlayPortalProvider,
    null,
    React.createElement(exports.OverlayPortal, portalProps)
  );
  return {
    render(portalProps) {
      act(() => {
        if (root) root.update(element(portalProps));
        else root = create(element(portalProps));
      });
      if (!t.__portalCleanup) {
        t.__portalCleanup = true;
        t.after(() => act(() => root.unmount()));
      }
    },
    labels() { return root.root.findAllByType('Label').map((node) => node.props.text); },
    appContent() {
      return root.root.find((node) => node.type === 'View' && 'renderToHardwareTextureAndroid' in node.props).props;
    },
  };
}

test('the app behind an overlay keeps one native parent across open and close', (t) => {
  const host = mountOverlayPortalHost(t);
  const label = (text) => React.createElement('Label', { text });

  // Closed, the wrapper is layout-only. If Fabric could flatten it, every open and close
  // would re-parent the whole app and re-record all reader text in one frame.
  host.render({ children: label('closed'), frozen: true });
  assert.equal(host.appContent().renderToHardwareTextureAndroid, false);
  assert.equal(host.appContent().collapsable, false);

  host.render({ children: label('open'), modal: true });
  assert.equal(host.appContent().renderToHardwareTextureAndroid, true);
  assert.equal(host.appContent().collapsable, false);
});

test('hidden kept-mounted portals ignore owner re-renders until revealed', (t) => {
  const host = mountOverlayPortalHost(t);
  const label = (text) => React.createElement('Label', { text });

  host.render({ children: label('open'), modal: true });
  host.render({ children: label('hidden'), frozen: true });
  assert.deepEqual(host.labels(), ['hidden']);

  host.render({ children: label('stale while hidden'), frozen: true });
  assert.deepEqual(host.labels(), ['hidden']);

  host.render({ children: label('reopened'), modal: true });
  assert.deepEqual(host.labels(), ['reopened']);
});

test('reader push overrides still shadow react-native-screens animation resources', () => {
  // App resources only replace library resources with the same name; a rename upstream would
  // silently restore the 200 ms accelerate_decelerate push.
  const overrideDir = path.join(__dirname, '../../plugins/reader-push-transition/android/src/main/res/anim');
  const libraryDir = path.join(__dirname, '../../node_modules/react-native-screens/android/src/main/res/base/anim');
  const overrides = readdirSync(overrideDir);
  assert.deepEqual(overrides.sort(), [
    'rns_ios_from_right_background_open.xml',
    'rns_ios_from_right_foreground_open.xml',
  ]);
  for (const name of overrides) {
    assert.ok(existsSync(path.join(libraryDir, name)), `${name} missing upstream`);
    // A <set> is started as-is; a bare <translate> is wrapped and loses its interpolator.
    assert.match(readFileSync(path.join(overrideDir, name), 'utf8'), /<set[\s\S]*@interpolator\/reader_push_spring/);
  }
});
