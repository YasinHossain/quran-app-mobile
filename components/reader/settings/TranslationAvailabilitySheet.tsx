import React from 'react';
import { Download, Wifi, X } from 'lucide-react-native';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export function TranslationAvailabilitySheet({
  visible,
  translationName,
  onClose,
  onDownload,
  onContinueOnline,
}: {
  visible: boolean;
  translationName: string | null;
  onClose: () => void;
  onDownload: () => void;
  onContinueOnline: () => void;
}): React.JSX.Element {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { resolvedTheme, isDark } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const minHeight = Math.min(330, Math.round(height * 0.38));
  const maxHeight = Math.min(430, Math.round(height * 0.62));

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      statusBarTranslucent
      onRequestClose={onClose}
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
      <View style={styles.root} className={isDark ? 'dark' : ''}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('cancel')} onPress={onClose} style={StyleSheet.absoluteFill}>
          <View style={styles.scrim} />
        </Pressable>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              minHeight,
              maxHeight,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: palette.text }]}>{translationName}</Text>
              <Text style={[styles.subtitle, { color: palette.muted }]}>
                {t('translation_not_downloaded', {
                  fallback: 'Choose how you want to use this translation.',
                })}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} hitSlop={10}>
              <X color={palette.muted} size={21} />
            </Pressable>
          </View>

          <SheetAction
            icon={<Download color={palette.onAccent} size={21} strokeWidth={2.4} />}
            title={t('download')}
            description={t('download_translation_description', {
              fallback: 'Install it for reliable offline reading.',
            })}
            accent
            palette={palette}
            onPress={onDownload}
          />
          <SheetAction
            icon={<Wifi color={palette.tint} size={21} strokeWidth={2.3} />}
            title={t('continue_online', { fallback: 'Continue online' })}
            description={t('continue_online_description', {
              fallback: 'Use the network when it is available.',
            })}
            palette={palette}
            onPress={onContinueOnline}
          />
        </View>
      </View>
    </Modal>
  );
}

function SheetAction({
  icon,
  title,
  description,
  accent = false,
  palette,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: boolean;
  palette: (typeof Colors)['light'];
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: accent ? palette.tint : palette.interactive,
          borderColor: accent ? palette.tint : palette.border,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: accent ? 'rgba(255,255,255,0.16)' : palette.surface }]}>
        {icon}
      </View>
      <View style={styles.actionText}>
        <Text style={[styles.actionTitle, { color: accent ? palette.onAccent : palette.text }]}>{title}</Text>
        <Text style={[styles.actionDescription, { color: accent ? 'rgba(255,255,255,0.78)' : palette.muted }]}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { flex: 1, backgroundColor: 'rgba(4, 12, 9, 0.52)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, gap: 10, paddingHorizontal: 18, paddingTop: 10 },
  handle: { alignSelf: 'center', backgroundColor: '#AAB5AE', borderRadius: 2, height: 4, marginBottom: 4, opacity: 0.65, width: 38 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingBottom: 6, paddingTop: 6 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  action: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 13, minHeight: 76, paddingHorizontal: 14, paddingVertical: 12 },
  icon: { alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  actionText: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '800' },
  actionDescription: { fontSize: 12, lineHeight: 17, marginTop: 3 },
});
