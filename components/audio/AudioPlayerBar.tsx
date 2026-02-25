import Slider from '@react-native-community/slider';
import { useSegments } from 'expo-router';
import { Download, Pause, Play, SkipBack, SkipForward, SlidersHorizontal, X } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnchoredDropdownModal } from '@/components/search/AnchoredDropdownModal';
import Colors from '@/constants/Colors';
import { AudioDownloadModal } from '@/components/audio/AudioDownloadModal';
import { PlaybackOptionsModal } from '@/components/audio/PlaybackOptionsModal';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useAppTheme } from '@/providers/ThemeContext';

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function buildTitle(verseKey: string | null): string {
  if (!verseKey) return 'Audio';
  if (/^\d+:\d+$/.test(verseKey)) return `Surah ${verseKey}`;
  return verseKey;
}

function formatSpeedLabel(speed: number): string {
  return `${speed}x`;
}

export function AudioPlayerBar(): React.JSX.Element | null {
  const audio = useAudioPlayer();
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const segments = useSegments();
  const isInTabs = segments[0] === '(tabs)';

  const { bottomTabBarHeight, audioPlayerBarHeight, setAudioPlayerBarHeight } = useLayoutMetrics();
  const bottomOffset = isInTabs ? bottomTabBarHeight : 0;

  const [isSeeking, setIsSeeking] = React.useState(false);
  const [seekValue, setSeekValue] = React.useState(0);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [downloadOpen, setDownloadOpen] = React.useState(false);
  const [speedOpen, setSpeedOpen] = React.useState(false);
  const speedAnchorRef = React.useRef<View | null>(null);

  const durationSec = Math.max(0, audio.durationSec);
  const currentSec = isSeeking ? seekValue : audio.positionSec;
  const interactable = audio.isVisible && !audio.isLoading && !audio.error;

  const hasPrev = audio.queueIndex > 0;
  const hasNext = audio.queueIndex >= 0 && audio.queueIndex < audio.queueVerseKeys.length - 1;

  React.useEffect(() => {
    if (!audio.isVisible) {
      setAudioPlayerBarHeight(0);
      return;
    }

    if (!audioPlayerBarHeight) {
      setAudioPlayerBarHeight(112);
    }
  }, [audio.isVisible, audioPlayerBarHeight, setAudioPlayerBarHeight]);

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (!audio.isVisible) return;
      const height = Math.ceil(event.nativeEvent.layout.height);
      if (height > 0) {
        setAudioPlayerBarHeight(height);
      }
    },
    [audio.isVisible, setAudioPlayerBarHeight]
  );

  const handleOptions = React.useCallback(() => {
    setDownloadOpen(false);
    setSpeedOpen(false);
    setOptionsOpen(true);
  }, []);

  const handleDownload = React.useCallback(() => {
    setSpeedOpen(false);
    setOptionsOpen(false);
    setDownloadOpen(true);
  }, []);

  const handleSpeed = React.useCallback(() => {
    setDownloadOpen(false);
    setOptionsOpen(false);
    setSpeedOpen((prev) => !prev);
  }, []);

  if (!audio.isVisible) return null;

  return (
    <>
      <View
        onLayout={handleLayout}
        style={[styles.root, { bottom: bottomOffset }]}
        accessibilityRole="summary"
        accessibilityLabel="Audio player"
      >
        <SafeAreaView edges={bottomOffset > 0 ? [] : ['bottom']}>
          <View style={styles.outerPadding}>
            {audio.error ? (
              <View className="mb-2 rounded-lg border border-error/25 dark:border-error-dark/25 bg-error/10 dark:bg-error-dark/10 px-3 py-2">
                <Text className="text-xs text-error dark:text-error-dark">{audio.error}</Text>
              </View>
            ) : null}

            <View
              style={styles.card}
              className="bg-surface dark:bg-surface-dark"
            >
              <View className={isDark ? 'dark px-3 py-3 gap-3' : 'px-3 py-3 gap-3'}>
                {/* Mobile Text Header (matches web mobile layout) */}
                <View className="flex-row items-center justify-between gap-3 px-1">
                  <Text
                    numberOfLines={1}
                    className="flex-1 text-sm font-semibold text-foreground dark:text-foreground-dark"
                  >
                    {buildTitle(audio.activeVerseKey)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="text-xs text-muted dark:text-muted-dark text-right"
                    style={styles.artistText}
                  >
                    {audio.reciter.name}
                  </Text>
                </View>

                {/* Controls Row */}
                <View style={styles.controlsRow}>
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      disabled={!hasPrev || !interactable}
                      onPress={audio.prevVerse}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Previous verse"
                      className="h-9 w-9 items-center justify-center rounded-full"
                      style={({ pressed }) => ({
                        opacity: !hasPrev || !interactable ? 0.35 : pressed ? 0.65 : 1,
                      })}
                    >
                      <SkipBack color={palette.text} size={18} strokeWidth={2.25} />
                    </Pressable>

                    <Pressable
                      disabled={!interactable}
                      onPress={audio.togglePlay}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={audio.isPlaying ? 'Pause audio' : 'Play audio'}
                      style={({ pressed }) => ({
                        opacity: !interactable ? 0.35 : pressed ? 0.65 : 1,
                      })}
                    >
                      <View className="h-12 w-12 items-center justify-center rounded-full bg-accent">
                        {audio.isLoading ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : audio.isPlaying ? (
                          <Pause color="#FFFFFF" size={20} strokeWidth={2.25} />
                        ) : (
                          <Play color="#FFFFFF" size={20} strokeWidth={2.25} />
                        )}
                      </View>
                    </Pressable>

                    <Pressable
                      disabled={!hasNext || !interactable}
                      onPress={audio.nextVerse}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Next verse"
                      className="h-9 w-9 items-center justify-center rounded-full"
                      style={({ pressed }) => ({
                        opacity: !hasNext || !interactable ? 0.35 : pressed ? 0.65 : 1,
                      })}
                    >
                      <SkipForward color={palette.text} size={18} strokeWidth={2.25} />
                    </Pressable>
                  </View>

                  <View style={styles.actionButtons} className="flex-row items-center">
                    <View ref={speedAnchorRef} collapsable={false}>
                      <Pressable
                        onPress={handleSpeed}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Speed"
                        className="h-8 w-10 items-center justify-center rounded-full"
                        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                      >
                        <Text className="text-xs font-bold text-foreground dark:text-foreground-dark">
                          {formatSpeedLabel(audio.playbackRate)}
                        </Text>
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={handleOptions}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Playback options"
                      className="p-2 rounded-full"
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <SlidersHorizontal color={palette.muted} size={18} strokeWidth={2.25} />
                    </Pressable>
                    <Pressable
                      onPress={handleDownload}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Download audio"
                      className="p-2 rounded-full"
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <Download color={palette.muted} size={18} strokeWidth={2.25} />
                    </Pressable>
                    <Pressable
                      onPress={audio.closePlayer}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Close player"
                      className="p-2 rounded-full"
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <X color={palette.muted} size={18} strokeWidth={2.25} />
                    </Pressable>
                  </View>
                </View>

                {/* Timeline */}
                <View className="flex-row items-center gap-3 px-1">
                  <View className="flex-1">
                    <Slider
                      value={currentSec}
                      minimumValue={0}
                      maximumValue={durationSec || 1}
                      disabled={!interactable || durationSec <= 0}
                      minimumTrackTintColor={palette.tint}
                      maximumTrackTintColor={palette.border}
                      thumbTintColor={palette.tint}
                      onSlidingStart={() => {
                        setIsSeeking(true);
                        setSeekValue(audio.positionSec);
                      }}
                      onValueChange={setSeekValue}
                      onSlidingComplete={(value) => {
                        setIsSeeking(false);
                        audio.seekRelative(value);
                      }}
                    />
                  </View>
                  <View style={styles.timeDisplay}>
                    <Text className="text-[10px] text-muted dark:text-muted-dark tabular-nums">
                      {formatTime(currentSec)}
                    </Text>
                    <Text className="text-[10px] text-muted dark:text-muted-dark tabular-nums">
                      {formatTime(durationSec)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <AnchoredDropdownModal
        isOpen={speedOpen}
        onClose={() => setSpeedOpen(false)}
        anchorRef={speedAnchorRef}
        maxHeight={220}
        minWidth={112}
      >
        <View className={isDark ? 'dark' : ''}>
          <View className="rounded-xl border border-border/30 dark:border-border-dark/20 bg-surface dark:bg-surface-dark p-1 shadow-lg">
            {SPEED_OPTIONS.map((speed) => {
              const isSelected = audio.playbackRate === speed;
              return (
                <Pressable
                  key={speed}
                  onPress={() => {
                    audio.setPlaybackRate(speed);
                    setSpeedOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Speed ${formatSpeedLabel(speed)}`}
                  className={[
                    'w-full px-3 py-2 rounded-lg',
                    isSelected ? 'bg-accent' : 'bg-transparent',
                  ].join(' ')}
                  style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                >
                  <Text
                    className={[
                      'text-sm font-semibold text-center',
                      isSelected ? 'text-on-accent' : 'text-foreground dark:text-foreground-dark',
                    ].join(' ')}
                  >
                    {formatSpeedLabel(speed)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </AnchoredDropdownModal>

      <PlaybackOptionsModal isOpen={optionsOpen} onClose={() => setOptionsOpen(false)} />
      <AudioDownloadModal isOpen={downloadOpen} onClose={() => setDownloadOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 50,
  },
  outerPadding: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  card: {
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 18,
  },
  controlsRow: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  actionButtons: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeDisplay: {
    minWidth: 72,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  artistText: {
    maxWidth: '50%',
  },
});
