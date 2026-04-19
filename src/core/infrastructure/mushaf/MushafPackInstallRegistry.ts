import type { SQLiteDatabase } from 'expo-sqlite';

import type { MushafPackChannel, MushafPackId } from '@/types';
import type { MushafPackInstall, MushafPackInstallInput } from '@/src/domain/entities';
import type { IMushafPackInstallRegistry } from '@/src/domain/repositories/IMushafPackInstallRegistry';
import { getAppDbAsync } from '@/src/core/infrastructure/db';

type MushafPackInstallRow = {
  pack_id: string;
  version: string;
  channel: string;
  is_active: number;
  installed_at: number;
  updated_at: number;
};

function normalizeVersion(version: string): string {
  return version.trim();
}

function mapRow(row: MushafPackInstallRow): MushafPackInstall {
  return {
    packId: row.pack_id as MushafPackId,
    version: row.version,
    channel: row.channel as MushafPackChannel,
    isActive: row.is_active === 1,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
  };
}

async function getInstallRowAsync(
  db: SQLiteDatabase,
  packId: MushafPackId,
  version: string
): Promise<MushafPackInstallRow | null> {
  return (
    (await db.getFirstAsync<MushafPackInstallRow>(
      `
      SELECT pack_id, version, channel, is_active, installed_at, updated_at
      FROM mushaf_pack_installs
      WHERE pack_id = ? AND version = ?
      LIMIT 1;
      `,
      [packId, version]
    )) ?? null
  );
}

async function getActiveInstallRowAsync(
  db: SQLiteDatabase,
  packId: MushafPackId
): Promise<MushafPackInstallRow | null> {
  return (
    (await db.getFirstAsync<MushafPackInstallRow>(
      `
      SELECT pack_id, version, channel, is_active, installed_at, updated_at
      FROM mushaf_pack_installs
      WHERE pack_id = ? AND is_active = 1
      LIMIT 1;
      `,
      [packId]
    )) ?? null
  );
}

export class MushafPackInstallRegistry implements IMushafPackInstallRegistry {
  async list(): Promise<MushafPackInstall[]> {
    const db = await getAppDbAsync();
    const rows = await db.getAllAsync<MushafPackInstallRow>(`
      SELECT pack_id, version, channel, is_active, installed_at, updated_at
      FROM mushaf_pack_installs
      ORDER BY pack_id ASC, is_active DESC, installed_at DESC;
    `);

    return rows.map(mapRow);
  }

  async get(packId: MushafPackId, version: string): Promise<MushafPackInstall | null> {
    const db = await getAppDbAsync();
    const normalizedVersion = normalizeVersion(version);
    if (!normalizedVersion) return null;

    const row = await getInstallRowAsync(db, packId, normalizedVersion);

    return row ? mapRow(row) : null;
  }

  async getActive(packId: MushafPackId): Promise<MushafPackInstall | null> {
    const db = await getAppDbAsync();
    const row = await getActiveInstallRowAsync(db, packId);

    return row ? mapRow(row) : null;
  }

  async upsert(input: MushafPackInstallInput): Promise<MushafPackInstall> {
    const db = await getAppDbAsync();
    const version = normalizeVersion(input.version);
    if (!version) {
      throw new Error('version is required');
    }

    let result: MushafPackInstall | null = null;

    await db.withTransactionAsync(async () => {
      const existingRow = await getInstallRowAsync(db, input.packId, version);
      const activeBeforeWriteRow = await getActiveInstallRowAsync(db, input.packId);
      const existing = existingRow ? mapRow(existingRow) : null;
      const activeBeforeWrite = activeBeforeWriteRow ? mapRow(activeBeforeWriteRow) : null;
      const shouldBeActive =
        input.isActive ?? existing?.isActive ?? (activeBeforeWrite === null ? true : false);
      const now = Date.now();
      const installedAt = existing?.installedAt ?? now;

      if (shouldBeActive) {
        await db.runAsync(
          `
          UPDATE mushaf_pack_installs
          SET is_active = 0, updated_at = ?
          WHERE pack_id = ? AND NOT (pack_id = ? AND version = ?);
          `,
          [now, input.packId, input.packId, version]
        );
      }

      await db.runAsync(
        `
        INSERT INTO mushaf_pack_installs(
          pack_id,
          version,
          channel,
          is_active,
          installed_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(pack_id, version) DO UPDATE SET
          channel = excluded.channel,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at;
        `,
        [input.packId, version, input.channel, shouldBeActive ? 1 : 0, installedAt, now]
      );

      result = {
        packId: input.packId,
        version,
        channel: input.channel,
        isActive: shouldBeActive,
        installedAt,
        updatedAt: now,
      };
    });

    if (!result) {
      throw new Error(`Failed to register mushaf pack install for ${input.packId}@${version}`);
    }

    return result;
  }

  async setActive(packId: MushafPackId, version: string): Promise<MushafPackInstall> {
    const db = await getAppDbAsync();
    const normalizedVersion = normalizeVersion(version);
    if (!normalizedVersion) {
      throw new Error('version is required');
    }

    let result: MushafPackInstall | null = null;

    await db.withTransactionAsync(async () => {
      const existingRow = await getInstallRowAsync(db, packId, normalizedVersion);
      const existing = existingRow ? mapRow(existingRow) : null;
      if (!existing) {
        throw new Error(`No installed mushaf pack found for ${packId}@${normalizedVersion}`);
      }

      const now = Date.now();
      await db.runAsync(
        `
        UPDATE mushaf_pack_installs
        SET is_active = 0, updated_at = ?
        WHERE pack_id = ?;
        `,
        [now, packId]
      );
      await db.runAsync(
        `
        UPDATE mushaf_pack_installs
        SET is_active = 1, updated_at = ?
        WHERE pack_id = ? AND version = ?;
        `,
        [now, packId, normalizedVersion]
      );

      result = {
        ...existing,
        isActive: true,
        updatedAt: now,
      };
    });

    if (!result) {
      throw new Error(`Failed to activate mushaf pack ${packId}@${normalizedVersion}`);
    }

    return result;
  }

  async remove(packId: MushafPackId, version: string): Promise<void> {
    const db = await getAppDbAsync();
    const normalizedVersion = normalizeVersion(version);
    if (!normalizedVersion) return;

    await db.runAsync(
      `
      DELETE FROM mushaf_pack_installs
      WHERE pack_id = ? AND version = ?;
      `,
      [packId, normalizedVersion]
    );
  }
}
