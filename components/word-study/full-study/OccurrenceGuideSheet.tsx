import { Info, X } from 'lucide-react-native';
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

export function OccurrenceGuideSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const maxSheetHeight = Math.max(0, Math.round(windowHeight * 0.9));
  const sheetHeight = Math.min(maxSheetHeight, Math.max(440, Math.round(windowHeight * 0.68)));

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      height={sheetHeight}
      accessibilityLabel="About occurrences"
      backdropAccessibilityLabel="Close occurrence information"
    >
      <View style={[styles.handle, { backgroundColor: palette.border }]} />
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <View style={[styles.headerIcon, { backgroundColor: palette.interactive }]}>
          <Info color={palette.tint} size={20} strokeWidth={2.2} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: palette.text }]}>About occurrences</Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>How matches and root-family forms are grouped.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close occurrence information"
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
        <GuideGroup
          title="What the counts mean"
          body="Surface counts the same normalized Arabic form. Lemma groups inflected forms under one dictionary form. Root counts the complete root family. Root forms counts the distinct corpus lemmas in that family."
          palette={palette}
        />
        <GuideGroup
          title="About surface matches"
          body="Normalization can group differently marked spellings. Every result still shows the exact Quran text found at that location."
          palette={palette}
        />
        <GuideGroup
          title="Browsing a root family"
          body="Root-family forms can include verbs, nouns, and adjectives. Choose a form to view only its Quran occurrences; use the × beside the active form to return to the selected word’s lemma."
          palette={palette}
        />
      </ScrollView>
    </BottomSheet>
  );
}

function GuideGroup({
  title,
  body,
  palette,
}: {
  title: string;
  body: string;
  palette: (typeof Colors)['light'];
}): React.JSX.Element {
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.body, { color: palette.muted }]}>{body}</Text>
    </View>
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
  content: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 28, gap: 22 },
  group: { gap: 6 },
  groupTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 22 },
});
