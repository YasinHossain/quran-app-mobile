import React from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Network from 'expo-network';

import { getNetworkSurahTranslationCached, invalidateNetworkSurahTranslationCache, peekNetworkSurahTranslationSnapshot } from '@/lib/surah/surahTranslationNetworkCache';
import { buildReaderTranslationRecovery, type ReaderTranslationRecovery } from '@/lib/surah/readerTranslationRecovery';

let offlineNoticeDismissed = false;

/** Recovery is active only for missing translations on the focused reader. No polling. */
export function useReaderTranslationRecovery({
  surahId, translationIds, missingTranslationIds, verseCount, enabled,
}: {
  surahId: number;
  translationIds: number[];
  missingTranslationIds: number[];
  verseCount: number;
  enabled: boolean;
}) {
  const selectionKey = translationIds.join(',');
  const missingKey = missingTranslationIds.join(',');
  const key = `${surahId}|${selectionKey}|${missingKey}|${verseCount}`;
  const [result, setResult] = React.useState<{
    key: string;
    recovery?: ReaderTranslationRecovery;
    state: 'loading' | 'offline' | 'error' | 'ready';
  }>({ key, state: 'loading' });
  const [dismissed, setDismissed] = React.useState(offlineNoticeDismissed);
  const [retryGeneration, retry] = React.useReducer((value: number) => value + 1, 0);

  const complete = result.key === key && result.state === 'ready';
  useFocusEffect(React.useCallback(() => {
    if (complete || !enabled || !missingKey || verseCount <= 0) return;
    let disposed = false;
    let pending = false;
    let retryAfterPending = false;
    let recoveredAll = false;
    let previousConnected: boolean | undefined;
    const selected = selectionKey.split(',').map(Number);
    const missing = missingKey.split(',').map(Number);
    const params = { surahId, translationIds: missing };
    const accept = (rows: Awaited<ReturnType<typeof getNetworkSurahTranslationCached>>) => {
      const recovery = buildReaderTranslationRecovery(surahId, selected, missing, verseCount, rows);
      recoveredAll = recovery.translationIds.length === missing.length;
      if (recovery.translationIds.length !== missing.length) invalidateNetworkSurahTranslationCache(params);
      if (!disposed) setResult({ key, recovery, state: recovery.translationIds.length === missing.length ? 'ready' : 'error' });
      return recovery.translationIds.length === missing.length;
    };
    const cached = peekNetworkSurahTranslationSnapshot(params);
    if (cached && accept(cached)) return;

    const recover = async () => {
      if (disposed || recoveredAll || pending || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      pending = true;
      try {
        const network = await Network.getNetworkStateAsync();
        if (disposed) return;
        const offline = network.isConnected === false || network.isInternetReachable === false;
        previousConnected = !offline;
        if (offline) {
          setResult((current) => ({ ...(current.key === key ? current : {}), key, state: 'offline' }));
          setDismissed(offlineNoticeDismissed);
          return;
        }
        offlineNoticeDismissed = false;
        setDismissed(false);
        setResult((current) => ({ ...(current.key === key ? current : {}), key, state: 'loading' }));
        accept(await getNetworkSurahTranslationCached(params));
      } catch {
        if (!disposed) {
          const network = await Network.getNetworkStateAsync().catch(() => null);
          if (!disposed) setResult((current) => ({
            ...(current.key === key ? current : {}), key,
            state: network?.isConnected === false || network?.isInternetReachable === false ? 'offline' : 'error',
          }));
        }
      } finally {
        pending = false;
        if (retryAfterPending && !disposed) {
          retryAfterPending = false;
          void recover();
        }
      }
    };
    const networkListener = Network.addNetworkStateListener((network) => {
      const connected = network.isConnected !== false && network.isInternetReachable !== false;
      const changed = previousConnected !== connected;
      previousConnected = connected;
      if (connected && changed) {
        if (pending) retryAfterPending = true;
        else void recover();
      }
      else if (!connected && !disposed) {
        setResult((current) => current.key === key && current.state === 'ready' ? current : { ...(current.key === key ? current : {}), key, state: 'offline' });
      }
    });
    const appListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recover();
    });
    void recover();
    return () => { disposed = true; networkListener.remove(); appListener.remove(); };
  }, [complete, enabled, key, missingKey, retryGeneration, selectionKey, surahId, verseCount]));

  const current = result.key === key ? result : undefined;
  const recovery = current?.recovery;
  const unavailableIds = React.useMemo(
    () => missingTranslationIds.filter((id) => !recovery?.translationIds.includes(id)),
    [missingKey, recovery]
  );
  const dismiss = React.useCallback(() => {
    if (current?.state === 'offline') offlineNoticeDismissed = true;
    setDismissed(true);
  }, [current?.state]);
  return {
    recovery,
    unavailableIds,
    state: current?.state ?? 'loading',
    dismissed,
    dismiss,
    retry,
  };
}
