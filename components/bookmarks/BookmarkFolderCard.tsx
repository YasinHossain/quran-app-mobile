import { Clock, Folder as FolderIcon, MoreHorizontal } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import { resolveFolderAccentColor } from '@/components/bookmarks/folderColor';

import type { Folder } from '@/types';

const formatUpdatedAt = (timestamp: number): string | null => {
  if (!timestamp || timestamp <= 0) return null;
  const date = new Date(timestamp);
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  } catch {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
};

export function BookmarkFolderCard({
  folder,
  onPress,
  onOpenOptions,
}: {
  folder: Folder;
  onPress: () => void;
  onOpenOptions: () => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const bookmarks = folder.bookmarks ?? [];
  const bookmarkCount = bookmarks.length;
  const versePreview = bookmarks.slice(0, 2);
  const remainingCount = Math.max(0, bookmarkCount - versePreview.length);
  const latestBookmarkTimestamp = bookmarks.reduce(
    (latest, bookmark) => Math.max(latest, bookmark.createdAt ?? 0),
    0
  );
  const updatedAtLabel = formatUpdatedAt(latestBookmarkTimestamp);

  const accentColor = resolveFolderAccentColor(folder.color);
  const previewLabels = versePreview.map((bookmark) => String(bookmark.verseKey || bookmark.verseId));
  if (remainingCount > 0) {
    previewLabels.push(`+${remainingCount}`);
  }

  return (
    <View
      style={{
        width: '100%',
        height: 110,
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={folder.name}
        className="w-full h-full rounded-lg border border-border/50 bg-surface dark:border-border-dark/40 dark:bg-surface-dark"
        style={({ pressed }) => ({
          flex: 1,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 10,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              minWidth: 0,
            }}
          >
            <View
              className="items-center justify-center rounded-full"
              style={{
                height: 44,
                width: 44,
                backgroundColor: accentColor,
              }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <FolderIcon size={22} strokeWidth={2.25} color="#FFFFFF" />
            </View>

            <View style={{ flex: 1, minWidth: 0, marginLeft: 12, marginRight: 8, marginTop: 4 }}>
              <Text
                numberOfLines={1}
                className="text-lg font-semibold text-foreground dark:text-foreground-dark"
              >
                {folder.name}
              </Text>
              <Text className="mt-1 text-sm font-medium text-muted dark:text-muted-dark">
                {bookmarkCount} {bookmarkCount === 1 ? 'verse' : 'verses'}
              </Text>
            </View>

            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onOpenOptions();
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Folder options"
              className="rounded-full p-1.5"
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                marginTop: -2,
              })}
            >
              <MoreHorizontal size={18} strokeWidth={2.25} color={palette.muted} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 24 }}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>
              {previewLabels.length > 0 ? (
                previewLabels
                  .slice(0, 3)
                  .map((label, index) => <PreviewChip key={`${label}-${index}`}>{label}</PreviewChip>)
              ) : (
                <View style={{ height: 22 }} />
              )}
            </View>

            <View style={{ marginLeft: 8, minWidth: 62, alignItems: 'flex-end' }}>
              {updatedAtLabel ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Clock size={14} strokeWidth={2.25} color={palette.muted} />
                  <Text
                    numberOfLines={1}
                    className="text-muted/80 dark:text-muted-dark/80 font-medium"
                    style={{ marginLeft: 4, fontSize: 11 }}
                  >
                    {updatedAtLabel}
                  </Text>
                </View>
              ) : (
                <View style={{ height: 14 }} />
              )}
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function PreviewChip({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <View
      className="bg-surface dark:bg-surface-dark border border-border/40 dark:border-border-dark/40"
      style={{
        maxWidth: 92,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginRight: 6,
        borderRadius: 4,
      }}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{ fontSize: 11, maxWidth: 72 }}
        className="font-medium text-muted dark:text-muted-dark"
      >
        {children}
      </Text>
    </View>
  );
}
