import { connection } from 'next/server';
import { sqlite } from '@/lib/db';

// Next 16 的 cacheComponents 与 route segment config `runtime` 不兼容，
// node 运行时本就是默认值，不再显式声明。

function countRows(table: string): number {
  const row = sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as {
    c: number;
  };
  return row.c;
}

export async function GET() {
  // better-sqlite3 is synchronous, so opt out of prerendering explicitly.
  await connection();

  return Response.json({
    ok: true,
    counts: {
      users: countRows('users'),
      cats: countRows('cats'),
      daily_logs: countRows('daily_logs'),
      records: countRows('records'),
    },
  });
}
