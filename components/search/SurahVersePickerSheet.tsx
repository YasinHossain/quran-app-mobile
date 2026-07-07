import { Search as SearchIcon, X } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useModalTransition, verticalSheetTransform } from '@/components/motion/modalTransition';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Chapter } from '@/types';

type Props = {
  isOpen: boolean;
  presentation?: 'modal' | 'inline';
  title?: string;
  chapters: Chapter[];
  isLoading?: boolean;
  hideVerse?: boolean;
  selectedSurah: number | undefined;
  selectedVerse: number | undefined;
  surahLabel?: string;
  verseLabel?: string;
  initialFocus?: 'surah' | 'verse';
  onClose: () => void;
  onApply: (selection: { surahId: number; verseNumber?: number }) => void;
};

type SurahRow = {
  id: number;
  name: string;
  versesCount: number;
  searchLabel: string;
};

const WHEEL_SLOT_HEIGHT = 64;
const WHEEL_ITEM_HEIGHT = 46;
const WHEEL_VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = WHEEL_SLOT_HEIGHT * WHEEL_VISIBLE_ROWS;
const WHEEL_VERTICAL_PADDING = (WHEEL_HEIGHT - WHEEL_SLOT_HEIGHT) / 2;
const SELECTION_BAND_TOP = (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;
const MIN_SHEET_HEIGHT = 430;

function buildVerseRows(versesCount: number | undefined): number[] {
  if (!versesCount || versesCount <= 0) return [];
  return Array.from({ length: versesCount }, (_, index) => index + 1);
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function getWheelIndexFromOffset(offsetY: number, length: number): number {
  return clampIndex(Math.round(offsetY / WHEEL_SLOT_HEIGHT), length);
}

export function SurahVersePickerSheet({
  isOpen,
  presentation = 'modal',
  title,
  chapters,
  isLoading = false,
  hideVerse = false,
  selectedSurah,
  selectedVerse,
  surahLabel = 'Surah',
  verseLabel = 'Verse',
  initialFocus = 'surah',
  onClose,
  onApply,
}: Props): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();

  const [draftSurah, setDraftSurah] = React.useState<number | undefined>(selectedSurah);
  const [draftVerse, setDraftVerse] = React.useState<number | undefined>(selectedVerse);
  const [surahQuery, setSurahQuery] = React.useState('');
  const [verseQuery, setVerseQuery] = React.useState('');
  const surahListRef = React.useRef<FlatList<SurahRow>>(null);
  const verseListRef = React.useRef<FlatList<number>>(null);
  const surahInputRef = React.useRef<TextInput | null>(null);
  const verseInputRef = React.useRef<TextInput | null>(null);
  const centeredSurahRef = React.useRef<number | undefined>(selectedSurah);
  const centeredVerseRef = React.useRef<number | undefined>(selectedVerse);

  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen, {
    openDuration: 230,
    closeDuration: 160,
  });

  React.useEffect(() => {
    if (presentation === 'inline' && isOpen) {
      onModalShow();
    }
  }, [isOpen, onModalShow, presentation]);

  React.useEffect(() => {
    if (!isOpen) return;
    setDraftSurah(selectedSurah);
    setDraftVerse(selectedVerse);
    centeredSurahRef.current = selectedSurah;
    centeredVerseRef.current = selectedVerse;
    setSurahQuery('');
    setVerseQuery('');
  }, [isOpen, selectedSurah, selectedVerse]);

  React.useEffect(() => {
    if (!visible) return;
    const timeoutId = setTimeout(() => {
      if (initialFocus === 'verse' && !hideVerse && selectedSurah) {
        verseInputRef.current?.focus();
        return;
      }
      surahInputRef.current?.focus();
    }, 260);
    return () => clearTimeout(timeoutId);
  }, [hideVerse, initialFocus, selectedSurah, visible]);

  const surahRows = React.useMemo<SurahRow[]>(
    () =>
      chapters.map((chapter) => ({
        id: chapter.id,
        name: chapter.name_simple,
        versesCount: chapter.verses_count,
        searchLabel: `${chapter.id} ${chapter.name_simple}`.toLowerCase(),
      })),
    [chapters]
  );

  const filteredSurahs = React.useMemo(() => {
    const query = surahQuery.trim().toLowerCase();
    if (!query) return surahRows;
    return surahRows.filter(
      (chapter) => String(chapter.id).startsWith(query) || chapter.searchLabel.includes(query)
    );
  }, [surahQuery, surahRows]);

  const activeSurah = React.useMemo(
    () => surahRows.find((chapter) => chapter.id === draftSurah),
    [draftSurah, surahRows]
  );

  const verseRows = React.useMemo(() => buildVerseRows(activeSurah?.versesCount), [activeSurah?.versesCount]);

  const filteredVerses = React.useMemo(() => {
    const query = verseQuery.trim();
    if (!query) return verseRows;
    return verseRows.filter((verse) => String(verse).startsWith(query));
  }, [verseQuery, verseRows]);

  React.useEffect(() => {
    if (!visible || filteredSurahs.length === 0 || !draftSurah) return;
    const index = filteredSurahs.findIndex((chapter) => chapter.id === draftSurah);
    if (index < 0) return;
    const timeoutId = setTimeout(() => {
      surahListRef.current?.scrollToOffset({
        offset: WHEEL_SLOT_HEIGHT * clampIndex(index, filteredSurahs.length),
        animated: false,
      });
    }, 80);
    return () => clearTimeout(timeoutId);
  }, [filteredSurahs, visible]);

  React.useEffect(() => {
    if (!visible || hideVerse || filteredVerses.length === 0 || !draftVerse) return;
    const index = filteredVerses.findIndex((verse) => verse === draftVerse);
    if (index < 0) return;
    const timeoutId = setTimeout(() => {
      verseListRef.current?.scrollToOffset({
        offset: WHEEL_SLOT_HEIGHT * clampIndex(index, filteredVerses.length),
        animated: false,
      });
    }, 80);
    return () => clearTimeout(timeoutId);
  }, [filteredVerses, hideVerse, visible]);

  const isInline = presentation === 'inline';
  const canApply = typeof draftSurah === 'number' && (hideVerse || typeof draftVerse === 'number');
  const modalMaxHeight = Math.max(MIN_SHEET_HEIGHT, Math.round(windowHeight * 0.86));
  const inlineMaxHeight = Math.max(470, Math.min(540, Math.round(windowHeight * 0.62)));
  const sheetMaxHeight = isInline ? inlineMaxHeight : modalMaxHeight;
  const sheetMinHeight = isInline
    ? sheetMaxHeight
    : Math.min(sheetMaxHeight, Math.max(MIN_SHEET_HEIGHT, Math.round(windowHeight * 0.62)));
  const fieldBackgroundColor = isDark ? '#334155' : '#F3F4F6';
  const resolvedTitle = title ?? (hideVerse ? `Select ${surahLabel}` : 'Jump To Ayah');

  const closeSheet = React.useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    closeSheet();
  }, [closeSheet, dismissEnabledRef]);

  const applySelection = React.useCallback(() => {
    if (!canApply || typeof draftSurah !== 'number') return;
    Keyboard.dismiss();
    onApply({ surahId: draftSurah, verseNumber: hideVerse ? undefined : draftVerse });
    onClose();
  }, [canApply, draftSurah, draftVerse, hideVerse, onApply, onClose]);

  const selectSurah = React.useCallback(
    (surahId: number) => {
      const chapter = surahRows.find((row) => row.id === surahId);
      centeredSurahRef.current = surahId;
      setDraftSurah(surahId);
      setDraftVerse((current) => {
        if (hideVerse) return undefined;
        if (!chapter) return undefined;
        const nextVerse = typeof current !== 'number' ? 1 : Math.min(current, chapter.versesCount);
        centeredVerseRef.current = nextVerse;
        return nextVerse;
      });
    },
    [hideVerse, surahRows]
  );

  React.useEffect(() => {
    if (!visible || draftSurah || filteredSurahs.length === 0) return;
    selectSurah(filteredSurahs[0].id);
  }, [draftSurah, filteredSurahs, selectSurah, visible]);

  const scrollSurahToIndex = React.useCallback(
    (index: number, animated: boolean) => {
      surahListRef.current?.scrollToOffset({
        offset: WHEEL_SLOT_HEIGHT * clampIndex(index, filteredSurahs.length),
        animated,
      });
    },
    [filteredSurahs.length]
  );

  const scrollVerseToIndex = React.useCallback(
    (index: number, animated: boolean) => {
      verseListRef.current?.scrollToOffset({
        offset: WHEEL_SLOT_HEIGHT * clampIndex(index, filteredVerses.length),
        animated,
      });
    },
    [filteredVerses.length]
  );

  const handleSurahScrollEnd = React.useCallback(
    (offsetY: number) => {
      const index = getWheelIndexFromOffset(offsetY, filteredSurahs.length);
      scrollSurahToIndex(index, true);
      const next = filteredSurahs[index];
      if (next) selectSurah(next.id);
    },
    [filteredSurahs, scrollSurahToIndex, selectSurah]
  );

  const handleVerseScrollEnd = React.useCallback(
    (offsetY: number) => {
      const index = getWheelIndexFromOffset(offsetY, filteredVerses.length);
      scrollVerseToIndex(index, true);
      const next = filteredVerses[index];
      if (typeof next === 'number') {
        centeredVerseRef.current = next;
        setDraftVerse(next);
      }
    },
    [filteredVerses, scrollVerseToIndex]
  );

  const renderSurah = React.useCallback(
    ({ item }: { item: SurahRow }) => {
      const selected = item.id === draftSurah;
      return (
        <Pressable
          onPress={() => {
            selectSurah(item.id);
            const index = filteredSurahs.findIndex((chapter) => chapter.id === item.id);
            if (index >= 0) scrollSurahToIndex(index, true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${item.id}. ${item.name}`}
          style={({ pressed }) => [
            styles.row,
            styles.wheelRow,
            {
              backgroundColor: selected
                ? 'transparent'
                : pressed
                  ? isDark
                    ? 'rgba(148,163,184,0.12)'
                    : 'rgba(15,23,42,0.05)'
                  : 'transparent',
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.rowText,
              {
                color: selected ? palette.tint : palette.text,
                fontWeight: selected ? '700' : '500',
                opacity: selected ? 1 : 0.45,
              },
            ]}
          >
            {item.id}. {item.name}
          </Text>
        </Pressable>
      );
    },
    [draftSurah, filteredSurahs, isDark, palette.text, palette.tint, scrollSurahToIndex, selectSurah]
  );

  const renderVerse = React.useCallback(
    ({ item }: { item: number }) => {
      const selected = item === draftVerse;
      return (
        <Pressable
          onPress={() => {
            setDraftVerse(item);
            centeredVerseRef.current = item;
            const index = filteredVerses.findIndex((verse) => verse === item);
            if (index >= 0) scrollVerseToIndex(index, true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${verseLabel} ${item}`}
          style={({ pressed }) => [
            styles.row,
            styles.verseRow,
            styles.wheelRow,
            {
              backgroundColor: selected
                ? 'transparent'
                : pressed
                  ? isDark
                    ? 'rgba(148,163,184,0.12)'
                    : 'rgba(15,23,42,0.05)'
                  : 'transparent',
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.rowText,
              styles.verseRowText,
              {
                color: selected ? palette.tint : palette.text,
                fontWeight: selected ? '700' : '500',
                opacity: selected ? 1 : 0.45,
              },
            ]}
          >
            {item}
          </Text>
        </Pressable>
      );
    },
    [draftVerse, filteredVerses, isDark, palette.text, palette.tint, scrollVerseToIndex, verseLabel]
  );

  const sheet = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      pointerEvents="box-none"
      style={styles.keyboardAvoider}
    >
      <Animated.View
        style={[
          styles.sheet,
          isInline ? styles.inlineSheet : null,
          { maxHeight: sheetMaxHeight, minHeight: sheetMinHeight },
          verticalSheetTransform(progress, 36),
        ]}
        className="bg-surface dark:bg-background-dark border border-border/30 dark:border-border-dark/20"
      >
        <SafeAreaView edges={isInline ? [] : ['bottom']} style={styles.safeArea}>
          <View
            className="border-b border-border/50 dark:border-border-dark/40"
            style={isInline ? styles.inlineHeader : styles.header}
          >
            {!isInline ? (
              <View className="flex-row items-center gap-3">
                <Text
                  numberOfLines={1}
                  className="flex-1 text-lg font-bold text-foreground dark:text-foreground-dark"
                >
                  {resolvedTitle}
                </Text>
                <Pressable
                  onPress={closeSheet}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  className="h-9 w-9 items-center justify-center rounded-full bg-interactive dark:bg-interactive-dark"
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <X size={17} strokeWidth={2.4} color={palette.muted} />
                </Pressable>
              </View>
            ) : null}

            {isInline ? (
              <View style={hideVerse ? styles.inlineInputRowSingle : styles.inlineInputRow}>
                <View style={{ flex: hideVerse ? undefined : 3 }}>
                  <View
                    style={[styles.inlineInputBox, { backgroundColor: fieldBackgroundColor, borderColor: palette.border }]}
                  >
                    <SearchIcon size={17} strokeWidth={2.25} color={palette.tint} />
                    <TextInput
                      ref={surahInputRef}
                      value={surahQuery}
                      onChangeText={setSurahQuery}
                      placeholder={isLoading ? 'Loading surahs...' : 'Search Surah'}
                      placeholderTextColor={palette.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                      className="flex-1 text-sm text-foreground dark:text-foreground-dark"
                    />
                  </View>
                </View>

                {!hideVerse ? (
                  <View style={{ flex: 2 }}>
                    <View
                      style={[styles.inlineInputBox, { backgroundColor: fieldBackgroundColor, borderColor: palette.border }]}
                    >
                      <SearchIcon size={17} strokeWidth={2.25} color={palette.tint} />
                      <TextInput
                        ref={verseInputRef}
                        value={verseQuery}
                        onChangeText={(text) => setVerseQuery(text.replace(/[^\d]/g, ''))}
                        placeholder={activeSurah ? verseLabel : 'Ayah'}
                        placeholderTextColor={palette.muted}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        onSubmitEditing={applySelection}
                        className="flex-1 text-sm text-foreground dark:text-foreground-dark"
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className={hideVerse ? 'mt-4' : 'mt-4 flex-row gap-3'}>
                <View style={{ flex: hideVerse ? undefined : 3 }}>
                  <Text className="mb-2 text-xs font-semibold text-muted dark:text-muted-dark">
                    {surahLabel}
                  </Text>
                  <View
                    style={[styles.inputBox, { backgroundColor: fieldBackgroundColor, borderColor: palette.border }]}
                  >
                    <SearchIcon size={17} strokeWidth={2.25} color={palette.tint} />
                    <TextInput
                      ref={surahInputRef}
                      value={surahQuery}
                      onChangeText={setSurahQuery}
                      placeholder={isLoading ? 'Loading surahs...' : 'Search Surah'}
                      placeholderTextColor={palette.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                      className="flex-1 text-sm text-foreground dark:text-foreground-dark"
                    />
                  </View>
                </View>

                {!hideVerse ? (
                  <View style={{ flex: 2 }}>
                    <Text className="mb-2 text-xs font-semibold text-muted dark:text-muted-dark">
                      {verseLabel}
                    </Text>
                    <View
                      style={[styles.inputBox, { backgroundColor: fieldBackgroundColor, borderColor: palette.border }]}
                    >
                      <SearchIcon size={17} strokeWidth={2.25} color={palette.tint} />
                      <TextInput
                        ref={verseInputRef}
                        value={verseQuery}
                        onChangeText={(text) => setVerseQuery(text.replace(/[^\d]/g, ''))}
                        placeholder={activeSurah ? verseLabel : 'Ayah'}
                        placeholderTextColor={palette.muted}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        onSubmitEditing={applySelection}
                        className="flex-1 text-sm text-foreground dark:text-foreground-dark"
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <View style={[styles.listArea, isInline ? styles.inlineListArea : null]}>
            <View style={[styles.listColumn, hideVerse ? styles.fullColumn : styles.surahColumn]}>
              <View style={styles.wheelFrame}>
                {filteredSurahs.length > 0 ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.selectionBand,
                      {
                        backgroundColor: isDark ? 'rgba(15,23,42,0.54)' : 'rgba(248,250,252,0.92)',
                      },
                    ]}
                  />
                ) : null}
                <FlatList
                  ref={surahListRef}
                  data={filteredSurahs}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderSurah}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="none"
                  showsVerticalScrollIndicator={false}
                  snapToInterval={WHEEL_SLOT_HEIGHT}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  disableIntervalMomentum
                  getItemLayout={(_, index) => ({
                    length: WHEEL_SLOT_HEIGHT,
                    offset: WHEEL_SLOT_HEIGHT * index,
                    index,
                  })}
                  onMomentumScrollEnd={(event) => handleSurahScrollEnd(event.nativeEvent.contentOffset.y)}
                  onScrollEndDrag={(event) => handleSurahScrollEnd(event.nativeEvent.contentOffset.y)}
                  onScrollToIndexFailed={({ index }) => {
                    requestAnimationFrame(() => {
                      surahListRef.current?.scrollToOffset({
                        offset: WHEEL_SLOT_HEIGHT * clampIndex(index, filteredSurahs.length),
                        animated: false,
                      });
                    });
                  }}
                  contentContainerStyle={styles.wheelContent}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Text style={{ color: palette.muted, textAlign: 'center' }}>
                        {isLoading ? 'Loading surahs...' : 'No surahs found'}
                      </Text>
                    </View>
                  }
                />
              </View>
            </View>

            {!hideVerse ? (
              <View style={[styles.listColumn, styles.verseColumn]}>
                <View style={styles.wheelFrame}>
                  {filteredVerses.length > 0 ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.selectionBand,
                        {
                          backgroundColor: isDark ? 'rgba(15,23,42,0.54)' : 'rgba(248,250,252,0.92)',
                        },
                      ]}
                    />
                  ) : null}
                  <FlatList
                    ref={verseListRef}
                    data={filteredVerses}
                    keyExtractor={(item) => String(item)}
                    renderItem={renderVerse}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="none"
                    showsVerticalScrollIndicator={false}
                    snapToInterval={WHEEL_SLOT_HEIGHT}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    disableIntervalMomentum
                    getItemLayout={(_, index) => ({
                      length: WHEEL_SLOT_HEIGHT,
                      offset: WHEEL_SLOT_HEIGHT * index,
                      index,
                    })}
                    onMomentumScrollEnd={(event) => handleVerseScrollEnd(event.nativeEvent.contentOffset.y)}
                    onScrollEndDrag={(event) => handleVerseScrollEnd(event.nativeEvent.contentOffset.y)}
                    onScrollToIndexFailed={({ index }) => {
                      requestAnimationFrame(() => {
                        verseListRef.current?.scrollToOffset({
                          offset: WHEEL_SLOT_HEIGHT * clampIndex(index, filteredVerses.length),
                          animated: false,
                        });
                      });
                    }}
                    contentContainerStyle={styles.wheelContent}
                    ListEmptyComponent={
                      <View style={styles.emptyState}>
                        <Text style={{ color: palette.muted, textAlign: 'center' }}>
                          {activeSurah ? 'No ayahs found' : 'Choose a surah first'}
                        </Text>
                      </View>
                    }
                  />
                </View>
              </View>
            ) : null}
          </View>

          <View
            className="flex-row gap-3 border-t border-border/60 dark:border-border-dark/40"
            style={isInline ? styles.inlineFooter : styles.footer}
          >
            <Pressable
              onPress={closeSheet}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className={`${isInline ? 'h-10' : 'h-12'} flex-1 items-center justify-center rounded-lg bg-interactive dark:bg-interactive-dark`}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={applySelection}
              disabled={!canApply}
              accessibilityRole="button"
              accessibilityLabel={hideVerse ? `Select ${surahLabel}` : 'Jump To Ayah'}
              className={`${isInline ? 'h-10' : 'h-12'} flex-1 items-center justify-center rounded-lg bg-accent`}
              style={({ pressed }) => ({ opacity: !canApply ? 0.45 : pressed ? 0.9 : 1 })}
            >
              <Text className="text-sm font-bold text-on-accent">
                {hideVerse ? 'Select' : 'Jump To Ayah'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>
    </KeyboardAvoidingView>
  );

  if (!visible) return <></>;

  if (presentation === 'inline') {
    return (
      <View className={isDark ? 'dark' : ''} style={styles.inlineRoot} pointerEvents="box-none">
        {sheet}
      </View>
    );
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onShow={onModalShow}
      onRequestClose={closeSheet}
      statusBarTranslucent
      hardwareAccelerated
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
      <View className={isDark ? 'dark' : ''} style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: progress }]} />
        </Pressable>

        {sheet}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  inlineRoot: {
    width: '100%',
    marginTop: 6,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  keyboardAvoider: {
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  inlineSheet: {
    borderRadius: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  inlineHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  inlineInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineInputRowSingle: {
  },
  inlineInputBox: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputBox: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listArea: {
    minHeight: WHEEL_HEIGHT + 16,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  inlineListArea: {
    minHeight: WHEEL_HEIGHT + 12,
    paddingVertical: 6,
  },
  listColumn: {
    minWidth: 0,
    overflow: 'hidden',
  },
  fullColumn: {
    flex: 1,
  },
  surahColumn: {
    flex: 3,
  },
  verseColumn: {
    flex: 2,
  },
  wheelFrame: {
    height: WHEEL_HEIGHT,
    overflow: 'hidden',
  },
  selectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SELECTION_BAND_TOP,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 8,
  },
  wheelContent: {
    paddingTop: WHEEL_VERTICAL_PADDING,
    paddingBottom: WHEEL_VERTICAL_PADDING,
  },
  row: {
    height: WHEEL_SLOT_HEIGHT,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wheelRow: {
    justifyContent: 'flex-start',
  },
  verseRow: {
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
  },
  verseRowText: {
    flex: 0,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inlineFooter: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyState: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
