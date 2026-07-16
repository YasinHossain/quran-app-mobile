import { container } from '../di/container';
import { logger } from '../monitoring/logger';

export async function bootstrapWordStudyPackAsync(): Promise<void> {
  try {
    await container.getWordStudyPackLifecycle().ensureReadyAsync();
  } catch (error) {
    logger.error('Failed to bootstrap bundled word-study pack', undefined, error as Error);
  }
}
