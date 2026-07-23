import React from 'react';
import { Check, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI_LANGUAGES, type UiLanguageCode } from '@/lib/i18n/uiLanguages';
import {
  INITIAL_TRANSLATION_BY_UI_LANGUAGE,
  markWelcomeCompletedAsync,
  silentlyInstallInitialTranslationAsync,
} from '@/lib/onboarding/initialSetup';
import { useSettings } from '@/providers/SettingsContext';
import { loadSettings, saveSettings } from '@/providers/settingsStorage';
import { useWelcome } from '@/providers/WelcomeContext';

const COPY: Record<
  UiLanguageCode,
  { action: string }
> = {
  en: { action: 'Start reading' },
  bn: { action: 'পড়া শুরু করুন' },
  ar: { action: 'ابدأ القراءة' },
  ur: { action: 'پڑھنا شروع کریں' },
  hi: { action: 'पढ़ना शुरू करें' },
};

function AppIcon(): React.JSX.Element {
  return (
    <View style={styles.iconShell} accessibilityElementsHidden>
      <Image
        source={require('../assets/images/icon.png')}
        resizeMode="contain"
        style={styles.appIcon}
      />
    </View>
  );
}

export default function WelcomeScreen(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { settings, setSettings } = useSettings();
  const { completeWelcome } = useWelcome();
  const [language, setLanguage] = React.useState<UiLanguageCode>('en');
  const [isStarting, setIsStarting] = React.useState(false);
  const copy = COPY[language];

  const handleStart = React.useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);

    const nextSettings = {
      ...settings,
      uiLanguage: language,
      contentLanguage: language,
      translationId: 20,
      translationIds: [20],
      mushafId: undefined,
      tajweed: false,
      readingMode: 'translations' as const,
    };

    setSettings(nextSettings);
    await Promise.all([saveSettings(nextSettings), markWelcomeCompletedAsync()]);
    completeWelcome();
    router.replace('/');

    const preferredTranslationId = INITIAL_TRANSLATION_BY_UI_LANGUAGE[language];
    if (preferredTranslationId && preferredTranslationId !== 20) {
      void silentlyInstallInitialTranslationAsync({
        language,
        wordLanguage: settings.wordLang,
      }).then(async (installed) => {
        if (!installed) return;
        const latest = await loadSettings();
        const stillUsingInitialFallback =
          latest.uiLanguage === language &&
          latest.translationIds.length === 1 &&
          latest.translationIds[0] === 20;
        if (!stillUsingInitialFallback) return;

        const withPreferredTranslation = {
          ...latest,
          translationId: preferredTranslationId,
          translationIds: [preferredTranslationId],
        };
        setSettings(withPreferredTranslation);
        await saveSettings(withPreferredTranslation);
      });
    }
  }, [completeWelcome, isStarting, language, router, setSettings, settings]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F5EC" />
      <View style={[styles.haze, styles.hazeTop]} />
      <View style={[styles.haze, styles.hazeBottom]} />

      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.content,
          {
            minHeight: height,
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <View style={styles.hero}>
          <AppIcon />
          <Text style={styles.title}>Please select the language</Text>
        </View>

        <View style={styles.languageSection}>
          <View style={styles.languageCard} accessibilityRole="radiogroup">
            {UI_LANGUAGES.map((item) => {
              const selected = item.code === language;
              return (
                <Pressable
                  key={item.code}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${item.label}, ${item.nativeLabel}`}
                  onPress={() => setLanguage(item.code)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}
                >
                  <View
                    style={[
                      styles.languageRow,
                      selected && styles.languageRowSelected,
                    ]}
                  >
                    <View style={styles.languageIdentity}>
                      <View style={[styles.languageGlyph, selected && styles.languageGlyphSelected]}>
                        <Text style={[styles.languageGlyphText, selected && styles.languageGlyphTextSelected]}>
                          {item.nativeLabel.slice(0, 1)}
                        </Text>
                      </View>
                      <View style={styles.languageTextBlock}>
                        <Text style={styles.nativeLabel}>{item.nativeLabel}</Text>
                        {item.nativeLabel !== item.label ? (
                          <Text style={styles.englishLabel}>{item.label}</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected ? <Check color="#FFFFFF" size={15} strokeWidth={3} /> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.action}
          disabled={isStarting}
          onPress={() => void handleStart()}
          style={({ pressed }) => ({ opacity: pressed || isStarting ? 0.78 : 1 })}
        >
          <View style={styles.startButton}>
            <Text style={styles.startButtonText}>{copy.action}</Text>
            <ChevronRight color="#FFFFFF" size={21} strokeWidth={2.5} />
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F5EC' },
  content: { flexGrow: 1, paddingHorizontal: 22 },
  haze: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: '#DDEADF', opacity: 0.55 },
  hazeTop: { right: -120, top: -100 },
  hazeBottom: { bottom: -130, left: -130, backgroundColor: '#E7DDC8' },
  hero: { alignItems: 'center', paddingTop: 8 },
  iconShell: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    height: 124,
    justifyContent: 'center',
    marginBottom: 22,
    overflow: 'hidden',
    width: 124,
  },
  appIcon: { height: 124, width: 124 },
  title: {
    alignSelf: 'stretch',
    color: '#173C2E',
    fontSize: Platform.OS === 'ios' ? 28 : 27,
    fontWeight: '800',
    letterSpacing: -0.7,
    lineHeight: 34,
    textAlign: 'left',
  },
  languageSection: { marginTop: 22 },
  languageCard: { gap: 10 },
  languageRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  languageRowSelected: { backgroundColor: '#F0F8F5', borderColor: '#0D9488' },
  languageIdentity: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 12 },
  languageGlyph: { alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, height: 48, justifyContent: 'center', width: 48 },
  languageGlyphSelected: { backgroundColor: '#DDF1EB' },
  languageGlyphText: { color: '#6B7280', fontSize: 18, fontWeight: '700' },
  languageGlyphTextSelected: { color: '#0D9488' },
  languageTextBlock: { flex: 1 },
  nativeLabel: { color: '#374151', fontSize: 16, fontWeight: '700', textAlign: 'left' },
  englishLabel: { color: '#6B7280', fontSize: 12, marginTop: 2, textAlign: 'left' },
  radio: { alignItems: 'center', borderColor: '#C7CDD3', borderRadius: 12, borderWidth: 1.5, height: 24, justifyContent: 'center', marginLeft: 12, width: 24 },
  radioSelected: { backgroundColor: '#0D9488', borderColor: '#0D9488' },
  startButton: { alignItems: 'center', backgroundColor: '#1F6248', borderRadius: 18, flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 20, minHeight: 58, paddingHorizontal: 22, ...Platform.select({ ios: { shadowColor: '#173C2E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 14 }, android: { elevation: 5 } }) },
  startButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.1 },
});
