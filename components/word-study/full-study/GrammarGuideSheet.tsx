import { BookOpen, Info, X } from 'lucide-react-native';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { BottomSheet } from '@/components/motion/BottomSheet';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { WORD_GRAMMAR_PACK_METADATA } from '@/src/core/infrastructure/word-grammar';

export function GrammarGuideSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const source = WORD_GRAMMAR_PACK_METADATA.manifest.source;
  const maxSheetHeight = Math.max(0, Math.round(windowHeight * 0.9));
  const sheetHeight = Math.min(maxSheetHeight, Math.max(360, Math.round(windowHeight * 0.58)));

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      height={sheetHeight}
      accessibilityLabel="About this grammar"
      backdropAccessibilityLabel="Close grammar information"
    >
      <View style={[styles.handle, { backgroundColor: palette.border }]} />
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <View style={[styles.headerIcon, { backgroundColor: palette.interactive }]}>
          <Info color={palette.tint} size={20} strokeWidth={2.2} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: palette.text }]}>About this grammar</Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>How the selected word and ayah analysis are presented.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close grammar information"
          hitSlop={10}
          onPress={onClose}
          style={styles.closeButton}
        >
          <X color={palette.muted} size={20} strokeWidth={2.25} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: palette.text }]}>What you’re reading</Text>
          <Text style={[styles.body, { color: palette.muted }]}>
            Arabic i‘rab (إعراب) explains the grammatical role of the selected word in the context of this ayah.
          </Text>
          <Text style={[styles.body, { color: palette.muted }]}>
            A focused note appears when a source heading covers the selected word, including headings that group several words. Otherwise, use the complete verse grammar; no source text is inferred or rewritten.
          </Text>
        </View>

        <View style={[styles.sourceCard, { backgroundColor: palette.interactive }]}>
          <BookOpen color={palette.tint} size={21} strokeWidth={2.1} />
          <View style={styles.sourceCopy}>
            <Text style={[styles.sourceLabel, { color: palette.muted }]}>GRAMMAR SOURCE</Text>
            <Text style={[styles.sourceTitle, { color: palette.text }]}>{source.title}</Text>
            <Text style={[styles.sourceMeta, { color: palette.muted }]}>Version {source.version} · {source.sourceId}</Text>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8 },
  header: {
    minHeight: 78,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  headerIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: 2 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  subtitle: { fontSize: 12, lineHeight: 18 },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24, gap: 18 },
  group: { gap: 8 },
  groupTitle: { fontSize: 18, lineHeight: 25, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 22 },
  sourceCard: { borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sourceCopy: { flex: 1, gap: 3 },
  sourceLabel: { fontSize: 10, lineHeight: 15, fontWeight: '800', letterSpacing: 0.9 },
  sourceTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  sourceMeta: { fontSize: 12, lineHeight: 18 },
});
