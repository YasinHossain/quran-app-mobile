import { BookOpen, ExternalLink, Info, X } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  Linking,
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
import type { DictionarySource } from '@/src/core/domain/word-study';

export function DictionaryGuideSheet({
  isOpen,
  onClose,
  source,
}: {
  isOpen: boolean;
  onClose: () => void;
  source?: DictionarySource;
}): React.JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { visible, progress, dismissEnabledRef, onModalShow } = useModalTransition(isOpen, {
    openDuration: 240,
    closeDuration: 170,
  });
  const maxSheetHeight = Math.max(0, Math.round(windowHeight * 0.9));
  const sheetHeight = Math.min(maxSheetHeight, Math.max(480, Math.round(windowHeight * 0.78)));

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
          accessibilityLabel="Close dictionary information"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={handleOverlayPress}
        >
          <Animated.View style={[styles.overlay, { opacity: progress }]} />
        </Pressable>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="About dictionary results"
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              minHeight: sheetHeight,
              maxHeight: maxSheetHeight,
              backgroundColor: isDark ? palette.background : palette.surface,
              borderColor: palette.border,
            },
            verticalSheetTransform(progress, Math.max(500, sheetHeight)),
          ]}
        >
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <View style={[styles.handle, { backgroundColor: palette.border }]} />
            <View style={[styles.header, { borderBottomColor: palette.border }]}>
              <View style={[styles.headerIcon, { backgroundColor: palette.interactive }]}>
                <Info color={palette.tint} size={20} strokeWidth={2.2} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={[styles.title, { color: palette.text }]}>About dictionary results</Text>
                <Text style={[styles.subtitle, { color: palette.muted }]}>How the selected word, lemma, and root are connected.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close dictionary information"
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
              <View style={[styles.pathCard, { backgroundColor: palette.interactive }]}>
                <PathStep label="Selected Quran word" detail="The form encountered in this ayah" palette={palette} />
                <PathConnector color={palette.border} />
                <PathStep label="Lemma" detail="The dictionary form of the selected word" palette={palette} />
                <PathConnector color={palette.border} />
                <PathStep label="Root" detail="The broader Arabic word family" palette={palette} />
                <PathConnector color={palette.border} />
                <PathStep label="Related headwords" detail="Other dictionary entries under that root" palette={palette} />
              </View>

              <GuideGroup
                title="Best match for this word"
                body="An exact lemma match is the closest dictionary headword available. A headword can still contain several senses, so it is not automatically the meaning intended in this ayah."
                palette={palette}
              />
              <GuideGroup
                title="Root dictionary entry"
                body="The root entry describes the broad semantic family. When no exact lemma is available, it is shown as a useful fallback—not as an exact contextual definition."
                palette={palette}
              />
              <GuideGroup
                title="Related dictionary headwords"
                body="These are sibling and derived entries organized under the same root by the selected dictionary. They are different from the Quran occurrence family shown in the Occurrences tab."
                palette={palette}
              />
              <GuideGroup
                title="Choosing a source"
                body="Lane is a detailed classical Arabic reference. Hans Wehr is a more concise reference for modern written Arabic. Their organization and coverage differ, so one source may have an exact headword when the other does not."
                palette={palette}
              />

              {source ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open source page for ${source.title}`}
                  onPress={() => void Linking.openURL(source.url)}
                  style={[styles.sourceCard, { borderColor: palette.border, backgroundColor: palette.surface }]}
                >
                  <BookOpen color={palette.tint} size={21} strokeWidth={2.1} />
                  <View style={styles.sourceCopy}>
                    <Text style={[styles.sourceLabel, { color: palette.tint }]}>SELECTED SOURCE</Text>
                    <Text style={[styles.sourceTitle, { color: palette.text }]}>{source.title}</Text>
                    <Text style={[styles.sourceMeta, { color: palette.muted }]}>English · version {source.version}</Text>
                    <Text style={[styles.sourceAttribution, { color: palette.muted }]}>{source.attribution}</Text>
                  </View>
                  <ExternalLink color={palette.tint} size={18} />
                </Pressable>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function PathStep({ label, detail, palette }: {
  label: string;
  detail: string;
  palette: (typeof Colors)['light'];
}): React.JSX.Element {
  return (
    <View style={styles.pathStep}>
      <View style={[styles.pathDot, { backgroundColor: palette.tint }]} />
      <View style={styles.pathCopy}>
        <Text style={[styles.pathLabel, { color: palette.text }]}>{label}</Text>
        <Text style={[styles.pathDetail, { color: palette.muted }]}>{detail}</Text>
      </View>
    </View>
  );
}

function PathConnector({ color }: { color: string }): React.JSX.Element {
  return <View style={[styles.pathConnector, { backgroundColor: color }]} />;
}

function GuideGroup({ title, body, palette }: {
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
  sheet: { width: '100%', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, overflow: 'hidden' },
  safeArea: { flex: 1, width: '100%' },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8 },
  header: { minHeight: 78, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 11 },
  headerIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: 2 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  subtitle: { fontSize: 12, lineHeight: 18 },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28, gap: 22 },
  pathCard: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 15 },
  pathStep: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  pathDot: { width: 9, height: 9, borderRadius: 5 },
  pathCopy: { flex: 1, gap: 1 },
  pathLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  pathDetail: { fontSize: 12, lineHeight: 18 },
  pathConnector: { width: 1, height: 14, marginLeft: 4, marginVertical: 2 },
  group: { gap: 6 },
  groupTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 22 },
  sourceCard: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sourceCopy: { flex: 1, gap: 3 },
  sourceLabel: { fontSize: 10, lineHeight: 15, fontWeight: '800', letterSpacing: 0.9 },
  sourceTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  sourceMeta: { fontSize: 12, lineHeight: 18 },
  sourceAttribution: { fontSize: 12, lineHeight: 18 },
});
