export type GrammarStudySqlParameter = string | number | null;

export interface GrammarStudyDatabase {
  getFirstAsync<T>(
    sql: string,
    parameters?: readonly GrammarStudySqlParameter[]
  ): Promise<T | null>;
  getAllAsync<T>(
    sql: string,
    parameters?: readonly GrammarStudySqlParameter[]
  ): Promise<T[]>;
}

export interface GrammarStudyDatabaseProvider {
  getDatabaseAsync(): Promise<GrammarStudyDatabase>;
  closeAsync(): Promise<void>;
}
