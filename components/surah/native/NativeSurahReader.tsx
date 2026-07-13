import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, requireNativeComponent, StyleSheet, Text, View } from 'react-native';

import { useNativeSurahReaderCommands } from './useNativeSurahReaderCommands';
import type { NativeSurahReaderHandle, NativeSurahReaderProps } from './NativeSurahReader.types';

export type {
  NativeSurahReaderActionPressEvent,
  NativeSurahReaderHandle,
  NativeSurahReaderInitialPositionedEvent,
  NativeSurahReaderProps,
  NativeSurahReaderScrollEvent,
  NativeSurahReaderSettings,
  NativeSurahReaderState,
  NativeSurahReaderSurahIntro,
  NativeSurahReaderTajweedGlyphRun,
  NativeSurahReaderTheme,
  NativeSurahReaderTranslationItem,
  NativeSurahReaderVerse,
  NativeSurahReaderWord,
  NativeSurahReaderVisibleVerseChangeEvent,
} from './NativeSurahReader.types';

const AndroidNativeSurahReader =
  Platform.OS === 'android'
    ? requireNativeComponent<NativeSurahReaderProps>('NativeSurahReader')
    : null;

export const NativeSurahReader = forwardRef<NativeSurahReaderHandle, NativeSurahReaderProps>(
  function NativeSurahReader(props, ref) {
    const nativeRef = useRef<View>(null);
    const commands = useNativeSurahReaderCommands(nativeRef);

    useImperativeHandle(ref, () => commands, [commands]);

    if (AndroidNativeSurahReader) {
      return <AndroidNativeSurahReader ref={nativeRef} {...props} />;
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
