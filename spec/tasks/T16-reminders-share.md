# T16 到期提醒 + 给兽医看的一周摘要

## 一、到期提醒（应用内聚合）

现在疫苗/驱虫只有倒计时，散落在今日页。要做的是一个**「接下来要做什么」**卡片：

1. 今日页在「需要留意」下面新增「接下来」卡片，聚合三类事项，按到期日升序：
   - 疫苗 `next_due`、体内/体外驱虫 `next_due`
   - 就诊记录的复诊日期（`records` 里 type=就诊 的 `next_due`）
   - 未绝育且估算年龄 ≥ 6 个月 → 「该安排绝育了」（无具体日期，排在最后）
2. 每条显示：事项 + 「还有 3 天 / 已过期 2 天 / 今天」+ 点击跳到记录页对应分组
3. 7 天内到期的用金色标，已过期用珊瑚色标，其余灰色
4. 空状态：「暂时没有要到期的事」一行灰字，不占大块版面
5. **不新增数据表**：全部从 `records.next_due` + `cats.neutered/birth_est` 算

## 二、给兽医看的一周摘要（只读分享）

1. 迁移 `0004_share_links.sql` 新表 `share_links`：
   - `token` text 主键（32 位 base62）
   - `catId` → cats（cascade）
   - `createdBy` → users
   - `expiresAt` text 必填（默认 7 天）
   - `revokedAt` text 可空
   - `createdAt` text 必填
2. `app/share/[token]/page.tsx`（**不需要登录**，但 middleware 必须放行 `/share/`）：
   - 校验 token 存在、未过期、未作废，否则显示「这个链接已失效」页面（200，不是 404，避免暴露 token 是否存在）
   - 内容（只读，无底部导航、无编辑按钮）：
     - 头部：猫名、年龄、性别、绝育状态、「数据由主人记录，非医疗诊断」
     - 最近 7 天表格：日期 / 食欲 / 饮水 / 便便 / 排便次数 / 呕吐 / 精神 / 体重 —— 空值显示「—」
     - 体重趋势小图（recharts 折线，固定高度 160px）
     - 近期记录：疫苗、驱虫、就诊（含药名/剂量/当时体重）
     - 页脚：`生成于 2026-11-13 01:40 · 链接 7 天后失效`
3. 生成入口：记录页顶部 + 档案页各一个「给兽医看最近一周」按钮 → 生成 token（7 天）→ 弹出可复制的完整链接 `https://<host>/share/<token>`；同时列出已生成的有效链接，可「作废」。
4. `app/actions/share.ts`：`createShareLink()`、`revokeShareLink(token)`，服务端校验 membership。
5. middleware 放行规则要精确：只放行 `^/share/[A-Za-z0-9]{32}$`，不要放行整个 `/share`。
6. 分享页要 `export const dynamic = 'force-dynamic'`，并 `robots: noindex`（metadata）。

## 边界

允许改：`lib/schema.ts`、`drizzle/**`、`app/share/[token]/page.tsx`（新）、`app/actions/share.ts`（新）、`middleware.ts`（只加 /share 正则）、`components/ShareLinkCard.tsx`（新）、`app/(tabs)/{today,records,profile}/page.tsx`。
禁止改：注册/邀请逻辑、AI 解析、上传路由、CI/Docker。
禁止新增依赖。

## 验收（自己跑并贴输出）

```bash
npx tsc --noEmit && npm run build
cat drizzle/0004_share_links.sql
grep -n "share" middleware.ts
```

手工链路（用副本库 + 临时 token）：

```bash
# 1) 未登录访问 /share/<有效 token> 返回 200 且能看到猫名
# 2) 过期 token 返回失效页
# 3) /share/abc（长度不对）走 middleware 的登录保护 → 307 到 /login
# 4) 分享页 HTML 内不含 session cookie 相关、不含编辑按钮文案
```

## 禁止

- 分享页绝不能出现编辑/删除/记录入口
- 分享页不能返回健康记录的 `created_by` 邮箱等隐私字段
- 不要把 token 存成可预测的自增
