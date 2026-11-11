/**
 * 仅服务端使用。
 *
 * lib/schema.ts 已冻结，而档案页需要保存「常去医院」的名称 / 电话 / 地址。
 * 这里用一张独立的 KV 表按 catId 保存这一类单条设置，不改动既有数据表。
 */
import { sqlite } from './db';
import {
  EMPTY_HOSPITAL,
  normalizeHospitalInfo,
  type HospitalInfo,
} from './hospital';

let settingsTableReady = false;

function ensureSettingsTable(): void {
  if (settingsTableReady) {
    return;
  }

  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS app_settings (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
  );
  settingsTableReady = true;
}

function hospitalKey(catId: string): string {
  return `hospital:${catId}`;
}

export function getHospitalInfo(catId: string): HospitalInfo {
  try {
    ensureSettingsTable();

    const row = sqlite
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(hospitalKey(catId)) as { value: string } | undefined;

    if (!row) {
      return { ...EMPTY_HOSPITAL };
    }

    return normalizeHospitalInfo(JSON.parse(row.value));
  } catch (error) {
    console.error('[app-settings] 读取医院信息失败', error);
    return { ...EMPTY_HOSPITAL };
  }
}

export function saveHospitalInfo(catId: string, info: HospitalInfo): void {
  ensureSettingsTable();

  const value = JSON.stringify(normalizeHospitalInfo(info));
  sqlite
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .run(hospitalKey(catId), value, new Date().toISOString());
}
