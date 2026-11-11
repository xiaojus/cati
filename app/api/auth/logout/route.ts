import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth';
import { db } from '@/lib/db';
import { sessions } from '@/lib/schema';

export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    // 同时作废服务端 session，避免旧 cookie 被重放。
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  cookieStore.delete(SESSION_COOKIE_NAME);

  return Response.json({ ok: true }, { status: 200 });
}
