import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  isVerbReference,
  type VerbPrincipalPartKey,
  type VerbReferenceLookupResult,
  type WordAnalysis,
} from '@/src/core/domain/word-study';
import { container } from '@/src/core/infrastructure/di/container';

type Palette = {
  surface: string;
  surfaceNavigation: string;
  text: string;
  muted: string;
  border: string;
  tint: string;
  interactive: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; result: VerbReferenceLookupResult }
  | { status: 'error' };

const PARTS: ReadonlyArray<{
  key: VerbPrincipalPartKey;
  label: string;
  arabicTerm: string;
}> = [
  { key: 'perfect', label: 'Perfect', arabicTerm: 'الماضي' },
  { key: 'imperfect', label: 'Imperfect', arabicTerm: 'المضارع' },
  { key: 'imperative', label: 'Imperative', arabicTerm: 'الأمر' },
  { key: 'activeParticiple', label: 'Active participle', arabicTerm: 'اسم الفاعل' },
  { key: 'passiveParticiple', label: 'Passive participle', arabicTerm: 'اسم المفعول' },
  { key: 'verbalNoun', label: 'Verbal noun', arabicTerm: 'المصدر' },
];

function missingMessage(result: VerbReferenceLookupResult): string {
  if (isVerbReference(result)) return '';
  switch (result.reason) {
    case 'verb-reference-pack-unavailable':
      return 'The verb reference pack could not be opened.';
    case 'ambiguous-reference':
      return 'This verb form has more than one sourced pattern and cannot be identified safely from this word.';
    case 'source-row-missing':
      return 'The installed reference does not record principal parts for this exact verb form.';
    default:
      return 'Principal parts are not available for this word.';
  }
}

export function VerbReferenceSection({
  analysis,
  palette,
}: {
  analysis: WordAnalysis;
  palette: Palette;
}): React.JSX.Element | null {
  const isVerb = analysis.primaryPos.status === 'available' && analysis.primaryPos.value === 'V';
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const { fontScale, width } = useWindowDimensions();
  const singleColumn = width < 330 || fontScale > 1.45;
  const threeColumns = width >= 500 && fontScale <= 1.15;

  React.useEffect(() => {
    if (!isVerb) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    void container
      .getVerbReference()
      .execute(analysis, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setState({ status: 'ready', result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [analysis, isVerb]);

  if (!isVerb) return null;

  const reference = state.status === 'ready' && isVerbReference(state.result)
    ? state.result
    : null;
  const form = analysis.morphology.status === 'available'
    ? analysis.morphology.value.verbForm
    : reference?.verbForm;

  return (
    <View style={styles.section} accessibilityLiveRegion="polite">
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}> 
          {form ? `Verb Form ${form}` : 'Verb principal parts'}
        </Text>
      </View>
      {state.status === 'loading' ? (
        <View style={[styles.stateCard, { borderColor: palette.border, backgroundColor: palette.surfaceNavigation }]}> 
          <ActivityIndicator color={palette.tint} />
          <Text style={[styles.stateText, { color: palette.muted }]}>Reading verb reference…</Text>
        </View>
      ) : reference ? (
        <View style={styles.grid}>
          {PARTS.map((part) => {
            const value = reference.principalParts[part.key];
            return (
              <View
                key={part.key}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${part.label}: ${value ?? 'not recorded'}`}
                style={[
                  styles.card,
                  singleColumn
                    ? styles.cardSingle
                    : threeColumns
                      ? styles.cardThird
                      : styles.cardHalf,
                  { borderColor: palette.border, backgroundColor: palette.surfaceNavigation },
                ]}
              >
                <Text style={[styles.label, { color: palette.muted }]}>{part.label}</Text>
                <Text style={[styles.arabicTerm, { color: palette.text }]}>{part.arabicTerm}</Text>
                <Text
                  style={[
                    styles.arabic,
                    !value && styles.unavailable,
                    { color: value ? palette.text : palette.muted },
                  ]}
                >
                  {value ?? '—'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={[styles.stateCard, { borderColor: palette.border, backgroundColor: palette.surfaceNavigation }]}> 
          <Text style={[styles.stateText, { color: palette.muted }]}> 
            {state.status === 'error'
              ? 'The verb reference could not be loaded.'
              : missingMessage(state.result)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { gap: 3, paddingHorizontal: 2 },
  title: { fontSize: 18, lineHeight: 25, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    minHeight: 118,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    paddingHorizontal: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHalf: { flexBasis: '47%', flexGrow: 1 },
  cardThird: { flexBasis: '31%', flexGrow: 1 },
  cardSingle: { flexBasis: '100%' },
  label: { fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  arabicTerm: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  arabic: {
    marginTop: 3,
    fontFamily: 'UthmanicHafs1Ver18',
    fontSize: 29,
    lineHeight: 43,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  unavailable: { fontFamily: undefined, fontSize: 24 },
  stateCard: {
    minHeight: 92,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
