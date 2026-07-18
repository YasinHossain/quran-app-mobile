import { ChevronDown, Info, X } from 'lucide-react-native';
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

import { MORPHOLOGY_GUIDE_GROUPS } from './morphologyGuideModel';

export function MorphologyGuideSheet({
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
  const sheetHeight = Math.min(maxSheetHeight, Math.max(420, Math.round(windowHeight * 0.82)));

  const handleOverlayPress = React.useCallback(() => {
    if (!dismissEnabledRef.current) return;
    onClose();
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
          accessibilityLabel="Close morphology guide"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={handleOverlayPress}
        >
          <Animated.View style={[styles.overlay, { opacity: progress }]} />
        </Pressable>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="Understanding morphology terms"
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
                <Text style={[styles.title, { color: palette.text }]}>Understanding morphology terms</Text>
                <Text style={[styles.subtitle, { color: palette.muted }]}>A quick guide to the labels used in this analysis.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close morphology guide"
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
              {MORPHOLOGY_GUIDE_GROUPS.map((group) => (
                <View key={group.key} style={styles.group}>
                  <Text style={[styles.groupTitle, { color: palette.text }]}>{group.title}</Text>
                  <View style={[styles.termList, { borderColor: palette.border, backgroundColor: palette.surface }]}>
                    {group.terms.map((term, index) => (
                      <View
                        key={term.key}
                        style={[
                          styles.term,
                          index < group.terms.length - 1
                            ? { borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth }
                            : null,
                        ]}
                      >
                        <Text style={[styles.termTitle, { color: palette.text }]}>
                          {term.label} · {term.arabicTerm}
                        </Text>
                        <Text style={[styles.definition, { color: palette.muted }]}>{term.definition}</Text>
                        {term.example ? (
                          <Text style={[styles.example, { color: palette.tint }]}>{term.example}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              <View style={[styles.footer, { backgroundColor: palette.interactive }]}>
                <ChevronDown color={palette.tint} size={18} strokeWidth={2.2} />
                <Text style={[styles.footerText, { color: palette.muted }]}>Close this guide to continue studying the selected word.</Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
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
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24, gap: 22 },
  group: { gap: 9 },
  groupTitle: { paddingHorizontal: 2, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  termList: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  term: { paddingHorizontal: 15, paddingVertical: 13, gap: 4 },
  termTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  definition: { fontSize: 13, lineHeight: 20 },
  example: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  footer: { borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  footerText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
