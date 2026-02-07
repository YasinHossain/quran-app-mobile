import { BookOpen, Hash } from 'lucide-react-native';
import React from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useAppTheme } from '@/providers/ThemeContext';

type SearchSuggestion =
  | { icon: 'juz'; query: string; number: number }
  | { icon: 'page'; query: string; number: number }
  | { icon: 'surah'; query: string; surahId: number }
  | { icon: 'ayah'; query: string; verseKey: string };

const SEARCH_SUGGESTIONS: SearchSuggestion[] = [
  { icon: 'juz', query: 'Juz 1', number: 1 },
  { icon: 'page', query: 'Page 1', number: 1 },
  { icon: 'surah', query: 'Surah Yasin', surahId: 36 },
  { icon: 'ayah', query: '2:255', verseKey: '2:255' },
];

function SuggestionIcon({ icon }: { icon: SearchSuggestion['icon'] }): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  if (icon === 'juz') return <Text className="text-[10px] font-bold text-accent dark:text-accent-dark">J</Text>;
  if (icon === 'page') return <Text className="text-[10px] font-bold text-accent dark:text-accent-dark">P</Text>;
  if (icon === 'ayah') return <Hash size={14} strokeWidth={2.25} color={palette.tint} />;
  return <BookOpen size={14} strokeWidth={2.25} color={palette.tint} />;
}

export function GoToSurahVerseCard({
  title = 'Go To',
  subtitle,
  buttonLabel = 'Go',
  variant = 'card',
  onNavigate,
  onSearchSuggestion,
}: {
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  variant?: 'card' | 'embedded';
  onNavigate: (surahId: number, verse?: number) => void;
  onSearchSuggestion?: (query: string) => void;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { chapters, isLoading, errorMessage, refresh } = useChapters();
  const [selectedSurah, setSelectedSurah] = React.useState<number | undefined>(undefined);
  const [selectedVerse, setSelectedVerse] = React.useState<number | undefined>(undefined);
  const [surahInputValue, setSurahInputValue] = React.useState('');
  const [verseInputValue, setVerseInputValue] = React.useState('');
  const [isSurahFocused, setIsSurahFocused] = React.useState(false);
  const [isVerseFocused, setIsVerseFocused] = React.useState(false);
  const [isSurahDropdownOpen, setIsSurahDropdownOpen] = React.useState(false);
  const [isVerseDropdownOpen, setIsVerseDropdownOpen] = React.useState(false);
  const isInteractingWithSurahDropdownRef = React.useRef(false);
  const isInteractingWithVerseDropdownRef = React.useRef(false);
  const verseInputRef = React.useRef<TextInput | null>(null);

  const activeChapter = React.useMemo(
    () => (selectedSurah ? chapters.find((chapter) => chapter.id === selectedSurah) : undefined),
    [chapters, selectedSurah]
  );

  const surahOptions = React.useMemo(() => {
    return chapters.map((chapter) => ({
      value: chapter.id,
      label: `${chapter.id} • ${chapter.name_simple}`,
      searchLabel: `${chapter.id} ${chapter.name_simple}`.toLowerCase(),
    }));
  }, [chapters]);

  const verseOptions = React.useMemo(() => {
    if (!activeChapter?.verses_count) return [];
    return Array.from({ length: activeChapter.verses_count }, (_, index) => ({
      value: index + 1,
      label: String(index + 1),
    }));
  }, [activeChapter?.verses_count]);

  const selectedSurahLabel = React.useMemo(() => {
    if (!selectedSurah) return 'Select Surah';
    const chapter = activeChapter;
    if (!chapter) return `Surah ${selectedSurah}`;
    return `${chapter.id} • ${chapter.name_simple}`;
  }, [activeChapter, selectedSurah]);

  const filteredSurahOptions = React.useMemo(() => {
    const query = surahInputValue.trim().toLowerCase();
    if (!query) return surahOptions;
    return surahOptions.filter((option) => {
      const idMatch = String(option.value).startsWith(query);
      const labelMatch = option.searchLabel.includes(query);
      return idMatch || labelMatch;
    });
  }, [surahInputValue, surahOptions]);

  const filteredVerseOptions = React.useMemo(() => {
    if (!selectedSurah || verseOptions.length === 0) return [];
    const query = verseInputValue.trim();
    if (!query) return verseOptions;
    return verseOptions.filter((option) => option.label.startsWith(query));
  }, [selectedSurah, verseInputValue, verseOptions]);

  const selectSurah = React.useCallback(
    (surahId: number) => {
      const chapter = chapters.find((item) => item.id === surahId);
      const maxVerse = chapter?.verses_count ?? 0;
      setSelectedSurah(surahId);
      setSurahInputValue(chapter ? `${chapter.id} • ${chapter.name_simple}` : `Surah ${surahId}`);
      setIsSurahFocused(false);
      setIsSurahDropdownOpen(false);
      setSelectedVerse((prev) => {
        if (typeof prev !== 'number' || !Number.isFinite(prev) || prev <= 0) return undefined;
        if (!maxVerse) return undefined;
        return prev > maxVerse ? maxVerse : prev;
      });
      setVerseInputValue((prev) => {
        const parsed = Number.parseInt(prev.trim(), 10);
        if (!Number.isFinite(parsed) || parsed <= 0 || (maxVerse && parsed > maxVerse)) return '';
        return String(parsed);
      });
      setTimeout(() => {
        verseInputRef.current?.focus();
      }, 40);
    },
    [chapters]
  );

  const selectVerse = React.useCallback(
    (verse: number) => {
      setSelectedVerse(verse);
      setVerseInputValue(String(verse));
      setIsVerseFocused(false);
      setIsVerseDropdownOpen(false);
      if (selectedSurah) {
        onNavigate(selectedSurah, verse);
      }
    },
    [onNavigate, selectedSurah]
  );

  const submit = React.useCallback(() => {
    if (!selectedSurah) return;
    Keyboard.dismiss();
    setIsSurahDropdownOpen(false);
    setIsVerseDropdownOpen(false);
    onNavigate(selectedSurah, selectedVerse);
  }, [onNavigate, selectedSurah, selectedVerse]);

  const handleSurahInputChange = React.useCallback(
    (value: string) => {
      setSurahInputValue(value);
      const trimmed = value.trim();
      if (!trimmed) {
        setSelectedSurah(undefined);
        setSelectedVerse(undefined);
        setVerseInputValue('');
        return;
      }
      const query = trimmed.toLowerCase();
      const match = surahOptions.find((option) => {
        const idMatch = String(option.value).startsWith(query);
        const labelMatch = option.searchLabel.includes(query);
        return idMatch || labelMatch;
      });
      if (match) {
        setSelectedSurah(match.value);
        setSelectedVerse((prev) => {
          const chapter = chapters.find((item) => item.id === match.value);
          const maxVerse = chapter?.verses_count ?? 0;
          if (typeof prev !== 'number' || !Number.isFinite(prev) || prev <= 0) return undefined;
          return maxVerse && prev > maxVerse ? maxVerse : prev;
        });
        return;
      }

      const numeric = Number.parseInt(trimmed.replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(numeric) && numeric > 0) {
        setSelectedSurah(numeric);
      }
      setSelectedVerse((prev) => {
        if (typeof prev !== 'number' || !Number.isFinite(prev) || prev <= 0) return undefined;
        return prev;
      });
    },
    [chapters, surahOptions]
  );

  const handleVerseInputChange = React.useCallback(
    (value: string) => {
      const sanitized = value.replace(/[^\d]/g, '').slice(0, 4);
      setVerseInputValue(sanitized);
      const parsed = Number.parseInt(sanitized, 10);
      if (!Number.isFinite(parsed)) {
        setSelectedVerse(undefined);
        return;
      }
      const maxVerse = activeChapter?.verses_count ?? 0;
      const clamped = maxVerse > 0 ? Math.min(Math.max(parsed, 1), maxVerse) : Math.max(parsed, 1);
      setSelectedVerse(clamped);
    },
    [activeChapter?.verses_count]
  );

  const handleSurahBlur = React.useCallback(() => {
    setTimeout(() => {
      if (isInteractingWithSurahDropdownRef.current) return;
      setIsSurahFocused(false);
      if (!selectedSurah) {
        setSurahInputValue('');
        return;
      }
      setSurahInputValue(selectedSurahLabel);
    }, 140);
  }, [selectedSurah, selectedSurahLabel]);

  const handleVerseBlur = React.useCallback(() => {
    setTimeout(() => {
      if (isInteractingWithVerseDropdownRef.current) return;
      setIsVerseFocused(false);
      if (typeof selectedVerse === 'number' && Number.isFinite(selectedVerse) && selectedVerse > 0) {
        setVerseInputValue(String(selectedVerse));
      } else {
        setVerseInputValue('');
      }
    }, 140);
  }, [selectedVerse]);

  const handleSurahFocus = React.useCallback(() => {
    setIsSurahFocused(true);
    setIsSurahDropdownOpen(true);
    setIsVerseDropdownOpen(false);
  }, []);

  const handleVerseFocus = React.useCallback(() => {
    if (!selectedSurah) return;
    setIsVerseFocused(true);
    setIsVerseDropdownOpen(true);
    setIsSurahDropdownOpen(false);
  }, [selectedSurah]);

  const handleSurahSubmit = React.useCallback(() => {
    const firstMatch = filteredSurahOptions[0];
    if (firstMatch) {
      selectSurah(firstMatch.value);
      return;
    }
    if (selectedSurah) {
      setSurahInputValue(selectedSurahLabel);
      verseInputRef.current?.focus();
    }
  }, [filteredSurahOptions, selectSurah, selectedSurah, selectedSurahLabel]);

  const handleVerseSubmit = React.useCallback(() => {
    if (!selectedSurah) return;
    setIsVerseDropdownOpen(false);
    if (typeof selectedVerse === 'number' && Number.isFinite(selectedVerse) && selectedVerse > 0) {
      onNavigate(selectedSurah, selectedVerse);
      return;
    }
    onNavigate(selectedSurah);
  }, [onNavigate, selectedSurah, selectedVerse]);

  const showSurahDropdown = isSurahDropdownOpen && filteredSurahOptions.length > 0;
  const showVerseDropdown = isVerseDropdownOpen && filteredVerseOptions.length > 0 && Boolean(selectedSurah);

  const subtitleText =
    subtitle ??
    (isLoading && chapters.length === 0 ? 'Loading surahs…' : undefined);

  const formPaddingClass = variant === 'card' ? 'px-5 py-5' : 'px-6 pt-5 pb-6';

  return (
    <View className={isDark ? 'dark' : ''}>
      <View
        className={
          variant === 'card'
            ? 'rounded-xl bg-surface-navigation dark:bg-surface-navigation-dark border border-border/30 dark:border-border-dark/20'
            : ''
        }
      >
        <View className={formPaddingClass}>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark">
                {title}
              </Text>
              {subtitleText ? (
                <Text className="mt-1 text-sm text-muted dark:text-muted-dark">{subtitleText}</Text>
              ) : null}
            </View>

            <Pressable
              onPress={submit}
              disabled={!selectedSurah}
              accessibilityRole="button"
              accessibilityLabel={buttonLabel}
              className="rounded-lg bg-accent px-6 py-2"
              style={({ pressed }) => ({
                opacity: !selectedSurah ? 0.5 : pressed ? 0.9 : 1,
              })}
            >
              <Text className="text-sm font-semibold text-on-accent">{buttonLabel}</Text>
            </Pressable>
          </View>

          <View className="mt-4 flex-row gap-3">
            <View style={{ flex: 3 }} className="min-w-0">
              <Text className="mb-2 text-sm font-semibold text-foreground dark:text-foreground-dark">
                Surah
              </Text>
              <View
                className="min-w-0"
                style={showSurahDropdown ? { position: 'relative', zIndex: 30 } : undefined}
              >
                <View
                  className="rounded-lg border border-border dark:border-border-dark bg-interactive/60 dark:bg-interactive-dark"
                  style={isSurahFocused ? focusedInputStyle(palette.tint) : undefined}
                >
                  <TextInput
                    value={surahInputValue}
                    onChangeText={handleSurahInputChange}
                    onFocus={handleSurahFocus}
                    onBlur={handleSurahBlur}
                    placeholder="Select Surah"
                    placeholderTextColor={palette.muted}
                    editable
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="next"
                    onSubmitEditing={handleSurahSubmit}
                    className="px-3 py-2.5 text-sm text-foreground dark:text-foreground-dark"
                  />
                </View>

                {showSurahDropdown ? (
                  <View
                    className="rounded-lg border border-border/40 dark:border-border-dark/40 bg-surface-navigation dark:bg-surface-navigation-dark"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      zIndex: 50,
                      elevation: 8,
                    }}
                    onTouchStart={() => {
                      isInteractingWithSurahDropdownRef.current = true;
                    }}
                    onTouchEnd={() => {
                      isInteractingWithSurahDropdownRef.current = false;
                    }}
                    onTouchCancel={() => {
                      isInteractingWithSurahDropdownRef.current = false;
                    }}
                  >
                    <ScrollView
                      style={{ maxHeight: 320 }}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      {filteredSurahOptions.map((option) => {
                        const isSelected = option.value === selectedSurah;
                        return (
                          <Pressable
                            key={`surah-${option.value}`}
                            onPressIn={() => {
                              isInteractingWithSurahDropdownRef.current = true;
                            }}
                            onPressOut={() => {
                              isInteractingWithSurahDropdownRef.current = false;
                            }}
                            onPress={() => selectSurah(option.value)}
                            className="px-3 py-2.5"
                            style={({ pressed }) => ({
                              backgroundColor: pressed || isSelected ? `${palette.tint}18` : 'transparent',
                            })}
                          >
                            <Text numberOfLines={1} className="text-sm text-foreground dark:text-foreground-dark">
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ flex: 2 }} className="min-w-0">
              <Text className="mb-2 text-sm font-semibold text-foreground dark:text-foreground-dark">
                Verse
              </Text>
              <View
                className="min-w-0"
                style={showVerseDropdown ? { position: 'relative', zIndex: 20 } : undefined}
              >
                <View
                  className="rounded-lg border border-border dark:border-border-dark bg-interactive/60 dark:bg-interactive-dark"
                  style={isVerseFocused ? focusedInputStyle(palette.tint) : undefined}
                >
                  <TextInput
                    ref={(node) => {
                      verseInputRef.current = node;
                    }}
                    value={verseInputValue}
                    onChangeText={handleVerseInputChange}
                    onFocus={handleVerseFocus}
                    onBlur={handleVerseBlur}
                    placeholder={selectedSurah ? 'Select Verse' : 'Select Surah first'}
                    placeholderTextColor={palette.muted}
                    editable={Boolean(selectedSurah)}
                    keyboardType="number-pad"
                    returnKeyType="go"
                    onSubmitEditing={handleVerseSubmit}
                    className="px-3 py-2.5 text-sm text-foreground dark:text-foreground-dark"
                  />
                </View>

                {showVerseDropdown ? (
                  <View
                    className="rounded-lg border border-border/40 dark:border-border-dark/40 bg-surface-navigation dark:bg-surface-navigation-dark"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      zIndex: 50,
                      elevation: 8,
                    }}
                    onTouchStart={() => {
                      isInteractingWithVerseDropdownRef.current = true;
                    }}
                    onTouchEnd={() => {
                      isInteractingWithVerseDropdownRef.current = false;
                    }}
                    onTouchCancel={() => {
                      isInteractingWithVerseDropdownRef.current = false;
                    }}
                  >
                    <ScrollView
                      style={{ maxHeight: 320 }}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      {filteredVerseOptions.map((option) => {
                        const value = option.value;
                        const isSelected = value === selectedVerse;
                        return (
                          <Pressable
                            key={`verse-${value}`}
                            onPressIn={() => {
                              isInteractingWithVerseDropdownRef.current = true;
                            }}
                            onPressOut={() => {
                              isInteractingWithVerseDropdownRef.current = false;
                            }}
                            onPress={() => selectVerse(value)}
                            className="px-3 py-2.5"
                            style={({ pressed }) => ({
                              backgroundColor: pressed || isSelected ? `${palette.tint}18` : 'transparent',
                            })}
                          >
                            <Text className="text-sm text-foreground dark:text-foreground-dark">
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {errorMessage && chapters.length === 0 ? (
            <View className="mt-3 gap-2">
              <Text className="text-xs text-error dark:text-error-dark">{errorMessage}</Text>
              <Pressable
                onPress={refresh}
                accessibilityRole="button"
                accessibilityLabel="Retry loading surahs"
                className="self-start rounded-lg bg-interactive dark:bg-interactive-dark px-3 py-2"
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null}

          {onSearchSuggestion ? (
            <View className="mt-4 border-t border-border/50 dark:border-border-dark/40 pt-3">
              <Text className="mb-2 text-xs font-medium text-muted dark:text-muted-dark">
                Or try searching
              </Text>
              <View className="flex-row flex-wrap justify-between gap-y-2">
                {SEARCH_SUGGESTIONS.map((suggestion) => {
                  const label =
                    suggestion.icon === 'juz'
                      ? `Juz ${suggestion.number}`
                      : suggestion.icon === 'page'
                        ? `Page ${suggestion.number}`
                        : suggestion.icon === 'surah'
                          ? (() => {
                              const chapter = chapters.find((item) => item.id === suggestion.surahId);
                              return chapter ? `Surah ${chapter.name_simple}` : suggestion.query;
                            })()
                          : suggestion.verseKey;

                  return (
                    <Pressable
                      key={suggestion.query}
                      onPress={() => onSearchSuggestion(suggestion.query)}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      className="rounded-lg px-2.5 py-2 flex-row items-center gap-2"
                      style={({ pressed }) => [{ width: '48%' }, { opacity: pressed ? 0.9 : 1 }]}
                    >
                      <View className="h-5 w-5 rounded bg-accent/10 items-center justify-center">
                        <SuggestionIcon icon={suggestion.icon} />
                      </View>
                      <Text
                        numberOfLines={1}
                        className="flex-1 text-sm text-foreground dark:text-foreground-dark"
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function focusedInputStyle(accentColor: string): {
  borderColor: string;
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
} {
  return {
    borderColor: accentColor,
    shadowColor: accentColor,
    shadowOpacity: Platform.OS === 'ios' ? 0.32 : 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  };
}
