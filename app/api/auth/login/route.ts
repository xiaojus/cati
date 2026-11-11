import { createSession, verifyCredentials } from '@/lib/auth';

const INVALID_CREDENTIALS = {
  ok: false,
  error: '邮箱或密码错误',
} as const;

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json(INVALID_CREDENTIALS, { status: 401 });
  }

  if (typeof payload !== 'object' || payload === null) {
    return Response.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const { email, password } = payload as {
    email?: unknown;
    password?: unknown;
  };

  if (typeof email !== 'string' || typeof password !== 'string') {
    return Response.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    return Response.json(INVALID_CREDENTIALS, { status: 401 });
  }

  await createSession(user.id);

  return Response.json({ ok: true }, { status: 200 });
}
