# T8 PWA 与移动端打磨 + 部署

## PWA

- `app/manifest.webmanifest`（用 `app/manifest.ts` 生成）：name「煤球」、short_name「煤球」、`display: standalone`、`start_url: /today`、`theme_color: #F5B731`、`background_color: #FFF9F0`、icons 192/512（+ maskable）
- `app/layout.tsx`：`viewport` 里 `themeColor`、`appleWebApp: {capable:true, title:'煤球', statusBarStyle:'default'}`，`<meta name="apple-mobile-web-app-capable">`
- `app/icon.svg` 与 `app/apple-icon.png`：黑猫剪影 + 两点金瞳
- 不做 service worker 离线缓存（数据必须实时，v1 不需要离线）

## 移动端打磨

- 全局：`overscroll-behavior-y: contain`、`-webkit-tap-highlight-color: transparent`、`touch-action: manipulation`
- 输入框 `font-size: 16px` 起（防 iOS 聚焦缩放）
- 底部导航与悬浮按钮避让 `env(safe-area-inset-bottom)`
- 所有可点区域 ≥44×44；抽屉支持下滑关闭
- 暗色模式检查：卡片、图表轴线、提示条颜色都要可读

## 部署产物

- `Dockerfile`（多阶段，standalone）、`docker-compose.yml`（127.0.0.1:3100）、`.dockerignore`
- 容器启动先跑 `scripts/migrate.cjs` 再启 server
- `/api/health` 返回 `{ok, counts}`，供 healthcheck 与 CI 冒烟使用

## 验收

- 手机打开 `https://cati.cocodemo.cloud`：可加到主屏、状态栏正常、无横向滚动
- Lighthouse（移动）PWA 可安装、Performance ≥ 80
- `docker compose up -d --build` 后 30 秒内 `/api/health` 返回 ok
- 容器重建（`docker compose down && up -d`）后数据仍在（volume 挂载生效）
