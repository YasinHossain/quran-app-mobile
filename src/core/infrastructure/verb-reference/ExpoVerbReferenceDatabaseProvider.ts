import type { VerbReferenceDatabase, VerbReferenceDatabaseProvider } from './VerbReferenceDatabase';

/**
 * Public builds intentionally ship without the pending-permission verb database.
 * The repository keeps its structured unavailable state until an approved pack
 * installer is enabled.
 */
export class ExpoVerbReferenceDatabaseProvider implements VerbReferenceDatabaseProvider {
  async getDatabaseAsync(): Promise<VerbReferenceDatabase> {
    throw new Error('Verb reference pack is not available for public distribution');
  }

  async closeAsync(): Promise<void> {}
}
