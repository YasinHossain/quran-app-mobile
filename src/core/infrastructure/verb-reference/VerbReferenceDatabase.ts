export type VerbReferenceSqlParameter = string | number | null;

export interface VerbReferenceDatabase {
  getAllAsync<T>(
    sql: string,
    parameters?: readonly VerbReferenceSqlParameter[]
  ): Promise<T[]>;
}

export interface VerbReferenceDatabaseProvider {
  getDatabaseAsync(): Promise<VerbReferenceDatabase>;
}
