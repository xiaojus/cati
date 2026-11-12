import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { todayInShanghai } from '@/lib/dates';
import { db } from '@/lib/db';
import { catMembers, dailyLogs, records } from '@/lib/schema';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** 只认这四种图片；扩展名由服务端按内容决定，不信任原文件名。 */
const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
} as const;

type AllowedMime = keyof typeof IMAGE_TYPES;

const uploadSchema = z.object({
  kind: z.enum(['log', 'record'], 'kind 必须是 log 或 record'),
  id: z.uuid('记录编号不正确'),
});

function fail(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status });
}

/**
 * 校验文件内容的真实类型。只看 multipart 里的 Content-Type 可以被伪造，
 * 这里再核对文件头，避免把任意文件以 .png 后缀写进 uploads。
 */
function sniffImageMime(buffer: Buffer): AllowedMime | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    const heicBrands = new Set([
      'heic',
      'heix',
      'hevc',
      'hevx',
      'heim',
      'heis',
      'hevm',
      'hevs',
      'mif1',
      'msf1',
    ]);

    if (heicBrands.has(brand)) {
      return 'image/heic';
    }
  }

  return null;
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return fail(401, '登录已过期，请重新登录后再试');
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, '上传内容格式不正确');
  }

  const parsed = uploadSchema.safeParse({
    kind: formData.get('kind'),
    id: formData.get('id'),
  });

  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? '上传参数不正确');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return fail(400, '请选择要上传的图片');
  }

  if (file.size <= 0) {
    return fail(400, '图片内容为空');
  }

  if (file.size > MAX_FILE_BYTES) {
    return fail(413, '图片不能超过 8MB');
  }

  const declaredMime = file.type.toLowerCase();
  if (!(declaredMime in IMAGE_TYPES)) {
    return fail(400, '只支持 JPG / PNG / WebP / HEIC 图片');
  }

  const { kind, id } = parsed.data;

  // 先确认记录存在，再确认记录所属的猫在当前用户的 membership 里。
  let catId: string;
  if (kind === 'log') {
    const [row] = await db
      .select({ catId: dailyLogs.catId })
      .from(dailyLogs)
      .where(eq(dailyLogs.id, id))
      .limit(1);

    if (!row) {
      return fail(404, '记录不存在');
    }
    catId = row.catId;
  } else {
    const [row] = await db
      .select({ catId: records.catId })
      .from(records)
      .where(eq(records.id, id))
      .limit(1);

    if (!row) {
      return fail(404, '记录不存在');
    }
    catId = row.catId;
  }

  const [membership] = await db
    .select({ catId: catMembers.catId })
    .from(catMembers)
    .where(and(eq(catMembers.catId, catId), eq(catMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return fail(403, '无权为这只猫上传图片');
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return fail(400, '读取图片失败，请重试');
  }

  const sniffedMime = sniffImageMime(buffer);
  if (!sniffedMime) {
    return fail(400, '文件内容不是受支持的图片');
  }

  // catId 来自数据库、月份由服务端生成、文件名随机；仍然再做一次路径前缀校验。
  if (!z.uuid().safeParse(catId).success) {
    return fail(500, '猫咪编号异常，无法保存图片');
  }

  const uploadRoot = resolve(
    /* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? './uploads',
  );
  const month = todayInShanghai().slice(0, 7);
  const directory = resolve(/* turbopackIgnore: true */ uploadRoot, catId, month);
  const extension = IMAGE_TYPES[sniffedMime];
  const fileName = `${randomUUID()}.${extension}`;
  const absolutePath = join(/* turbopackIgnore: true */ directory, fileName);

  if (!isInside(uploadRoot, absolutePath)) {
    return fail(400, '图片路径不正确');
  }

  const relativePath = `${catId}/${month}/${fileName}`;

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(absolutePath, buffer, { flag: 'wx' });
  } catch (error) {
    console.error('[api/upload] 写入图片失败', error);
    return fail(500, '图片保存失败，请稍后再试');
  }

  try {
    if (kind === 'log') {
      await db
        .update(dailyLogs)
        .set({
          photoPath: relativePath,
          updatedBy: user.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(dailyLogs.id, id));
    } else {
      await db
        .update(records)
        .set({ photoPath: relativePath })
        .where(eq(records.id, id));
    }
  } catch (error) {
    console.error('[api/upload] 更新记录照片路径失败', error);
    await unlink(absolutePath).catch(() => undefined);
    return fail(500, '图片保存失败，请稍后再试');
  }

  return Response.json({ ok: true, path: relativePath });
}
