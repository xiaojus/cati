/**
 * 生产库初始化：只建一只猫，不写任何假记录。
 *
 * 用法：CAT_DB=/app/data/cat.db node scripts/seed-prod.ts
 * 幂等：已存在同名猫就跳过，不会重复插入。
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { cats } from '../lib/schema';

const CAT_NAME = process.env.CAT_NAME ?? '煤球';

async function main() {
  const existing = await db.select().from(cats).where(eq(cats.name, CAT_NAME)).limit(1);
  if (existing.length > 0) {
    console.log(`[seed-prod] ${CAT_NAME} 已存在，跳过`);
    return;
  }

  await db.insert(cats).values({
    id: randomUUID(),
    name: CAT_NAME,
    birthEst: process.env.CAT_BIRTH ?? '2025-09-01',
    sex: process.env.CAT_SEX ?? 'F',
    neutered: 0,
    neuteredAt: null,
    avatarUrl: null,
    note: '2026-11-10 从小区抓回，隔离期至 2026-11-25',
    createdAt: new Date().toISOString(),
  });
  console.log(`[seed-prod] 已创建 ${CAT_NAME}（无历史记录）`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-prod] 失败:', err);
    process.exit(1);
  });
