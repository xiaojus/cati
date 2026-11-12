/**
 * 当前猫解析的统一入口（仅服务端使用）。
 *
 * 每台浏览器用 cookie `cati_cat` 记住自己正在看的猫；cookie 里的 catId
 * 永远要和 cat_members 交叉校验，不能直接信任。没有 cookie 或 cookie
 * 指向已不属于当前用户的猫时，回落到 membership 第一条。
 */
import { asc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from './auth';
import { db } from './db';
import { catMembers, cats, type Cat } from './schema';

export const CURRENT_CAT_COOKIE_NAME = 'cati_cat';

/** per-browser cookie，保留一年。 */
const CURRENT_CAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Membership = {
  cat: Cat;
  role: string;
};

export type CurrentCat = {
  cat: Cat;
  role: string;
  memberships: Membership[];
};

/** 当前用户加入的所有猫，按 catId 稳定排序。 */
export async function getMemberships(userId: string): Promise<Membership[]> {
  return db
    .select({ cat: cats, role: catMembers.role })
    .from(catMembers)
    .innerJoin(cats, eq(cats.id, catMembers.catId))
    .where(eq(catMembers.userId, userId))
    .orderBy(asc(catMembers.catId));
}

/**
 * 写当前猫 cookie。只能在 Server Action / Route Handler 调用；
 * Server Component 渲染阶段会被 Next 拒绝，见 requireCurrentCat 的兜底。
 */
export async function writeCurrentCatCookie(catId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_CAT_COOKIE_NAME, catId, {
    httpOnly: true,
    maxAge: CURRENT_CAT_COOKIE_MAX_AGE,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * 页面与 Server Action 读取“当前猫”的唯一入口。
 *
 * - 未登录 → /login
 * - 还没有任何猫 → /welcome（那里可以创建或兑换邀请码）
 * - cookie 无效 → 回落到第一条 membership，并尽力把 cookie 纠正过来
 */
export async function requireCurrentCat(): Promise<CurrentCat> {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);

  if (memberships.length === 0) {
    redirect('/welcome');
  }

  const cookieStore = await cookies();
  const cookieCatId = cookieStore.get(CURRENT_CAT_COOKIE_NAME)?.value;
  const selected =
    memberships.find((membership) => membership.cat.id === cookieCatId) ??
    memberships[0];

  if (selected.cat.id !== cookieCatId) {
    try {
      await writeCurrentCatCookie(selected.cat.id);
    } catch {
      // Next 只允许在 Server Action / Route Handler 里写 cookie。
      // 页面渲染阶段保持解析结果即可；下一次切换会由 setCurrentCat 持久化。
    }
  }

  return {
    cat: selected.cat,
    role: selected.role,
    memberships,
  };
}
