import type { ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';
import SideNav from '@/components/SideNav';

/**
 * 三档布局外壳：
 * - < 768px：单列，内容 max-w-480 居中，底部 Tab
 * - 768–1023px：内容 max-w-3xl 居中，仍用底部 Tab
 * - ≥ 1024px：左侧 232px 固定导航，内容 max-w-5xl，隐藏底部 Tab
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <SideNav />

      <main className="min-w-0 flex-1 px-5 pb-[calc(6rem_+_env(safe-area-inset-bottom))] pt-6 lg:px-10 lg:pb-10 lg:pt-10">
        <div className="mx-auto w-full max-w-[480px] md:max-w-3xl lg:max-w-5xl">
          {children}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
