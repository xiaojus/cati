# T9 浅色主题三态（跟随系统 / 浅色 / 深色）

## 目标

现在主题跟着系统走（`@media (prefers-color-scheme: dark)`），用户无法自己选。改成三态可切换，**默认仍然跟随系统**，深色是当前视觉基准，浅色要等值好看。

## 现状

- `app/globals.css`：`@theme` 里是颜色 token；`body` 背景用媒体查询切 `cream` / `night`
- 全站组件里大量 `dark:` 前缀（Tailwind v4，默认的 `dark` 变体是媒体查询驱动）
- `app/layout.tsx`：`metadata` + `viewport`，`<html lang="zh-CN">`

## 要求

1. **用 cookie 承载偏好**，键名 `cati_theme`，值 `system | light | dark`，缺省 `system`，`maxAge` 一年，`sameSite=lax`，非 httpOnly（前端要读）。
2. `app/layout.tsx` 里 `await cookies()` 读偏好，写到 `<html data-theme={...}>`（Next 16 的 cookies 是异步的）。
3. **把 Tailwind 的 dark 变体从媒体查询改成属性选择器**：
   ```css
   @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
   ```
   之后 `dark:` 前缀只认 `data-theme="dark"`。
4. **`system` 的解析**：`data-theme="system"` 时用一个内联脚本在首屏绘制前把它改成 `light` / `dark`（读 `matchMedia('(prefers-color-scheme: dark)')`），并监听系统变化实时更新。脚本要小、同步、放在 `<head>` 里，避免闪白。
5. `body` 背景/文字颜色改为由 `[data-theme]` 驱动的 CSS 变量，不再用媒体查询。
6. **设置入口放在档案页**：新增 `components/ThemeToggle.tsx`（`'use client'`），三选一分段控件（跟随系统 / 浅色 / 深色），点击后：写 cookie（`document.cookie` 即可）+ 立刻更新 `document.documentElement.dataset.theme` + 选中态金色。
7. **浅色配色**：现有 token 是深色基准。浅色下要保证：正文对比度 ≥ 4.5:1、卡片与页面背景有层次（奶油白底 + 纯白卡片或反向）、金色 `#F5B731` 在浅底上不要用作正文色（用 `--color-gold-deep #D99A1F`）、珊瑚/薄荷同样加深一档。需要的话在 `:root[data-theme="light"]` 里覆盖一组变量，不要在组件里散落写死颜色。
8. 档案页里加一行设置项：`外观` + `<ThemeToggle />`，位置在「账号区」之上、猫信息卡之下，样式与其他卡片一致。

## 边界

允许改：`app/globals.css`、`app/layout.tsx`、`components/ThemeToggle.tsx`（新建）、`app/(tabs)/profile/page.tsx`（只加设置项）。
禁止改：`lib/`、`app/api/`、`middleware.ts`、任何数据逻辑、`spec/DEV.md`、CI/Docker 文件。
禁止新增依赖。

## 验收（必须自己跑并把输出贴出来）

```bash
npx tsc --noEmit && npm run build
# 1) 默认跟随系统：不带 cookie 时 html 上有 data-theme="system"
curl -s http://127.0.0.1:3000/login | grep -o 'data-theme="[a-z]*"' | head -1
# 2) 显式浅色：带 cati_theme=light 时 html 上是 light
curl -s -b 'cati_theme=light' http://127.0.0.1:3000/login | grep -o 'data-theme="[a-z]*"' | head -1
# 3) 显式深色
curl -s -b 'cati_theme=dark' http://127.0.0.1:3000/login | grep -o 'data-theme="[a-z]*"' | head -1
# 4) 确认不再依赖媒体查询驱动 dark 变体
grep -n 'prefers-color-scheme' app/globals.css
```

期望：1/2/3 分别输出 `system` / `light` / `dark`；4 只在 `system` 解析脚本或注释里出现，`body` 的背景规则里不再有媒体查询。

## 禁止

- 不要用 `next-themes` 或任何新包
- 不要把主题偏好存 localStorage（SSR 读不到，会闪白）
- 不要为了浅色好看而改动深色的视觉基准
