# T10 响应式外壳（手机 / 平板 / PC）

## 目标

现在整站只有手机布局（每页容器 `max-w-[480px]`）。要做到：手机不变、平板两列、PC 左侧导航 + 宽内容区。**只改布局，不改任何业务逻辑与数据查询。**

## 现状

- `app/(tabs)/layout.tsx`：`<main class="mx-auto max-w-[480px] px-5 pt-6">` + 固定底栏 `<BottomNav />`
- `components/BottomNav.tsx`：`fixed inset-x-0 bottom-0 mx-auto max-w-[480px]`，4 个 Tab
- 四个页面各自假设单列宽度

## 断点规范

| 断点 | 布局 |
|---|---|
| `< 768px`（手机） | 现状：单列 + 底部 Tab，容器 `max-w-[480px]` 居中 |
| `768–1023px`（平板） | 内容 `max-w-3xl`（768px）居中，仍用底部 Tab；页面内部两列网格 |
| `≥ 1024px`（PC） | **左侧固定导航 232px**（顶部猫头像 + 名字 + 4 个导航项 + 底部主题切换入口），内容区 `max-w-5xl`，**不再显示底部 Tab** |

## 要求

1. 新增 `components/AppShell.tsx`（服务端组件，接收 `children`）：负责三档布局骨架，内部渲染新的 `components/SideNav.tsx`（`'use client'`，含 framer-motion 选中指示条，与 BottomNav 视觉一致）和现有 `BottomNav`。
2. `app/(tabs)/layout.tsx` 改为用 `AppShell` 包内容，删除写死的 `max-w-[480px]`，内容宽度交给 AppShell。
3. `BottomNav` 加 `lg:hidden`（PC 隐藏），其余不动。
4. **页面内部网格**（只在 `md:` 以上生效，手机仍是单列）：
   - 今日：`md:grid-cols-2`，左列 = 煤球卡 + 今日状态 + 异常提示，右列 = 7 天指标 + 疫苗/驱虫倒计时
   - 数据：`md:grid-cols-2`，四张图两列排布
   - 记录：`md:grid-cols-2`，四组记录卡两列
   - 档案：`md:grid-cols-2`，猫信息 + 医院在左，账号 + 外观 + 数据 + 危险信号在右
5. **图表自适应**：recharts 的容器要有确定高度（如 `h-[220px] md:h-[260px]`），`ResponsiveContainer width="100%" height="100%"`，PC 上不要把图表拉成超宽矮条。
6. 触控与可读性不能退：手机端触控目标仍 ≥44px；PC 上字号不要放大到失控（正文保持 14–16px）。
7. 侧栏用 `sticky top-0 h-dvh`，内容区 `min-w-0` 避免图表撑破。

## 边界

允许改：`app/(tabs)/layout.tsx`、`components/AppShell.tsx`（新）、`components/SideNav.tsx`（新）、`components/BottomNav.tsx`（只加 hidden 类）、四个 `app/(tabs)/*/page.tsx`（只调容器与网格类名）、以及这些页面里图表的容器高度。
禁止改：`lib/`、`app/api/`、`app/actions/`、`middleware.ts`、数据查询与 Server Action、CI/Docker。
禁止新增依赖。

## 验收（自己跑并贴输出）

```bash
npx tsc --noEmit && npm run build
# 1) 页面容器里不再有 480 写死宽度（除 BottomNav/手机壳内部）
grep -rn "max-w-\[480px\]" app components | grep -v BottomNav
# 2) 侧栏与壳已就位
grep -n "lg:hidden" components/BottomNav.tsx
grep -n "md:grid-cols-2" "app/(tabs)/today/page.tsx" | head -3
# 3) 起服务后三种宽度下无横向滚动（用 curl 拿不到，改为自查类名是否成对）
```

第 3 条由委托方用浏览器在 375 / 768 / 1280 三个宽度下截图验收（`document.documentElement.scrollWidth === innerWidth`）。

## 禁止

- 不要引入 UI 库（不要再装 shadcn/radix 之类）
- 不要为了 PC 布局重写页面（只加网格类名）
- 不要改变手机端现有的视觉与动效
