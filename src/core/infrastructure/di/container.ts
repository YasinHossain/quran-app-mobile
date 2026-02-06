import { TafsirRepository } from '@/src/core/infrastructure/repositories/TafsirRepository';

const tafsirRepository = new TafsirRepository();

export const container = {
  getTafsirRepository: (): TafsirRepository => tafsirRepository,
};

