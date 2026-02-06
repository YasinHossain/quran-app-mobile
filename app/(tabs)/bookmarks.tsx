import {
  Bookmark as BookmarkIcon,
  Calendar,
  Clock,
  Pin,
  Plus,
  Settings,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  ActivityIndicator,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native';

import { DeleteFolderModal } from '@/components/bookmarks/DeleteFolderModal';
import { FolderSettingsModal } from '@/components/bookmarks/FolderSettingsModal';
import { CreatePlannerModal, PlannerSection } from '@/components/bookmarks/planner';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { VerseCard } from '@/components/surah/VerseCard';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Bookmark, Folder } from '@/types';

type SectionId = 'bookmarks' | 'pinned' | 'last-read' | 'planner';

function parseVerseKey(verseKey: string): { surahId: string; ayahId: string } | null {
  const normalized = verseKey.trim();
  const parts = normalized.split(':');
  if (parts.length !== 2) return null;
  const [surahId, ayahId] = parts;
  if (!surahId || !ayahId) return null;
  const s = Number(surahId);
  const a = Number(ayahId);
  if (!Number.isFinite(s) || !Number.isFinite(a) || s <= 0 || a <= 0) return null;
  return { surahId: String(s), ayahId: String(a) };
}

function getBookmarkVerseKey(bookmark: Bookmark): string | null {
  if (bookmark.verseKey && bookmark.verseKey.includes(':')) return bookmark.verseKey;
  const id = String(bookmark.verseId);
  if (id.includes(':')) return id;
  return null;
}

export default function BookmarksScreen(): React.JSX.Element {
  const router = useRouter();
  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const { settings } = useSettings();
  const {
    folders,
    pinnedVerses,
    planner,
    isHydrated,
    deleteFolder,
    removeBookmark,
    togglePinned,
    isPinned,
    removeFromPlanner,
  } = useBookmarks();

  const [activeSection, setActiveSection] = React.useState<SectionId>('bookmarks');
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [activeVerse, setActiveVerse] = React.useState<{
    title: string;
    verseKey: string;
    verseText: string;
    translationText?: string;
    isPinned: boolean;
    showRemove: boolean;
    onBookmark: () => void;
  } | null>(null);

  const [isFolderSettingsOpen, setIsFolderSettingsOpen] = React.useState(false);
  const [folderSettingsMode, setFolderSettingsMode] = React.useState<'create' | 'edit'>('create');
  const [folderForSettings, setFolderForSettings] = React.useState<Folder | null>(null);

  const [isDeleteFolderOpen, setIsDeleteFolderOpen] = React.useState(false);
  const [folderForDelete, setFolderForDelete] = React.useState<Folder | null>(null);

  const [isCreatePlannerOpen, setIsCreatePlannerOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] = React.useState<VerseSummaryDetails | null>(
    null
  );

  const sortedFolders = React.useMemo(() => {
    const items = [...folders];
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [folders]);

  const selectedFolder = React.useMemo(() => {
    if (!selectedFolderId) return null;
    return folders.find((f) => f.id === selectedFolderId) ?? null;
  }, [folders, selectedFolderId]);

  const closeVerseActions = React.useCallback(() => {
    setIsVerseActionsOpen(false);
    setActiveVerse(null);
  }, []);

  const navigateToVerse = React.useCallback(
    (verseKey: string) => {
      const parsed = parseVerseKey(verseKey);
      if (!parsed) return;
      router.push({
        pathname: '/surah/[surahId]',
        params: { surahId: parsed.surahId, startVerse: parsed.ayahId },
      });
    },
    [router]
  );

  const openTafsir = React.useCallback(
    (verseKey: string) => {
      const parsed = parseVerseKey(verseKey);
      if (!parsed) return;
      router.push({
        pathname: '/tafsir/[surahId]/[ayahId]',
        params: { surahId: parsed.surahId, ayahId: parsed.ayahId },
      });
    },
    [router]
  );

  const openVerseActionsForBookmark = React.useCallback(
    (bookmark: Bookmark, opts: { title: string; onRemove: () => void }) => {
      const verseKey = getBookmarkVerseKey(bookmark);
      if (!verseKey) return;

      setActiveVerse({
        title: opts.title,
        verseKey,
        verseText: bookmark.verseText ?? '',
        translationText: bookmark.translation,
        isPinned: isPinned(String(bookmark.verseId)) || isPinned(verseKey),
        showRemove: true,
        onBookmark: opts.onRemove,
      });
      setIsVerseActionsOpen(true);
    },
    [isPinned]
  );

  const handlePlayPause = React.useCallback(() => {
    Alert.alert('Audio coming soon', 'Audio playback will be added next.');
  }, []);

  const handleAddToPlan = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;
    const parsed = parseVerseKey(verseKey);
    if (!parsed) return;
    const surahNumber = Number(parsed.surahId);

    setPlannerVerseSummary({
      verseKey,
      ...(Number.isFinite(surahNumber) && surahNumber > 0 ? { surahId: surahNumber } : {}),
      arabicText: activeVerse?.verseText,
      translationText: activeVerse?.translationText,
    });
    setIsAddToPlannerOpen(true);
  }, [activeVerse?.translationText, activeVerse?.verseKey, activeVerse?.verseText]);

  const handleShare = React.useCallback(async () => {
    if (!activeVerse) return;
    const lines = [
      activeVerse.title ? `${activeVerse.title} ${activeVerse.verseKey}` : activeVerse.verseKey,
      '',
      activeVerse.verseText,
      '',
      ...(activeVerse.translationText ? [activeVerse.translationText] : []),
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // Ignore.
    }
  }, [activeVerse]);

  const openCreateFolderModal = React.useCallback(() => {
    setFolderSettingsMode('create');
    setFolderForSettings(null);
    setIsFolderSettingsOpen(true);
  }, []);

  const openEditFolderModal = React.useCallback((folder: Folder) => {
    setFolderSettingsMode('edit');
    setFolderForSettings(folder);
    setIsFolderSettingsOpen(true);
  }, []);

  const closeFolderSettingsModal = React.useCallback(() => {
    setIsFolderSettingsOpen(false);
  }, []);

  const openDeleteFolderModal = React.useCallback((folder: Folder) => {
    setFolderForDelete(folder);
    setIsDeleteFolderOpen(true);
  }, []);

  const closeDeleteFolderModal = React.useCallback(() => {
    setIsDeleteFolderOpen(false);
  }, []);

  const handleConfirmDeleteFolder = React.useCallback(
    (folderId: string) => {
      deleteFolder(folderId);
      setSelectedFolderId(null);
      setIsDeleteFolderOpen(false);
      setFolderForDelete(null);
    },
    [deleteFolder]
  );

  const handleCreatePlannerPlan = React.useCallback(() => {
    setIsCreatePlannerOpen(true);
  }, []);

  const handleDeletePlannerPlan = React.useCallback(
    (planIds: string[]) => {
      const uniqueIds = Array.from(new Set(planIds)).filter((id) => id.trim().length > 0);
      if (uniqueIds.length === 0) return;
      Alert.alert(
        'Delete Planner',
        'This action cannot be undone.\n\nAre you sure you want to permanently delete this planner?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              uniqueIds.forEach((id) => removeFromPlanner(id));
            },
          },
        ]
      );
    },
    [removeFromPlanner]
  );

  const showFolderList = activeSection === 'bookmarks' && !selectedFolderId;
  const showFolderDetail = activeSection === 'bookmarks' && Boolean(selectedFolderId);

  const navigationSections = React.useMemo(
    () =>
      [
        { id: 'last-read' as const, icon: Clock, label: 'Recent', description: 'Last visited' },
        {
          id: 'bookmarks' as const,
          icon: BookmarkIcon,
          label: 'All Bookmarks',
          description: 'Manage folders',
        },
        {
          id: 'pinned' as const,
          icon: Pin,
          label: 'Pinned Verses',
          description: 'Quick access',
        },
        { id: 'planner' as const, icon: Calendar, label: 'Planner', description: 'Track progress' },
      ] satisfies Array<{
        id: SectionId;
        icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
        label: string;
        description: string;
      }>,
    []
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <View className="px-4 pt-4 pb-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-semibold text-foreground dark:text-foreground-dark">
            Bookmarks
          </Text>
          <Pressable
            onPress={() => setIsSettingsOpen(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Settings color={palette.text} size={22} strokeWidth={2.25} />
          </Pressable>
        </View>

        <View className="mt-3 gap-2">
          {navigationSections.map((section) => {
            const isActive = activeSection === section.id;
            const Icon = section.icon;
            return (
              <Pressable
                key={section.id}
                onPress={() => {
                  setActiveSection(section.id);
                  setSelectedFolderId(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={section.label}
                className={[
                  'flex-row items-center gap-3 rounded-xl border px-3 py-3',
                  isActive
                    ? 'bg-accent border-accent'
                    : 'bg-surface dark:bg-surface-dark border-border dark:border-border-dark',
                ].join(' ')}
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <View
                  className={[
                    'h-8 w-8 rounded-lg items-center justify-center',
                    isActive ? 'bg-on-accent/20' : 'bg-interactive dark:bg-interactive-dark',
                  ].join(' ')}
                >
                  <Icon
                    size={16}
                    strokeWidth={2.25}
                    color={isActive ? '#FFFFFF' : palette.muted}
                  />
                </View>
                <View className="flex-1 min-w-0">
                  <Text
                    numberOfLines={1}
                    className={[
                      'text-sm font-semibold',
                      isActive ? 'text-on-accent' : 'text-foreground dark:text-foreground-dark',
                    ].join(' ')}
                  >
                    {section.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className={[
                      'text-xs',
                      isActive ? 'text-on-accent/80' : 'text-muted dark:text-muted-dark',
                    ].join(' ')}
                  >
                    {section.description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {!isHydrated ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.text} />
          <Text className="mt-2 text-sm text-muted dark:text-muted-dark">Loading…</Text>
        </View>
      ) : showFolderList ? (
        <FlashList
          data={sortedFolders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListHeaderComponent={
            <View className="pt-2 pb-3">
              <View className="mb-3 flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View className="h-9 w-9 rounded-xl bg-accent items-center justify-center">
                    <BookmarkIcon size={20} strokeWidth={2.25} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">
                      All Bookmarks
                    </Text>
                    <Text className="text-xs text-muted dark:text-muted-dark">Manage folders</Text>
                  </View>
                </View>

                <Pressable
                  onPress={openCreateFolderModal}
                  accessibilityRole="button"
                  accessibilityLabel="Create Folder"
                  className="h-10 w-10 items-center justify-center rounded-xl bg-accent"
                  style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                >
                  <Plus size={20} strokeWidth={2.25} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View className="items-center py-16">
              <View className="h-16 w-16 rounded-full bg-surface dark:bg-surface-dark items-center justify-center mb-4">
                <BookmarkIcon size={32} strokeWidth={2.25} color={palette.muted} />
              </View>
              <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark mb-2">
                Create Your First Folder
              </Text>
              <Text className="text-muted dark:text-muted-dark text-center px-6">
                Tap the + button in the top-right corner to add a folder and start organizing your
                favorite verses.
              </Text>
            </View>
          }
          renderItem={({ item: folder }) => (
            <Pressable
              onPress={() => {
                setSelectedFolderId(folder.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={folder.name}
              className="rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark px-4 py-4"
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
                {folder.name}
              </Text>
              <Text className="mt-1 text-sm text-muted dark:text-muted-dark">
                {folder.bookmarks.length} {folder.bookmarks.length === 1 ? 'Verse' : 'Verses'}
              </Text>
            </Pressable>
          )}
        />
      ) : showFolderDetail && selectedFolder ? (
        <FlashList
          data={selectedFolder.bookmarks}
          keyExtractor={(item) => `${item.verseId}-${item.createdAt}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListHeaderComponent={
            <View className="pt-2 pb-3">
              <Pressable
                onPress={() => setSelectedFolderId(null)}
                accessibilityRole="button"
                accessibilityLabel="Back"
                className="self-start rounded-lg bg-interactive dark:bg-interactive-dark px-3 py-2"
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                  Back
                </Text>
              </Pressable>

              <View className="mt-3 flex-row items-center justify-between gap-3">
                <Text
                  numberOfLines={2}
                  className="flex-1 text-lg font-bold text-foreground dark:text-foreground-dark"
                >
                  {selectedFolder.name}
                </Text>

                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => openEditFolderModal(selectedFolder)}
                    accessibilityRole="button"
                    accessibilityLabel="Edit Folder"
                    className="h-10 w-10 items-center justify-center rounded-xl bg-interactive dark:bg-interactive-dark"
                    style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                  >
                    <SlidersHorizontal size={18} strokeWidth={2.25} color={palette.muted} />
                  </Pressable>
                  <Pressable
                    onPress={() => openDeleteFolderModal(selectedFolder)}
                    accessibilityRole="button"
                    accessibilityLabel="Delete Folder"
                    className="h-10 w-10 items-center justify-center rounded-xl bg-error/10 border border-error/20"
                    style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                  >
                    <Trash2
                      size={18}
                      strokeWidth={2.25}
                      color={isDark ? '#F87171' : '#DC2626'}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20 px-6">
              <Text className="text-center text-muted dark:text-muted-dark">
                No verses in this folder
              </Text>
            </View>
          }
          renderItem={({ item: bookmark }) => {
            const verseKey = getBookmarkVerseKey(bookmark);
            if (!verseKey) return null;

            return (
              <VerseCard
                verseKey={verseKey}
                arabicText={bookmark.verseText ?? ''}
                translationTexts={bookmark.translation ? [bookmark.translation] : []}
                arabicFontSize={settings.arabicFontSize}
                arabicFontFace={settings.arabicFontFace}
                translationFontSize={settings.translationFontSize}
                showByWords={settings.showByWords}
                onPress={() => navigateToVerse(verseKey)}
                onOpenActions={() =>
                  openVerseActionsForBookmark(bookmark, {
                    title: bookmark.surahName ?? 'Surah',
                    onRemove: () => removeBookmark(String(bookmark.verseId), selectedFolder.id),
                  })
                }
              />
            );
          }}
        />
      ) : activeSection === 'pinned' ? (
        <FlashList
          data={pinnedVerses}
          keyExtractor={(item) => `pinned-${item.verseId}-${item.createdAt}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListHeaderComponent={
            <View className="pt-2 pb-3">
              <View className="mb-3 flex-row items-center gap-3">
                <View className="h-9 w-9 rounded-xl bg-accent items-center justify-center">
                  <Pin size={20} strokeWidth={2.25} color="#FFFFFF" />
                </View>
                <View>
                  <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">
                    Pinned Verses
                  </Text>
                  <Text className="text-xs text-muted dark:text-muted-dark">Quick access</Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View className="items-center py-16">
              <View className="h-16 w-16 rounded-full bg-surface dark:bg-surface-dark items-center justify-center mb-4">
                <Pin size={32} strokeWidth={2.25} color={palette.muted} />
              </View>
              <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark mb-2">
                No Pinned Verses
              </Text>
              <Text className="text-muted dark:text-muted-dark text-center px-6">
                Pin your favorite verses while reading to access them quickly from here.
              </Text>
            </View>
          }
          renderItem={({ item: bookmark }) => {
            const verseKey = getBookmarkVerseKey(bookmark);
            if (!verseKey) return null;
            return (
              <VerseCard
                verseKey={verseKey}
                arabicText={bookmark.verseText ?? ''}
                translationTexts={bookmark.translation ? [bookmark.translation] : []}
                arabicFontSize={settings.arabicFontSize}
                arabicFontFace={settings.arabicFontFace}
                translationFontSize={settings.translationFontSize}
                showByWords={settings.showByWords}
                onPress={() => navigateToVerse(verseKey)}
                onOpenActions={() =>
                  openVerseActionsForBookmark(bookmark, {
                    title: bookmark.surahName ?? 'Surah',
                    onRemove: () =>
                      togglePinned(
                        String(bookmark.verseId),
                        bookmark.verseKey ? { verseKey: bookmark.verseKey } : undefined
                      ),
                  })
                }
              />
            );
          }}
        />
      ) : activeSection === 'planner' ? (
        <PlannerSection
          planner={planner}
          onCreatePlan={handleCreatePlannerPlan}
          onDeletePlan={handleDeletePlannerPlan}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark">
            Coming soon
          </Text>
          <Text className="mt-2 text-center text-sm text-muted dark:text-muted-dark">
            This section will be added next.
          </Text>
        </View>
      )}

      <VerseActionsSheet
        isOpen={isVerseActionsOpen}
        onClose={closeVerseActions}
        title={activeVerse?.title ?? 'Surah'}
        verseKey={activeVerse?.verseKey ?? ''}
        isBookmarked={activeVerse?.isPinned ?? false}
        showRemove={activeVerse?.showRemove ?? false}
        onPlayPause={activeVerse ? handlePlayPause : undefined}
        onOpenTafsir={activeVerse?.verseKey ? () => openTafsir(activeVerse.verseKey) : undefined}
        onBookmark={activeVerse?.onBookmark}
        onAddToPlan={activeVerse ? handleAddToPlan : undefined}
        onShare={activeVerse ? handleShare : undefined}
      />

      <SettingsSidebar
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        pageType="bookmarks"
      />

      <FolderSettingsModal
        isOpen={isFolderSettingsOpen}
        onClose={closeFolderSettingsModal}
        folder={folderForSettings}
        mode={folderSettingsMode}
      />

      <DeleteFolderModal
        isOpen={isDeleteFolderOpen}
        onClose={closeDeleteFolderModal}
        folder={folderForDelete}
        onConfirmDelete={handleConfirmDeleteFolder}
      />

      <CreatePlannerModal isOpen={isCreatePlannerOpen} onClose={() => setIsCreatePlannerOpen(false)} />

      {plannerVerseSummary ? (
        <AddToPlannerModal
          isOpen={isAddToPlannerOpen}
          onClose={() => setIsAddToPlannerOpen(false)}
          verseSummary={plannerVerseSummary}
        />
      ) : null}
    </View>
  );
}
