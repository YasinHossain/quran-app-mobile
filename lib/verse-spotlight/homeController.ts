import { BUNDLED_SAHIH_TRANSLATION_ID } from './bundledFallback';
import { getNextVerseKey, getPreviousVerseKey } from './canonicalIndex';
import type {
  SpotlightVerseContent,
  VerseKey,
  VerseSpotlightState,
} from './contracts';
import {
  HOME_SPOTLIGHT_ROTATION_INTERVAL_MS,
  createSpotlightState,
  isSpotlightStateExpired,
  selectRandomAnchor,
  withResolvedTranslation,
} from './engine';

export type HomeSpotlightNavigation = 'next' | 'previous';
export type HomeSpotlightStatus = 'error' | 'loading' | 'ready';

export type HomeSpotlightSnapshot = {
  status: HomeSpotlightStatus;
  state: VerseSpotlightState | null;
  content: SpotlightVerseContent | null;
};

export type HomeSpotlightControllerDependencies = {
  hydrate(params: {
    now: number;
    requestedTranslationId: number;
    random?: () => number;
  }): Promise<VerseSpotlightState>;
  persist(state: VerseSpotlightState): Promise<void>;
  resolve(params: {
    requestedTranslationId: number;
    verseKey: string;
  }): Promise<SpotlightVerseContent>;
  now?: () => number;
  random?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancelScheduled?: (handle: unknown) => void;
};

function normalizeTranslationId(value: number): number {
  if (!Number.isFinite(value)) return BUNDLED_SAHIH_TRANSLATION_ID;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : BUNDLED_SAHIH_TRANSLATION_ID;
}

export function getHomeSpotlightSwipeNavigation(
  dx: number,
  dy: number,
  minimumHorizontalDistance = 48
): HomeSpotlightNavigation | null {
  const horizontalDistance = Math.abs(dx);
  const verticalDistance = Math.abs(dy);
  if (
    !Number.isFinite(horizontalDistance) ||
    !Number.isFinite(verticalDistance) ||
    horizontalDistance < minimumHorizontalDistance ||
    horizontalDistance <= verticalDistance * 1.15
  ) {
    return null;
  }
  return dx > 0 ? 'previous' : 'next';
}

export function isHomeSpotlightContentLong(content: SpotlightVerseContent): boolean {
  return content.translationText.trim().length > 150;
}

export function buildHomeSpotlightPreviewText(
  text: string,
  maxCharacters = 150
): string {
  const normalized = text.trim();
  if (normalized.length <= maxCharacters) return normalized;

  const candidate = normalized.slice(0, maxCharacters + 1);
  const lastWordBoundary = candidate.lastIndexOf(' ');
  const cutoff =
    lastWordBoundary >= Math.floor(maxCharacters * 0.65)
      ? lastWordBoundary
      : maxCharacters;
  return `${candidate.slice(0, cutoff).trimEnd()}…`;
}

export class HomeVerseSpotlightController {
  private readonly dependencies: Required<
    Pick<HomeSpotlightControllerDependencies, 'now' | 'random' | 'schedule' | 'cancelScheduled'>
  > &
    Omit<
      HomeSpotlightControllerDependencies,
      'now' | 'random' | 'schedule' | 'cancelScheduled'
    >;

  private snapshot: HomeSpotlightSnapshot = {
    status: 'loading',
    state: null,
    content: null,
  };

  private readonly listeners = new Set<() => void>();
  private requestedTranslationId: number;
  private isActive = false;
  private isDisposed = false;
  private scheduledHandle: unknown = null;
  private resolutionVersion = 0;
  private hydrationVersion = 0;
  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(
    requestedTranslationId: number,
    dependencies: HomeSpotlightControllerDependencies
  ) {
    this.requestedTranslationId = normalizeTranslationId(requestedTranslationId);
    this.dependencies = {
      ...dependencies,
      now: dependencies.now ?? Date.now,
      random: dependencies.random ?? Math.random,
      schedule:
        dependencies.schedule ??
        ((callback, delayMs) => globalThis.setTimeout(callback, delayMs)),
      cancelScheduled:
        dependencies.cancelScheduled ??
        ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)),
    };
  }

  getSnapshot = (): HomeSpotlightSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async hydrate(): Promise<void> {
    const hydrationVersion = ++this.hydrationVersion;
    const loaded = await this.dependencies.hydrate({
      now: this.dependencies.now(),
      requestedTranslationId: this.requestedTranslationId,
      random: this.dependencies.random,
    });
    if (this.isDisposed || hydrationVersion !== this.hydrationVersion) return;

    const state =
      loaded.requestedTranslationId === this.requestedTranslationId
        ? loaded
        : withResolvedTranslation(
            loaded,
            this.requestedTranslationId,
            BUNDLED_SAHIH_TRANSLATION_ID
          );

    this.snapshot = { status: 'loading', state, content: null };
    this.emit();
    this.persist(state);

    if (this.isActive && isSpotlightStateExpired(state, this.dependencies.now())) {
      this.selectVerse(selectRandomAnchor(state.verseKey, this.dependencies.random));
      return;
    }

    this.scheduleExpiration();
    await this.resolveCurrent();
  }

  setActive(active: boolean): void {
    if (this.isDisposed) return;
    const didBecomeActive = active && !this.isActive;
    this.isActive = active;

    if (!active) {
      this.clearScheduledExpiration();
      return;
    }

    const state = this.snapshot.state;
    if (!state) return;

    if (isSpotlightStateExpired(state, this.dependencies.now())) {
      this.selectVerse(selectRandomAnchor(state.verseKey, this.dependencies.random));
      return;
    }

    this.scheduleExpiration();
    if (didBecomeActive) {
      void this.resolveCurrent();
    }
  }

  setRequestedTranslationId(requestedTranslationId: number): void {
    const normalized = normalizeTranslationId(requestedTranslationId);
    if (normalized === this.requestedTranslationId) return;
    this.requestedTranslationId = normalized;

    const state = this.snapshot.state;
    if (!state) return;

    const updated = withResolvedTranslation(
      state,
      normalized,
      BUNDLED_SAHIH_TRANSLATION_ID
    );
    this.snapshot = { status: 'loading', state: updated, content: null };
    this.emit();
    this.persist(updated);
    void this.resolveCurrent();
  }

  navigate(direction: HomeSpotlightNavigation): boolean {
    const state = this.snapshot.state;
    if (!state) return false;

    const verseKey =
      direction === 'previous'
        ? getPreviousVerseKey(state.verseKey)
        : getNextVerseKey(state.verseKey);
    if (!verseKey) return false;

    this.selectVerse(verseKey);
    return true;
  }

  shuffle(): boolean {
    const state = this.snapshot.state;
    if (!state) return false;
    this.selectVerse(selectRandomAnchor(state.verseKey, this.dependencies.random));
    return true;
  }

  refresh(): void {
    if (!this.snapshot.state) return;
    void this.resolveCurrent();
  }

  dispose(): void {
    this.isDisposed = true;
    this.hydrationVersion += 1;
    this.resolutionVersion += 1;
    this.clearScheduledExpiration();
    this.listeners.clear();
  }

  private selectVerse(verseKey: VerseKey): void {
    const current = this.snapshot.state;
    if (!current || this.isDisposed) return;

    const state = createSpotlightState({
      surface: 'home',
      verseKey,
      selectedAt: this.dependencies.now(),
      rotationIntervalMs: HOME_SPOTLIGHT_ROTATION_INTERVAL_MS,
      requestedTranslationId: this.requestedTranslationId,
      effectiveTranslationId: BUNDLED_SAHIH_TRANSLATION_ID,
      poolVersion: current.poolVersion,
    });

    this.snapshot = { status: 'loading', state, content: null };
    this.emit();
    this.persist(state);
    this.scheduleExpiration();
    void this.resolveCurrent();
  }

  private async resolveCurrent(): Promise<void> {
    const state = this.snapshot.state;
    if (!state || this.isDisposed) return;

    const resolutionVersion = ++this.resolutionVersion;
    const verseKey = state.verseKey;
    const requestedTranslationId = this.requestedTranslationId;

    try {
      const content = await this.dependencies.resolve({
        requestedTranslationId,
        verseKey,
      });
      if (
        this.isDisposed ||
        resolutionVersion !== this.resolutionVersion ||
        this.snapshot.state?.verseKey !== verseKey ||
        this.requestedTranslationId !== requestedTranslationId
      ) {
        return;
      }

      const resolvedState = withResolvedTranslation(
        this.snapshot.state,
        content.requestedTranslationId,
        content.effectiveTranslationId
      );
      this.snapshot = { status: 'ready', state: resolvedState, content };
      this.emit();
      this.persist(resolvedState);
    } catch {
      if (
        this.isDisposed ||
        resolutionVersion !== this.resolutionVersion ||
        this.snapshot.state?.verseKey !== verseKey
      ) {
        return;
      }
      this.snapshot = { status: 'error', state: this.snapshot.state, content: null };
      this.emit();
    }
  }

  private scheduleExpiration(): void {
    this.clearScheduledExpiration();
    const state = this.snapshot.state;
    if (!this.isActive || !state || state.nextRandomAt === null) return;

    const delayMs = Math.max(0, state.nextRandomAt - this.dependencies.now());
    this.scheduledHandle = this.dependencies.schedule(() => {
      this.scheduledHandle = null;
      if (!this.isActive || this.isDisposed) return;

      const current = this.snapshot.state;
      if (!current) return;
      if (!isSpotlightStateExpired(current, this.dependencies.now())) {
        this.scheduleExpiration();
        return;
      }
      this.selectVerse(selectRandomAnchor(current.verseKey, this.dependencies.random));
    }, delayMs);
  }

  private clearScheduledExpiration(): void {
    if (this.scheduledHandle === null) return;
    this.dependencies.cancelScheduled(this.scheduledHandle);
    this.scheduledHandle = null;
  }

  private persist(state: VerseSpotlightState): void {
    this.persistenceQueue = this.persistenceQueue
      .catch(() => undefined)
      .then(() => this.dependencies.persist(state))
      .catch(() => undefined);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
