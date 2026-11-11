import type { ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main
        className="mx-auto min-h-dvh w-full max-w-[480px] px-5 pt-6"
        style={{
          paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </main>
      <BottomNav />
    </>
  );
}
