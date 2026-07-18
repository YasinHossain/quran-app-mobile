import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { AppHeader } from '@/components/navigation/AppHeader';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

type PolicySection = {
  body?: string[];
  bullets?: Array<{ label: string; text: string }>;
  title: string;
};

const POLICY_SECTIONS: PolicySection[] = [
  {
    title: '1. Introduction',
    body: [
      'This Privacy Policy describes how the Quran App ("we," "our," or "the Application") handles information when you use our services. We are committed to protecting your privacy and ensuring transparency about our data practices.',
    ],
  },
  {
    title: '2. Information We Collect',
    body: [
      'The Application is designed with privacy as a priority. We collect minimal information necessary to provide our services:',
    ],
    bullets: [
      {
        label: 'Local Storage Data',
        text: 'Your preferences, downloaded content index, offline Quran resources, Word Study and optional dictionary pack state, bookmarks, reading progress, and planner data are stored locally on your device using app storage, SQLite, and app files. This data is not sent to our servers.',
      },
      {
        label: 'No Personal Information',
        text: 'We do not collect, store, or process any personally identifiable information such as names, email addresses, or account credentials.',
      },
      {
        label: 'No Analytics Tracking',
        text: 'By default, the Application does not use analytics or tracking services to monitor your behavior, studied words, reading content, notes, or religious-profile data.',
      },
    ],
  },
  {
    title: '3. Third-Party Services and Content Attribution',
    body: [
      'The Application uses third-party services to provide Quranic content. Quranic content is provided by Quran Foundation, and Quran.com Content APIs and CDN are used for verses, translations, tafsir, mushaf data, and recitations.',
    ],
    bullets: [
      {
        label: 'Quran Foundation and Quran.com Content APIs',
        text: 'We retrieve Quranic verses, translations, tafsir, mushaf page data, and related resources from public Quran Foundation and Quran.com services.',
      },
      {
        label: 'Word Study Sources',
        text: 'The bundled Word Study MVP pack includes sourced morphology and occurrence indexes from Quranic Arabic Corpus v0.4, plus canonical Uthmani surface text and contextual English glosses from the installed offline word pack. Optional Lane and Hans Wehr English dictionary packs are downloaded only when you request them and remain stored locally. The dedicated Word Study Sources screen shows installed source and version details.',
      },
      {
        label: 'Audio Content',
        text: 'Audio recitations may be served from external sources including Quran.com CDN and archive.org.',
      },
    ],
  },
  {
    title: '4. Data Storage and Security',
    body: [
      'User preferences, bookmarks, planner data, reading progress, and offline resources are stored on your device. You can remove this data by clearing the app data from Android settings, deleting downloaded resources inside the app, or uninstalling the Application.',
    ],
  },
  {
    title: '5. Cookies',
    body: [
      'The Android application does not use browser cookies. Theme and settings preferences are stored locally in the app so your experience remains consistent.',
    ],
  },
  {
    title: "6. Children's Privacy",
    body: [
      'The Application is suitable for users of all ages. We do not knowingly collect any personal information from children or any other users. The Application provides educational Quranic content without requiring registration or personal data submission.',
    ],
  },
  {
    title: '7. Changes to This Policy',
    body: [
      'We may update this Privacy Policy from time to time. Any changes will be reflected here with an updated "Last Updated" date. We encourage you to review this policy periodically.',
    ],
  },
  {
    title: '8. Open Source',
    body: [
      'This Application is open source. You may review the complete source code to verify our privacy practices and data handling procedures.',
    ],
  },
  {
    title: '9. Contact',
    body: [
      'If you have any questions or concerns regarding this Privacy Policy, please open an issue on our GitHub repository or contact the project maintainers.',
    ],
  },
];

function openUrl(url: string): void {
  Linking.openURL(url).catch(() => {});
}

function PolicyBullet({
  label,
  text,
}: {
  label: string;
  text: string;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View className="flex-row gap-3">
      <Text className="text-sm leading-6 text-foreground dark:text-foreground-dark">-</Text>
      <Text className="flex-1 text-sm leading-6 text-foreground dark:text-foreground-dark">
        <Text className="font-semibold">{label}: </Text>
        <Text style={{ color: palette.text }}>{text}</Text>
      </Text>
    </View>
  );
}

function PolicySectionView({ section }: { section: PolicySection }): React.JSX.Element {
  return (
    <View className="mb-8">
      <Text className="mb-3 text-xl font-semibold text-foreground dark:text-foreground-dark">
        {section.title}
      </Text>
      {section.body?.map((paragraph) => (
        <Text
          key={paragraph}
          className="mb-3 text-base leading-7 text-foreground dark:text-foreground-dark"
        >
          {paragraph}
        </Text>
      ))}
      {section.bullets ? (
        <View className="gap-2">
          {section.bullets.map((bullet) => (
            <PolicyBullet key={bullet.label} label={bullet.label} text={bullet.text} />
          ))}
        </View>
      ) : null}
      {section.title === '3. Third-Party Services and Content Attribution' ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => openUrl('https://quran.foundation/privacy')}
          className="mt-3 flex-row items-center gap-2 self-start"
        >
          <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
            Quran Foundation Privacy Policy
          </Text>
          <ExternalLink size={14} color="#0D9488" strokeWidth={2.25} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function PrivacyScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { t } = useUiTranslation();

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <AppHeader
        title={t('home_footer_privacy_policy', { fallback: 'Privacy Policy' })}
        left={
          <HeaderActionButton onPress={() => router.back()} accessibilityLabel="Go back">
            <ArrowLeft size={24} color={palette.text} />
          </HeaderActionButton>
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: insets.bottom + 28,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-10">
          <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 dark:bg-accent-dark/10">
            <ShieldCheck size={28} color={palette.tint} strokeWidth={2.25} />
          </View>
          <Text className="mb-3 text-3xl font-bold text-foreground dark:text-foreground-dark">
            Privacy Policy
          </Text>
          <Text className="text-sm text-muted dark:text-muted-dark">
            Last Updated: July 16, 2026
          </Text>
        </View>

        {POLICY_SECTIONS.map((section) => (
          <PolicySectionView key={section.title} section={section} />
        ))}

        <View className="border-t border-border dark:border-border-dark pt-6">
          <Pressable
            accessibilityRole="link"
            onPress={() => openUrl('https://appquran.com')}
            className="mb-4 flex-row items-center gap-2 self-start"
          >
            <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
              appquran.com
            </Text>
            <ExternalLink size={14} color={palette.tint} strokeWidth={2.25} />
          </Pressable>
          <Text className="text-xs leading-5 text-muted dark:text-muted-dark">
            {t('home_footer_attribution_prefix', {
              fallback: 'Quranic content provided by',
            })}{' '}
            {t('home_footer_attribution_source', { fallback: 'Quran Foundation' })}. Quran.com
            Content APIs and CDN are used for Quranic resources.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
