import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  X,
} from 'lucide-react-native';
import React from 'react';
import RenderHTML from 'react-native-render-html';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { getItem, setItem } from '@/lib/storage/appStorage';
import type {
  DictionaryEntryDetail,
  DictionaryEntrySummary,
  DictionaryLookupResult,
  DictionarySource,
  WordAnalysis,
} from '@/src/core/domain/word-study';
import { container } from '@/src/core/infrastructure/di/container';
import type { WordReferencePackCatalogEntry } from '@/src/core/infrastructure/word-reference';

import { DictionaryGuideSheet } from './DictionaryGuideSheet';

type Palette = {
  background: string;
  surface: string;
  surfaceNavigation: string;
  text: string;
  muted: string;
  border: string;
  tint: string;
  interactive: string;
  onAccent: string;
  error: string;
};

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; entries: readonly WordReferencePackCatalogEntry[] }
  | { status: 'error'; message: string };
type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: DictionaryLookupResult }
  | { status: 'error'; message: string };
type ActiveLookupState = {
  readonly lookupKey: string;
  readonly state: LookupState;
};

const LAST_SOURCE_KEY = 'wordStudyDictionaryLastPack_v1';

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function getLookupKey(analysis: WordAnalysis): string {
  return JSON.stringify([
    analysis.lemma.status === 'available' ? analysis.lemma.value.normalized : null,
    analysis.root.status === 'available' ? analysis.root.value.normalized : null,
  ]);
}

export function DictionarySection({
  analysis,
  palette,
  isActive = true,
  isGuideOpen,
  onCloseGuide,
}: {
  analysis: WordAnalysis;
  palette: Palette;
  isActive?: boolean;
  isGuideOpen: boolean;
  onCloseGuide: () => void;
}): React.JSX.Element {
  const installer = container.getWordReferencePackInstaller();
  const repository = container.getDictionaryReferenceRepository();
  const { width } = useWindowDimensions();
  const { items, refresh: refreshDownloads } = useDownloadIndexItems({
    enabled: isActive,
    pollIntervalMs: 700,
    pollWhileEnabled: isActive,
  });
  const [catalog, setCatalog] = React.useState<CatalogState>({ status: 'loading' });
  const [sources, setSources] = React.useState<readonly DictionarySource[]>([]);
  const [selectedPackId, setSelectedPackId] = React.useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = React.useState(0);

  const loadSources = React.useCallback(async () => {
    const next = await repository.listInstalledSources();
    setSources(next);
    const remembered = await getItem(LAST_SOURCE_KEY);
    setSelectedPackId((current) => {
      const preferred = current ?? remembered;
      return next.some((source) => source.packId === preferred)
        ? preferred
        : next.find((source) => source.sourceId === 'lane-lexicon')?.packId
          ?? next[0]?.packId
          ?? null;
    });
  }, [repository]);

  const loadCatalog = React.useCallback(() => {
    setCatalog({ status: 'loading' });
    const controller = new AbortController();
    void container
      .getWordReferencePackCatalogClient()
      .listCompatiblePacksAsync(controller.signal)
      .then((entries) => setCatalog({ status: 'ready', entries }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCatalog({
            status: 'error',
            message: error instanceof Error ? error.message : 'Dictionary catalog is unavailable.',
          });
        }
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => loadCatalog(), [loadCatalog, refreshNonce]);
  React.useEffect(() => {
    void loadSources();
    return installer.subscribe(() => {
      void loadSources();
      refreshDownloads();
    });
  }, [installer, loadSources, refreshDownloads]);

  const selectSource = React.useCallback((packId: string) => {
    setSelectedPackId(packId);
    void setItem(LAST_SOURCE_KEY, packId);
  }, []);

  const installedPackIds = React.useMemo(
    () => new Set(sources.map((source) => source.packId)),
    [sources]
  );
  const catalogEntries = catalog.status === 'ready' ? catalog.entries : [];
  const downloadableEntries = catalogEntries.filter((entry) => !installedPackIds.has(entry.packId));
  const selectedSource = sources.find((source) => source.packId === selectedPackId);

  return (
    <View style={styles.section}>
      <View style={styles.toolbar}>
        <Text style={[styles.sourceLabel, { color: palette.muted }]}>DICTIONARY SOURCE</Text>
      </View>

      {sources.length > 0 && selectedPackId ? (
        <SlidingSegmentedControl
          items={sources.map((source) => ({
            key: source.packId,
            label: source.sourceId === 'lane-lexicon'
              ? 'Lane'
              : source.sourceId === 'hans-wehr'
                ? 'Hans Wehr'
                : source.title,
          }))}
          selectedKey={selectedPackId}
          width={Math.max(0, Math.min(688, width - 32))}
          onSelect={selectSource}
        />
      ) : null}

      {selectedPackId ? (
        <View>
          {sources.map((source) => (
            <DictionarySourcePanel
              key={source.packId}
              active={source.packId === selectedPackId}
              analysis={analysis}
              contentWidth={Math.max(240, Math.min(680, width - 68))}
              enabled={isActive}
              packId={source.packId}
              palette={palette}
            />
          ))}
        </View>
      ) : catalog.status === 'loading' ? (
        <LoadingCard label="Checking available dictionary packs…" palette={palette} />
      ) : catalog.status === 'error' ? (
        <StateCard
          title="Dictionary packs are not installed"
          message="Connect to the internet to view and download optional dictionary resources."
          palette={palette}
          actionLabel="Retry"
          onAction={() => setRefreshNonce((value) => value + 1)}
        />
      ) : (
        <StateCard
          title="Choose an optional dictionary"
          message="Dictionary definitions are not included with the app. Download only the English sources you want to use."
          palette={palette}
        />
      )}

      {downloadableEntries.length > 0 ? (
        <View style={styles.downloadList}>
          <Text style={[styles.subheading, { color: palette.text }]}>Available downloads</Text>
          {downloadableEntries.map((entry) => {
            const downloadItem = items.find(
              (item) =>
                item.content.kind === 'word-reference-pack' &&
                item.content.packId === entry.packId &&
                item.content.version === entry.version
            );
            return (
              <DownloadCard
                key={`${entry.packId}:${entry.version}`}
                entry={entry}
                status={downloadItem?.status}
                percent={downloadItem?.progress?.kind === 'percent' ? downloadItem.progress.percent : undefined}
                error={downloadItem?.error}
                palette={palette}
                onDownload={() => {
                  void installer.installAsync(entry).catch(() => undefined);
                }}
                onCancel={() => installer.cancel(entry.packId, entry.version)}
              />
            );
          })}
        </View>
      ) : null}
      <DictionaryGuideSheet
        isOpen={isGuideOpen}
        onClose={onCloseGuide}
        source={selectedSource}
      />
    </View>
  );
}

const DictionarySourcePanel = React.memo(function DictionarySourcePanel({
  active,
  analysis,
  contentWidth,
  enabled,
  packId,
  palette,
}: {
  active: boolean;
  analysis: WordAnalysis;
  contentWidth: number;
  enabled: boolean;
  packId: string;
  palette: Palette;
}): React.JSX.Element {
  const repository = container.getDictionaryReferenceRepository();
  const lookupKey = getLookupKey(analysis);
  const lookupCacheRef = React.useRef(new Map<string, DictionaryLookupResult>());
  const [activeLookup, setActiveLookup] = React.useState<ActiveLookupState>({
    lookupKey,
    state: { status: 'loading' },
  });
  const [expandedEntryIds, setExpandedEntryIds] = React.useState<Record<string, string | null>>({});
  const [detailsByLookupKey, setDetailsByLookupKey] = React.useState<
    Record<string, Record<string, DictionaryEntryDetail | null>>
  >({});
  const [shownRoots, setShownRoots] = React.useState<ReadonlySet<string>>(() => new Set());
  const [shownFamilies, setShownFamilies] = React.useState<ReadonlySet<string>>(() => new Set());

  const cachedResult = lookupCacheRef.current.get(lookupKey);
  const lookup: LookupState = cachedResult
    ? { status: 'ready', result: cachedResult }
    : activeLookup.lookupKey === lookupKey
      ? activeLookup.state
      : { status: 'loading' };
  const expandedEntryId = expandedEntryIds[lookupKey] ?? null;
  const details = detailsByLookupKey[lookupKey] ?? {};
  const showRoot = shownRoots.has(lookupKey);
  const showFamily = shownFamilies.has(lookupKey);

  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const loadPrimaryEntry = (result: DictionaryLookupResult) => {
      const primaryEntry = result.exactLemmaEntries[0] ?? result.rootEntries[0];
      if (!primaryEntry) return;
      setExpandedEntryIds((current) => Object.prototype.hasOwnProperty.call(current, lookupKey)
        ? current
        : { ...current, [lookupKey]: primaryEntry.entryId });
      if (details[primaryEntry.entryId] !== undefined) return;
      void repository
        .getEntry(packId, primaryEntry.entryId, primaryEntry.matchKind, {
          signal: controller.signal,
        })
        .then((detail) => {
          if (!controller.signal.aborted) {
            setDetailsByLookupKey((current) => ({
              ...current,
              [lookupKey]: {
                ...current[lookupKey],
                [primaryEntry.entryId]: detail,
              },
            }));
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setDetailsByLookupKey((current) => ({
              ...current,
              [lookupKey]: {
                ...current[lookupKey],
                [primaryEntry.entryId]: null,
              },
            }));
          }
        });
    };

    const cached = lookupCacheRef.current.get(lookupKey);
    if (cached) {
      loadPrimaryEntry(cached);
      return () => controller.abort();
    }

    setActiveLookup({ lookupKey, state: { status: 'loading' } });
    void container
      .getDictionaryReferences()
      .execute(analysis, packId, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        lookupCacheRef.current.set(lookupKey, result);
        setActiveLookup({ lookupKey, state: { status: 'ready', result } });
        loadPrimaryEntry(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setActiveLookup({
            lookupKey,
            state: {
              status: 'error',
              message: error instanceof Error ? error.message : 'Dictionary lookup failed.',
            },
          });
        }
      });
    return () => controller.abort();
  }, [analysis, enabled, lookupKey, packId, repository]);

  const toggleEntry = React.useCallback((entry: DictionaryEntrySummary) => {
    if (expandedEntryId === entry.entryId) {
      setExpandedEntryIds((current) => ({ ...current, [lookupKey]: null }));
      return;
    }
    setExpandedEntryIds((current) => ({ ...current, [lookupKey]: entry.entryId }));
    if (details[entry.entryId] !== undefined) return;
    void repository
      .getEntry(packId, entry.entryId, entry.matchKind)
      .then((detail) => setDetailsByLookupKey((current) => ({
        ...current,
        [lookupKey]: { ...current[lookupKey], [entry.entryId]: detail },
      })))
      .catch(() => setDetailsByLookupKey((current) => ({
        ...current,
        [lookupKey]: { ...current[lookupKey], [entry.entryId]: null },
      })));
  }, [details, expandedEntryId, lookupKey, packId, repository]);

  const toggleDisclosure = React.useCallback(
    (setter: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>) => {
      setter((current) => {
        const next = new Set(current);
        if (next.has(lookupKey)) next.delete(lookupKey);
        else next.add(lookupKey);
        return next;
      });
    },
    [lookupKey]
  );

  return (
    <View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      pointerEvents={active ? 'auto' : 'none'}
      style={!active ? styles.hiddenSource : undefined}
    >
      {lookup.status === 'loading' || lookup.status === 'idle' ? (
        <LoadingCard label="Looking up this lemma and root…" palette={palette} />
      ) : lookup.status === 'error' ? (
        <StateCard title="Dictionary lookup failed" message={lookup.message} palette={palette} />
      ) : (
        <DictionaryResults
          result={lookup.result}
          expandedEntryId={expandedEntryId}
          details={details}
          showRoot={showRoot}
          showFamily={showFamily}
          contentWidth={contentWidth}
          palette={palette}
          onToggleEntry={toggleEntry}
          onToggleRoot={() => toggleDisclosure(setShownRoots)}
          onToggleFamily={() => toggleDisclosure(setShownFamilies)}
        />
      )}
    </View>
  );
});

function DictionaryResults({
  result,
  expandedEntryId,
  details,
  showRoot,
  showFamily,
  contentWidth,
  palette,
  onToggleEntry,
  onToggleRoot,
  onToggleFamily,
}: {
  result: DictionaryLookupResult;
  expandedEntryId: string | null;
  details: Record<string, DictionaryEntryDetail | null>;
  showRoot: boolean;
  showFamily: boolean;
  contentWidth: number;
  palette: Palette;
  onToggleEntry: (entry: DictionaryEntrySummary) => void;
  onToggleRoot: () => void;
  onToggleFamily: () => void;
}): React.JSX.Element {
  const hasMatches =
    result.exactLemmaEntries.length > 0 ||
    result.rootEntries.length > 0 ||
    result.rootFamilyEntries.length > 0;
  const hasExactLemma = result.exactLemmaEntries.length > 0;
  const rootLabel = result.query.rootNormalized;
  const sharedEntryProps = { expandedEntryId, details, contentWidth, palette, onToggleEntry };
  return (
    <View style={styles.results}>
      {!hasMatches ? (
        <StateCard
          title="No matching entry"
          message="This source does not contain an exact lemma or matching Quran root for the selected word."
          palette={palette}
        />
      ) : null}
      {hasExactLemma ? (
        <EntryGroup
          title="Best match for this word"
          caption="Exact lemma match · the entry may contain more than one sense."
          entries={result.exactLemmaEntries}
          {...sharedEntryProps}
        />
      ) : result.rootEntries.length > 0 ? (
        <View style={[styles.fallbackNotice, { backgroundColor: palette.interactive }]}>
          <Text style={[styles.fallbackTitle, { color: palette.text }]}>No separate lemma entry in this source</Text>
          <Text style={[styles.description, { color: palette.muted }]}>The broader root meaning is shown as a fallback.</Text>
        </View>
      ) : null}
      {!hasExactLemma && result.rootEntries.length > 0 ? (
        <EntryGroup
          title="Root meaning"
          caption="Broad root entry · not necessarily the exact sense used in this ayah."
          entries={result.rootEntries}
          {...sharedEntryProps}
        />
      ) : null}

      {hasExactLemma && (result.rootEntries.length > 0 || result.rootFamilyEntries.length > 0) ? (
        <View style={styles.group}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showRoot }}
            onPress={onToggleRoot}
            style={[styles.rootToggle, { backgroundColor: palette.surfaceNavigation }]}
          >
            <View style={styles.familyCopy}>
              <Text style={[styles.groupTitle, { color: palette.text }]}>Explore the root{rootLabel ? ` · ${rootLabel}` : ''}</Text>
              <Text style={[styles.caption, { color: palette.muted }]}>Root meaning and related dictionary words</Text>
            </View>
            {showRoot ? <ChevronUp color={palette.tint} size={20} /> : <ChevronDown color={palette.tint} size={20} />}
          </Pressable>
          {showRoot ? (
            <View style={styles.rootDetails}>
              {result.rootEntries.length > 0 ? (
                <EntryGroup
                  title="Root dictionary entry"
                  caption="The broad semantic family behind the selected lemma."
                  entries={result.rootEntries}
                  {...sharedEntryProps}
                />
              ) : null}
              <RootFamilyDisclosure
                entries={result.rootFamilyEntries}
                expanded={showFamily}
                onToggle={onToggleFamily}
                {...sharedEntryProps}
              />
            </View>
          ) : null}
        </View>
      ) : !hasExactLemma ? (
        <>
          <RootFamilyDisclosure
            entries={result.rootFamilyEntries}
            expanded={showFamily}
            onToggle={onToggleFamily}
            {...sharedEntryProps}
          />
        </>
      ) : null}
    </View>
  );
}

function RootFamilyDisclosure({
  entries,
  expanded,
  onToggle,
  expandedEntryId,
  details,
  contentWidth,
  palette,
  onToggleEntry,
}: {
  entries: readonly DictionaryEntrySummary[];
  expanded: boolean;
  onToggle: () => void;
  expandedEntryId: string | null;
  details: Record<string, DictionaryEntryDetail | null>;
  contentWidth: number;
  palette: Palette;
  onToggleEntry: (entry: DictionaryEntrySummary) => void;
}): React.JSX.Element | null {
  if (!entries.length) return null;
  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={[styles.familyToggle, { backgroundColor: palette.surfaceNavigation }]}
      >
        <View style={styles.familyCopy}>
          <Text style={[styles.groupTitle, { color: palette.text }]}>Related dictionary headwords</Text>
          <Text style={[styles.caption, { color: palette.muted }]}> 
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} organized under this root
          </Text>
        </View>
        {expanded ? <ChevronUp color={palette.tint} size={20} /> : <ChevronDown color={palette.tint} size={20} />}
      </Pressable>
      {expanded ? (
        <View style={styles.entries}>
          {entries.map((entry) => (
            <EntryCard
              key={entry.entryId}
              entry={entry}
              expanded={expandedEntryId === entry.entryId}
              detail={details[entry.entryId]}
              {...{ contentWidth, palette, onToggleEntry }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function EntryGroup({
  title,
  caption,
  entries,
  ...entryProps
}: {
  title: string;
  caption?: string;
  entries: readonly DictionaryEntrySummary[];
  expandedEntryId: string | null;
  details: Record<string, DictionaryEntryDetail | null>;
  contentWidth: number;
  palette: Palette;
  onToggleEntry: (entry: DictionaryEntrySummary) => void;
}): React.JSX.Element {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeading}>
        <Text style={[styles.groupTitle, { color: entryProps.palette.text }]}>{title}</Text>
        {caption ? <Text style={[styles.caption, { color: entryProps.palette.muted }]}>{caption}</Text> : null}
      </View>
      <View style={styles.entries}>
        {entries.map((entry) => (
          <EntryCard
            key={entry.entryId}
            entry={entry}
            expanded={entryProps.expandedEntryId === entry.entryId}
            detail={entryProps.details[entry.entryId]}
            {...entryProps}
          />
        ))}
      </View>
    </View>
  );
}

function EntryCard({
  entry,
  expanded,
  detail,
  contentWidth,
  palette,
  onToggleEntry,
}: {
  entry: DictionaryEntrySummary;
  expanded: boolean;
  detail: DictionaryEntryDetail | null | undefined;
  contentWidth: number;
  palette: Palette;
  onToggleEntry: (entry: DictionaryEntrySummary) => void;
}): React.JSX.Element {
  return (
    <View style={[styles.entryCard, { backgroundColor: palette.surfaceNavigation }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${entry.headwordArabic}, ${expanded ? 'collapse' : 'open'} dictionary definition`}
        onPress={() => onToggleEntry(entry)}
        style={styles.entryHeader}
      >
        <Text style={[styles.headword, { color: palette.text }]}>{entry.headwordArabic}</Text>
        {expanded ? <ChevronUp color={palette.tint} size={19} /> : <ChevronDown color={palette.tint} size={19} />}
      </Pressable>
      {expanded ? (
        detail === undefined ? (
          <ActivityIndicator color={palette.tint} style={styles.entryLoader} />
        ) : detail === null ? (
          <Text style={[styles.definition, { color: palette.muted }]}>Definition could not be opened.</Text>
        ) : detail.definitionFormat === 'sanitized-html' ? (
          <View style={styles.definitionBody}>
            <RenderHTML
              contentWidth={contentWidth}
              source={{ html: detail.definition || '<i>Definition unavailable.</i>' }}
              baseStyle={{ color: palette.text, fontSize: 15, lineHeight: 25 }}
              tagsStyles={{ i: { fontStyle: 'italic' }, b: { fontWeight: '700' } }}
            />
          </View>
        ) : (
          <Text style={[styles.definition, styles.definitionBody, { color: palette.text }]}>
            {detail.definition || 'Definition unavailable.'}
          </Text>
        )
      ) : null}
    </View>
  );
}

function DownloadCard({ entry, status, percent, error, palette, onDownload, onCancel }: {
  entry: WordReferencePackCatalogEntry;
  status?: 'queued' | 'downloading' | 'installed' | 'failed' | 'deleting';
  percent?: number;
  error?: string;
  palette: Palette;
  onDownload: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const active = status === 'queued' || status === 'downloading';
  return (
    <View style={[styles.downloadCard, { borderColor: palette.border, backgroundColor: palette.surfaceNavigation }]}> 
      <View style={styles.familyCopy}>
        <Text style={[styles.downloadTitle, { color: palette.text }]}>{entry.title}</Text>
        <Text style={[styles.caption, { color: palette.muted }]}>English · {formatBytes(entry.databaseSizeBytes)}</Text>
        {active ? <Text style={[styles.progressText, { color: palette.tint }]}>{percent ?? 0}% downloaded</Text> : null}
        {status === 'failed' && error ? (
          <View style={styles.errorRow}>
            <AlertCircle color={palette.error} size={13} />
            <Text numberOfLines={2} style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? `Cancel ${entry.title} download` : `Download ${entry.title}`}
        onPress={active ? onCancel : onDownload}
        style={[styles.downloadButton, { backgroundColor: active ? palette.interactive : palette.tint }]}
      >
        {active ? <X color={palette.text} size={18} /> : status === 'failed' ? <RefreshCw color={palette.onAccent} size={18} /> : <Download color={palette.onAccent} size={18} />}
      </Pressable>
    </View>
  );
}

function LoadingCard({ label, palette }: { label: string; palette: Palette }): React.JSX.Element {
  return (
    <View style={[styles.stateCard, { borderColor: palette.border, backgroundColor: palette.surfaceNavigation }]}> 
      <ActivityIndicator color={palette.tint} />
      <Text style={[styles.description, { color: palette.muted }]}>{label}</Text>
    </View>
  );
}

function StateCard({ title, message, palette, actionLabel, onAction }: {
  title: string;
  message: string;
  palette: Palette;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <View style={[styles.stateCard, { borderColor: palette.border, backgroundColor: palette.surfaceNavigation }]}> 
      <Text style={[styles.stateTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.description, { color: palette.muted }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.retryButton}>
          <RefreshCw color={palette.tint} size={16} />
          <Text style={[styles.retryText, { color: palette.tint }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 16 },
  hiddenSource: { display: 'none' },
  toolbar: { minHeight: 34, paddingLeft: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sourceLabel: { fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 0.9 },
  infoButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  subheading: { fontSize: 16, lineHeight: 23, fontWeight: '700' },
  description: { fontSize: 13, lineHeight: 20 },
  results: { gap: 16 },
  group: { gap: 9 },
  groupHeading: { gap: 2, paddingHorizontal: 2 },
  groupTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  caption: { fontSize: 11, lineHeight: 17 },
  entries: { gap: 8 },
  entryCard: { borderRadius: 18, overflow: 'hidden' },
  entryHeader: { minHeight: 56, paddingHorizontal: 15, paddingVertical: 9, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headword: { flex: 1, fontFamily: 'UthmanicHafs1Ver18', fontSize: 24, lineHeight: 36, writingDirection: 'rtl', textAlign: 'right' },
  definitionBody: { paddingHorizontal: 15, paddingVertical: 13 },
  definition: { fontSize: 15, lineHeight: 25 },
  entryLoader: { paddingVertical: 20 },
  fallbackNotice: { borderRadius: 16, paddingHorizontal: 15, paddingVertical: 13, gap: 3 },
  fallbackTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  rootToggle: { minHeight: 68, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rootDetails: { paddingTop: 4, gap: 16 },
  familyToggle: { minHeight: 66, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  familyCopy: { flex: 1, gap: 2 },
  downloadList: { gap: 10 },
  downloadCard: { minHeight: 82, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  downloadTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  downloadButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  progressText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorRow: { marginTop: 3, flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  errorText: { flex: 1, fontSize: 10, lineHeight: 15 },
  stateCard: { minHeight: 126, borderWidth: 1, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 20, alignItems: 'center', justifyContent: 'center', gap: 8 },
  stateTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700', textAlign: 'center' },
  retryButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7 },
  retryText: { fontSize: 13, fontWeight: '700' },
});
