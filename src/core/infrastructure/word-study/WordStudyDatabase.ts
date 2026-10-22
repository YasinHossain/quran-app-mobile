export type WordStudySqlParameter = string | number | null;

export interface WordStudyDatabase {
  getFirstAsync<T>(sql: string, parameters?: readonly WordStudySqlParameter[]): Promise<T | null>;
  getAllAsync<T>(sql: string, parameters?: readonly WordStudySqlParameter[]): Promise<T[]>;
}

export interface WordStudyDatabaseProvider {
  getDatabaseAsync(): Promise<WordStudyDatabase>;
  closeAsync(): Promise<void>;
}
