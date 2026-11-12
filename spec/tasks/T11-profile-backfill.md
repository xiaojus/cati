# T11 档案可编辑 + 补记昨天

两个小而实的缺口：档案页的猫信息全是只读；忘了记录时找不到补昨天的入口。

## 一、档案可编辑

档案页的煤球信息卡（名字 / 生日 / 性别 / 是否绝育 / 绝育日期 / 备注）现在只读，要能改。

要求：

1. 新增 `app/actions/cat.ts`（`'use server'`），导出 `updateCat(input)`：
   - 用 `requireUser()` 取当前用户，**必须是 owner 才能改**（`cat_members.role === 'owner'`），否则返回 `{ ok:false, error:'只有创建者可以修改档案' }`
   - zod 校验：`name` 1–20 字、`birthEst` 用现有的 `isValidDateString()` 且不能是未来、`sex` 枚举 `F|M|U`、`neutered` 布尔、`neuteredAt` 可空且不早于出生日、`note` ≤200 字
   - 更新 `cats` 表对应字段，`revalidatePath('/profile')` 与 `revalidatePath('/today')`
   - **不要动 `lib/schema.ts`**：这些列都已存在
2. 档案页信息卡右上角加「编辑」按钮，点开一个 `components/CatProfileForm.tsx`（`'use client'`）抽屉/弹层，字段同上，保存后关闭并刷新页面数据。
3. 年龄、隔离天数这些**派生显示**由 `lib/dates.ts` 现成函数算，改完生日要跟着变（不要缓存）。
4. 表单校验错误用中文就地显示，不要 alert。
5. 头像上传这版**不做**（留给照片那一版），信息卡头像位置保持现状。

## 二、补记昨天

1. `components/QuickLogSheet.tsx` 增加可选 prop `initialDate?: string`（默认 `todayInShanghai()`），打开时日期选择器的初始值用它。
2. 今日页：
   - 「已记录 / 今天还没记」那条状态卡右侧加一个文字按钮「补记昨天」，点击打开抽屉且 `initialDate` = 昨天
   - 异常提示里如果有「48 小时未记录」这类条目，点击也打开同一个抽屉（`initialDate` 为昨天）
3. 抽屉里日期切换后，标题要明确显示记的是哪一天（例如「记录 11月11日」），避免补记时看错日期。
4. 保存逻辑不变：仍然只更新本次填写的字段（同日 upsert）。

## 边界

允许改：`app/actions/cat.ts`（新）、`components/CatProfileForm.tsx`（新）、`components/QuickLogSheet.tsx`、`app/(tabs)/profile/page.tsx`、`app/(tabs)/today/page.tsx`。
禁止改：`lib/schema.ts`、`lib/db.ts`、`lib/auth.ts`、`middleware.ts`、`app/api/`、CI/Docker、其他页面。
禁止新增依赖。

## 验收（自己跑并贴输出）

```bash
npx tsc --noEmit && npm run build
grep -n "initialDate" components/QuickLogSheet.tsx "app/(tabs)/today/page.tsx" | head -5
grep -n "requireUser\|owner" app/actions/cat.ts | head -5
```

另外用 node 直接验证字段范围校验逻辑不崩：

```bash
node -e "const {z}=require('zod'); console.log('zod ok', typeof z.object)"
```

## 禁止

- 不要把档案编辑做成整页表单（是弹层，和快速录入一致的交互）
- 不要改 `cats` 表结构
- 不要在 Server Action 里信任客户端传的 catId（用当前用户绑定的猫）
