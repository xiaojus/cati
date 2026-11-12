import { and, eq } from 'drizzle-orm';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { catMembers } from '@/lib/schema';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic)$/i;

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

function fail(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status });
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return fail(401, '登录已过期，请重新登录后再试');
  }

  const { path } = await params;

  // uploads 里的路径固定为 <catId>/<yyyy-mm>/<uuid>.<ext>。
  // 白名单校验比事后过滤 '..' 更可靠，任何额外层级都直接拒绝。
  if (!Array.isArray(path) || path.length !== 3) {
    return fail(400, '图片路径不正确');
  }

  const [catId, month, fileName] = path;
  if (
    !z.uuid().safeParse(catId).success ||
    !MONTH_PATTERN.test(month) ||
    !FILE_PATTERN.test(fileName)
  ) {
    return fail(400, '图片路径不正确');
  }

  const [membership] = await db
    .select({ catId: catMembers.catId })
    .from(catMembers)
    .where(and(eq(catMembers.catId, catId), eq(catMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return fail(403, '无权查看这张图片');
  }

  const uploadRoot = resolve(
    /* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? './uploads',
  );
  const requested = resolve(
    /* turbopackIgnore: true */ uploadRoot,
    catId,
    month,
    fileName,
  );

  // 第一道防线：拼接后的路径必须仍在 UPLOAD_DIR 内。
  if (!isInside(uploadRoot, requested)) {
    return fail(400, '图片路径不正确');
  }

  let realRoot: string;
  let realFile: string;
  try {
    // 第二道防线：realpath 解析符号链接后再比较一次，防止软链逃逸。
    realRoot = await realpath(/* turbopackIgnore: true */ uploadRoot);
    realFile = await realpath(/* turbopackIgnore: true */ requested);
  } catch {
    return fail(404, '图片不存在');
  }

  if (!isInside(realRoot, realFile)) {
    return fail(400, '图片路径不正确');
  }

  let fileStat;
  try {
    fileStat = await stat(realFile);
  } catch {
    return fail(404, '图片不存在');
  }

  if (!fileStat.isFile()) {
    return fail(404, '图片不存在');
  }

  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream';
  const stream = Readable.toWeb(
    createReadStream(realFile),
  ) as unknown as ReadableStream<Uint8Array>;

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileStat.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
