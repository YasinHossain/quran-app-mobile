import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

// SQLite's historical default limit; newer builds allow more, but this keeps every build safe.
const MAX_BIND_PARAMS_PER_STATEMENT = 999;

/**
 * Inserts rows with multi-row `VALUES` statements. Each native statement call costs a bridge
 * round trip, so pack imports that ran one statement per row spent most of their time here.
 *
 * `insert` is the statement head (`INSERT INTO t(a, b)`), `suffix` an optional upsert clause.
 * Every row must have the same number of values as the column list.
 */
export async function insertRowsAsync(
  db: Pick<SQLiteDatabase, 'runAsync'>,
  sql: { insert: string; suffix?: string },
  rows: ReadonlyArray<readonly SQLiteBindValue[]>
): Promise<void> {
  const columnCount = rows[0]?.length ?? 0;
  if (columnCount === 0) return;

  const rowPlaceholder = `(${new Array(columnCount).fill('?').join(', ')})`;
  const rowsPerStatement = Math.max(1, Math.floor(MAX_BIND_PARAMS_PER_STATEMENT / columnCount));

  for (let start = 0; start < rows.length; start += rowsPerStatement) {
    const chunk = rows.slice(start, start + rowsPerStatement);
    const params: SQLiteBindValue[] = [];
    for (const row of chunk) {
      if (row.length !== columnCount) {
        throw new Error(`insertRowsAsync expected ${columnCount} values per row, received ${row.length}`);
      }
      params.push(...row);
    }

    const values = new Array(chunk.length).fill(rowPlaceholder).join(', ');
    await db.runAsync(`${sql.insert} VALUES ${values} ${sql.suffix ?? ''};`, params);
  }
}
