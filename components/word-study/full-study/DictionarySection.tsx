import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  RefreshCw,
  X,
} from 'lucide-react-native';
import React from 'react';
import RenderHTML from 'react-native-render-html';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

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

type Palette = {
  background: string;
  surface: string;
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

const LAST_SOURCE_KEY = 'wordStudyDictionaryLastPack_v1';

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function DictionarySection({
  analysis,
  palette,
}: {
  analysis: WordAnalysis;
  palette: Palette;
}): React.JSX.Element {
  const installer = container.getWordReferencePackInstaller();
  const repository = container.getDictionaryReferenceRepository();
  const { width } = useWindowDimensions();
  const { items, refresh: refreshDownloads } = useDownloadIndexItems({
    enabled: true,
    pollIntervalMs: 700,
    pollWhileEnabled: true,
  });
  const [catalog, setCatalog] = React.useState<CatalogState>({ status: 'loading' });
  const [sources, setSources] = React.useState<readonly DictionarySource[]>([]);
  const [selectedPackId, setSelectedPackId] = React.useState<string | null>(null);
  const [lookup, setLookup] = React.useState<LookupState>({ status: 'idle' });
  const [expandedEntryId, setExpandedEntryId] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<Record<string, DictionaryEntryDetail | null>>({});
  const [showFamily, setShowFamily] = React.useState(false);
  const [refreshNonce, setRefreshNonce] = React.useState(0);

  const loadSources = React.useCallback(async () => {
    const next = await repository.listInstalledSources();
    setSources(next);
    const remembered = await getItem(LAST_SOURCE_KEY);
    setSelectedPackId((current) => {
      const preferred = current ?? remembered;
      return next.some((source) => source.packId === preferred)
        ? preferred
        : next[0]?.packId ?? null;
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

  React.useEffect(() => {
    if (!selectedPackId) {
      setLookup({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setLookup({ status: 'loading' });
    setExpandedEntryId(null);
    setDetails({});
    setShowFamily(false);
    void container
      .getDictionaryReferences()
      .execute(analysis, selectedPackId, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setLookup({ status: 'ready', result });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLookup({
            status: 'error',
            message: error instanceof Error ? error.message : 'Dictionary lookup failed.',
          });
        }
      });
    return () => controller.abort();
  }, [analysis, selectedPackId]);

  const selectSource = React.useCallback((packId: string) => {
    setSelectedPackId(packId);
    void setItem(LAST_SOURCE_KEY, packId);
  }, []);

  const toggleEntry = React.useCallback(
    (entry: DictionaryEntrySummary) => {
      if (expandedEntryId === entry.entryId) {
        setExpandedEntryId(null);
        return;
      }
      setExpandedEntryId(entry.entryId);
      if (details[entry.entryId] !== undefined || !selectedPackId) return;
      void repository
        .getEntry(selectedPackId, entry.entryId, entry.matchKind)
        .then((detail) => setDetails((current) => ({ ...current, [entry.entryId]: detail })))
        .catch(() => setDetails((current) => ({ ...current, [entry.entryId]: null })));
    },
    [details, expandedEntryId, repository, selectedPackId]
  );

  const installedPackIds = React.useMemo(
    () => new Set(sources.map((source) => source.packId)),
    [sources]
  );
  const catalogEntries = catalog.status === 'ready' ? catalog.entries : [];
  const downloadableEntries = catalogEntries.filter((entry) => !installedPackIds.has(entry.packId));

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: palette.text }]}>Dictionary</Text>
        <Text style={[styles.description, { color: palette.muted }]}> 
          Contextual meaning remains in Overview. These are cited lexicon entries for the lemma and root.
        </Text>
      </View>

      {sources.length > 0 ? (
        <View accessibilityRole="tablist" style={styles.sourceRow}>
          {sources.map((source) => {
            const selected = source.packId === selectedPackId;
            return (
              <Pressable
                key={source.packId}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => selectSource(source.packId)}
                style={[
                  styles.sourceChip,
                  {
                    borderColor: selected ? palette.tint : palette.border,
                    backgroundColor: selected ? palette.tint : palette.surface,
                  },
                ]}
              >
                {selected ? <Check color={palette.onAccent} size={14} /> : null}
                <Text style={[styles.sourceChipText, { color: selected ? palette.onAccent : palette.text }]}> 
                  {source.sourceId === 'lane-lexicon' ? 'Lane' : source.sourceId === 'hans-wehr' ? 'Hans Wehr' : source.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {selectedPackId ? (
        lookup.status === 'loading' || lookup.status === 'idle' ? (
          <LoadingCard label="Looking up this lemma and root…" palette={palette} />
        ) : lookup.status === 'error' ? (
          <StateCard title="Dictionary lookup failed" message={lookup.message} palette={palette} />
        ) : (
          <DictionaryResults
            result={lookup.result}
            expandedEntryId={expandedEntryId}
            details={details}
            showFamily={showFamily}
            contentWidth={Math.max(240, Math.min(680, width - 68))}
            palette={palette}
            onToggleEntry={toggleEntry}
            onToggleFamily={() => setShowFamily((value) => !value)}
          />
        )
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
    </View>
  );
}

function DictionaryResults({
  result,
  expandedEntryId,
  details,
  showFamily,
  contentWidth,
  palette,
  onToggleEntry,
  onToggleFamily,
}: {
  result: DictionaryLookupResult;
  expandedEntryId: string | null;
  details: Record<string, DictionaryEntryDetail | null>;
  showFamily: boolean;
  contentWidth: number;
  palette: Palette;
  onToggleEntry: (entry: DictionaryEntrySummary) => void;
  onToggleFamily: () => void;
}): React.JSX.Element {
  const hasMatches =
    result.exactLemmaEntries.length > 0 ||
    result.rootEntries.length > 0 ||
    result.rootFamilyEntries.length > 0;
  return (
    <View style={styles.results}>
      {!hasMatches ? (
        <StateCard
          title="No matching entry"
          message="This source does not contain an exact lemma or matching Quran root for the selected word."
          palette={palette}
        />
      ) : null}
      {result.exactLemmaEntries.length > 0 ? (
        <EntryGroup
          title="Matching headword"
          caption="Exact normalized lemma match; the source may still contain more than one sense."
          entries={result.exactLemmaEntries}
          {...{ expandedEntryId, details, contentWidth, palette, onToggleEntry }}
        />
      ) : result.rootEntries.length > 0 ? (
        <Text style={[styles.description, { color: palette.muted }]}> 
          No exact headword matched this lemma. Showing its root article and family instead.
        </Text>
      ) : null}
      {result.rootEntries.length > 0 ? (
        <EntryGroup
          title="Root article"
          entries={result.rootEntries}
          {...{ expandedEntryId, details, contentWidth, palette, onToggleEntry }}
        />
      ) : null}
      {result.rootFamilyEntries.length > 0 ? (
        <View style={styles.group}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showFamily }}
            onPress={onToggleFamily}
            style={[styles.familyToggle, { borderColor: palette.border, backgroundColor: palette.surface }]}
          >
            <View style={styles.familyCopy}>
              <Text style={[styles.groupTitle, { color: palette.text }]}>Complete root family</Text>
              <Text style={[styles.caption, { color: palette.muted }]}> 
                {result.rootFamilyEntries.length} related source headwords
              </Text>
            </View>
            {showFamily ? <ChevronUp color={palette.tint} size={20} /> : <ChevronDown color={palette.tint} size={20} />}
          </Pressable>
          {showFamily ? (
            <View style={styles.entries}>
              {result.rootFamilyEntries.map((entry) => (
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
      ) : null}
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(result.source.url)}
        style={[styles.attribution, { borderColor: palette.border }]}
      >
        <View style={styles.familyCopy}>
          <Text style={[styles.attributionTitle, { color: palette.text }]}>{result.source.title}</Text>
          <Text style={[styles.caption, { color: palette.muted }]}> 
            English · {result.source.version} · {result.source.attribution}
          </Text>
        </View>
        <ExternalLink color={palette.tint} size={17} />
      </Pressable>
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
    <View style={[styles.entryCard, { borderColor: palette.border, backgroundColor: palette.surface }]}> 
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
          <View style={[styles.definitionBody, { borderTopColor: palette.border }]}> 
            <RenderHTML
              contentWidth={contentWidth}
              source={{ html: detail.definition || '<i>Definition unavailable.</i>' }}
              baseStyle={{ color: palette.text, fontSize: 15, lineHeight: 25 }}
              tagsStyles={{ i: { fontStyle: 'italic' }, b: { fontWeight: '700' } }}
            />
          </View>
        ) : (
          <Text style={[styles.definition, styles.definitionBody, { color: palette.text, borderTopColor: palette.border }]}> 
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
    <View style={[styles.downloadCard, { borderColor: palette.border, backgroundColor: palette.surface }]}> 
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
    <View style={[styles.stateCard, { borderColor: palette.border, backgroundColor: palette.surface }]}> 
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
    <View style={[styles.stateCard, { borderColor: palette.border, backgroundColor: palette.surface }]}> 
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
  heading: { gap: 4, paddingHorizontal: 2 },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  subheading: { fontSize: 16, lineHeight: 23, fontWeight: '700' },
  description: { fontSize: 13, lineHeight: 20 },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourceChip: { minHeight: 40, paddingHorizontal: 14, borderWidth: 1, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  sourceChipText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  results: { gap: 16 },
  group: { gap: 9 },
  groupHeading: { gap: 2, paddingHorizontal: 2 },
  groupTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  caption: { fontSize: 11, lineHeight: 17 },
  entries: { gap: 8 },
  entryCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  entryHeader: { minHeight: 56, paddingHorizontal: 15, paddingVertical: 9, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headword: { flex: 1, fontFamily: 'UthmanicHafs1Ver18', fontSize: 24, lineHeight: 36, writingDirection: 'rtl', textAlign: 'right' },
  definitionBody: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 15, paddingVertical: 13 },
  definition: { fontSize: 15, lineHeight: 25 },
  entryLoader: { paddingVertical: 20 },
  familyToggle: { minHeight: 66, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  familyCopy: { flex: 1, gap: 2 },
  attribution: { minHeight: 68, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  attributionTitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
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
