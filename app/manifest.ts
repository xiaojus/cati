import type { MetadataRoute } from 'next';

/**
 * PWA manifest：加到主屏幕后全屏打开、状态栏与品牌色一致。
 * 图标在 public/icons/，maskable 版留了安全边距，安卓圆形裁切不会切到耳朵。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '煤球 · Cati',
    short_name: '煤球',
    description: '煤球的健康记录：今天怎么样，一条一条记下来',
    lang: 'zh-CN',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFF9F0',
    theme_color: '#F5B731',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
