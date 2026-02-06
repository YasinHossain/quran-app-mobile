import type { ILogger } from '@/src/core/domain/interfaces/ILogger';

export const logger: ILogger = {
  info: (message, context, error) => console.log(message, context, error),
  warn: (message, context, error) => console.warn(message, context, error),
  error: (message, context, error) => console.error(message, context, error),
  debug: (message, context, error) => console.debug(message, context, error),
};

