import { z } from 'zod';
import { testProviderConnection } from '@/lib/ai-config';
import { getSessionUser } from '@/lib/auth';

/** 同一用户 10 秒内最多 3 次（模块级内存即可，多实例下各自计数）。 */
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 3;

const rateLimitBuckets = new Map<string, number[]>();

function allowTest(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (rateLimitBuckets.get(userId) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitBuckets.set(userId, recent);
    return false;
  }

  recent.push(now);
  rateLimitBuckets.set(userId, recent);

  if (rateLimitBuckets.size > 500) {
    for (const [key, timestamps] of rateLimitBuckets) {
      if (timestamps.every((timestamp) => timestamp <= windowStart)) {
        rateLimitBuckets.delete(key);
      }
    }
  }

  return true;
}

const testSchema = z.object({
  provider: z.string({ error: '请选择服务商' }).trim().min(1, '请选择服务商'),
  baseUrl: z
    .string({ error: '请填写接口地址' })
    .trim()
    .min(1, '请填写接口地址'),
  model: z.string({ error: '请填写模型' }).trim().min(1, '请填写模型'),
  apiKey: z.string({ error: '请填写 API Key' }).trim().min(1, '请填写 API Key'),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      { ok: false, error: '登录已过期，请重新登录后再试' },
      { status: 401 },
    );
  }

  if (!allowTest(user.id)) {
    return Response.json(
      { ok: false, error: '测试太频繁，请 10 秒后再试' },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: '请求格式不正确' },
      { status: 400 },
    );
  }

  const parsed = testSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? '请填写完整的连接信息',
      },
      { status: 400 },
    );
  }

  // 错误信息只由 testProviderConnection 生成，不会回显 key。
  const result = await testProviderConnection({
    baseUrl: parsed.data.baseUrl,
    model: parsed.data.model,
    apiKey: parsed.data.apiKey,
  });

  return Response.json(result);
}
