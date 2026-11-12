import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';

const THEME_COOKIE = 'cati_theme';

/*
 * 根布局读取 cookie 决定首屏主题，整个应用按请求渲染；
 * 按 Next 16 Cache Components 的要求显式标记为阻塞路由。
 */
export const instant = false;

type Theme = 'system' | 'light' | 'dark';

function normalizeTheme(value: string | undefined): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/*
 * 首屏绘制前把 system 解析成 light/dark，并监听系统变化。
 * 页面本身已由服务端写入 cookie 里的偏好；ThemeToggle 会同步
 * window.__catiTheme，所以用户手动选择后系统变化不会覆盖它。
 */
const THEME_SCRIPT = `(function(){try{var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(t){window.__catiTheme=t;d.setAttribute("data-theme",t==="system"?(m.matches?"dark":"light"):t)}a(d.getAttribute("data-theme")||"system");var f=function(){if((window.__catiTheme||"system")==="system")a("system")};if(m.addEventListener)m.addEventListener("change",f);else if(m.addListener)m.addListener(f)}catch(e){}})()`;

export const metadata: Metadata = {
  title: '煤球 · Cati',
  description: '煤球的健康记录：今天怎么样，一条一条记下来',
  applicationName: '煤球 · Cati',
  appleWebApp: {
    capable: true,
    title: '煤球',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/favicon.png', sizes: '64x64', type: 'image/png' }],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5B731' },
    { media: '(prefers-color-scheme: dark)', color: '#12100E' },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="zh-CN"
      className="h-full"
      data-theme={theme}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
