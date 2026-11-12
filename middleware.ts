import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 只做「cookie 是否存在」的轻量判断，不能在这里查数据库。
 * 真正的 session 校验由 lib/auth.ts 的 requireUser() 在服务端完成。
 *
 * 注意：Next.js 16 已把 middleware 重命名为 proxy（middleware 仍兼容，
 * 构建时会给出 deprecated 提示）。此处按 T2 任务卡保留 middleware.ts。
 */
const SESSION_COOKIE = 'cati_sid';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isLoginPage = pathname === '/login';
  const isRegisterPage = pathname === '/register';

  // 分享页只精确放行 /share/<32 位 base62 token>：
  // /share、/share/abc 仍然走登录保护；/share/<token>/ 由 Next 在进入
  // middleware 前 308 规范化到无尾斜杠路径，正则本身不匹配带尾斜杠的地址。
  const isSharePage = /^\/share\/[A-Za-z0-9]{32}$/.test(pathname);

  const isAuthPage = isLoginPage || isRegisterPage;
  const isPublicPage = isAuthPage || isSharePage;

  if (!hasSession && !isPublicPage) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 已登录访问登录/注册页时回首页；分享页对登录用户也保持可读。
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL('/today', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // 放行静态资源与 PWA 相关的根路径文件：/icons/*、/icon.png、/apple-icon.png、
  // /favicon.png、/manifest.webmanifest 都不能被登录跳转拦掉，否则加桌面图标会坏掉。
  matcher: [
    '/((?!api|_next/static|_next/image|icons/|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml|json|webmanifest)$).*)',
  ],
};
