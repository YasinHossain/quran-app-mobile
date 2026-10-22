import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, requireNativeComponent, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { useNativeSurahReaderCommands } from './useNativeSurahReaderCommands';
import type {
  NativeSurahReaderHandle,
  NativeSurahReaderProps,
  NativeSurahReaderState,
} from './NativeSurahReader.types';

export type {
  NativeSurahReaderActiveWord,
  NativeSurahReaderActionPressEvent,
  NativeSurahReaderHandle,
  NativeSurahReaderInitialPositionedEvent,
  NativeSurahReaderLoadErrorEvent,
  NativeSurahReaderProps,
  NativeSurahReaderScopeBanner,
  NativeSurahReaderScrollEvent,
  NativeSurahReaderSettings,
  NativeSurahReaderState,
  NativeSurahReaderSurahIntro,
  NativeSurahReaderTajweedGlyphRun,
  NativeSurahReaderTheme,
  NativeSurahReaderTranslationItem,
  NativeSurahReaderVerse,
  NativeSurahReaderVerseRange,
  NativeSurahReaderWord,
  NativeSurahReaderWordPressEvent,
  NativeSurahReaderVisibleVerseChangeEvent,
} from './NativeSurahReader.types';

type NativeReaderBridgeProps = Omit<NativeSurahReaderProps, 'readerState'> & {
  readerState?: Omit<
    NativeSurahReaderState,
    'topInsetPx' | 'bottomInsetPx' | 'activeVerseKey' | 'activeWord'
  > & { versesRevision?: string };
  topInsetPx?: number;
  bottomInsetPx?: number;
};

const AndroidNativeSurahReader =
  Platform.OS === 'android'
    ? requireNativeComponent<NativeReaderBridgeProps>('NativeSurahReader')
    : null;

// Scope revisions across reader mounts and module reloads. A revision identifies an immutable
// verse array, not its length or verse keys (translations/words/glyphs may change independently).
const verseRevisionSession = Date.now().toString(36);
let nextVerseRevision = 0;

const NativeSurahReaderComponent = forwardRef<NativeSurahReaderHandle, NativeSurahReaderProps>(
  function NativeSurahReader(props, ref) {
    const nativeRef = useRef<ViewInstance>(null);
    const commands = useNativeSurahReaderCommands(nativeRef);
    const state = props.readerState;
    const verses = state?.verses;
    const versesRevision = useMemo(
      () => `${verseRevisionSession}:${++nextVerseRevision}`,
      [verses]
    );
    // Header measurement and playback must not invalidate native data or resend a legacy payload.
    const readerState = useMemo(
      () =>
        state && {
          surahId: state.surahId,
          targetVerse: state.targetVerse,
          expectedVerseCount: state.expectedVerseCount,
          surahIntro: state.surahIntro,
          verseRange: state.verseRange,
          targetVerseKey: state.targetVerseKey,
          surahIntros: state.surahIntros,
          scopeBanner: state.scopeBanner,
          settings: state.settings,
          theme: state.theme,
          ...(state.verses ? { verses: state.verses, versesRevision } : {}),
        },
      [
        state?.surahId,
        state?.targetVerse,
        state?.expectedVerseCount,
        state?.surahIntro,
        state?.verseRange,
        state?.targetVerseKey,
        state?.surahIntros,
        state?.scopeBanner,
        verses,
        versesRevision,
        state?.settings,
        state?.theme,
      ]
    );

    useImperativeHandle(ref, () => commands, [commands]);

    if (AndroidNativeSurahReader) {
      return (
        <AndroidNativeSurahReader
          ref={nativeRef}
          {...props}
          readerState={readerState}
          topInsetPx={state?.topInsetPx}
          bottomInsetPx={state?.bottomInsetPx}
          activeVerseKey={
            props.activeVerseKey !== undefined ? props.activeVerseKey : state?.activeVerseKey
          }
          activeWord={props.activeWord !== undefined ? props.activeWord : state?.activeWord}
        />
      );
    }

    const { style } = props;

    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackTitle}>NativeSurahReader</Text>
        <Text style={styles.fallbackText}>Native reader proof is Android-only in Phase 2.</Text>
      </View>
    );
  }
);

// Opening an app-level overlay updates its owning screen. Keep the large native
// reader surface out of that render when its data and callbacks are unchanged.
export const NativeSurahReader = memo(NativeSurahReaderComponent);

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackText: {
    color: '#4b5563',
    fontSize: 14,
    textAlign: 'center',
  },
  fallbackTitle: {
    color: '#12534a',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
});
