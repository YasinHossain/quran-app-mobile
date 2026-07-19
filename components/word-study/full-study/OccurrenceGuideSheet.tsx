import { Info, X } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useModalTransition, verticalSheetTransform } from '@/components/motion/modalTransition';
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
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen, {
    openDuration: 240,
    closeDuration: 170,
  });
  const maxSheetHeight = Math.max(0, Math.round(windowHeight * 0.9));
  const sheetHeight = Math.min(maxSheetHeight, Math.max(440, Math.round(windowHeight * 0.68)));

  const handleOverlayPress = React.useCallback(() => {
    if (dismissEnabledRef.current) onClose();
  }, [dismissEnabledRef, onClose]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onShow={onModalShow}
      onRequestClose={onClose}
      statusBarTranslucent
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
      <View style={styles.root} className={isDark ? 'dark' : ''}>
        <Pressable
          accessibilityLabel="Close occurrence information"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={handleOverlayPress}
        >
          <Animated.View style={[styles.overlay, { opacity: progress }]} />
        </Pressable>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="About occurrences"
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              minHeight: sheetHeight,
              maxHeight: maxSheetHeight,
              backgroundColor: isDark ? palette.background : palette.surface,
              borderColor: palette.border,
            },
            verticalSheetTransform(progress, Math.max(460, sheetHeight)),
          ]}
        >
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
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
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
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
  root: { flex: 1, justifyContent: 'flex-end' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
  },
  safeArea: { flex: 1, width: '100%' },
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
