# T13 多猫切换 + 记录人可见 + 冲突提示

T12 已经让同一只猫可以有多个家长。这一版解决三件事：家里不止一只猫怎么切、一条记录是谁写的、两个人同一天都记时会不会互相覆盖而不自知。

## 一、当前猫的解析（统一入口）

新增 `lib/current-cat.ts`：

```ts
export async function getMemberships(userId: string)   // 返回 [{ cat, role }]
export async function requireCurrentCat(): Promise<{ cat, role, memberships }>
```

- 读 cookie `cati_cat`；若为空或该 cat 不在用户 membership 里，取 membership 第一条，并把 cookie 纠正过来（`httpOnly: true, maxAge: 一年, sameSite: 'lax'`）
- **权限**：cookie 里的 catId 必须校验属于当前用户，禁止直接信任 cookie
- 新增 `setCurrentCat(catId)` Server Action：校验 membership 后写 cookie + `revalidatePath('/today')`

所有页面读取"当前猫"的地方统一改成 `requireCurrentCat()`（today/data/records/profile 四个页面 + 相关 action）。**不要在页面里各写一份查询。**

## 二、切换 UI

1. PC 侧栏顶部：当前猫头像 + 名字 + 下拉箭头，点击弹出成员猫列表（含「添加另一只宠物」）。只有一只猫时不显示下拉箭头。
2. 手机/平板：今日页顶部煤球卡右上角加一个小的切换按钮（只有多猫时出现），点击弹出底部 sheet 选择。
3. 档案页新增「我的宠物」卡：列出所有 membership（猫名 + 角色），可切换、可添加新宠物（复用 T12 的创建逻辑，写入 owner）。
4. 添加宠物后自动切到新猫并跳 `/today`。

## 三、记录人可见

1. 今日页「已记录」状态卡：显示「今天由 <昵称> 记录 · HH:mm」，用 `daily_logs.updated_by`（没有则 `created_by`）关联 `users.display_name`，昵称为空时显示邮箱前缀。
2. 数据页的每日明细（如果有列表）同样显示记录人首字圆形头像，鼠标悬停显示全名。
3. 记录页（疫苗/驱虫/就诊）卡片右下角显示「<昵称> 添加」。

## 四、同日冲突提示

1. 打开快速录入/补记抽屉时，若该日期已有记录且 `updated_by`（或 `created_by`）不是当前用户：
   - 抽屉顶部显示一条金色提示条：「<昵称> 今天已经记过，保存只会覆盖你填的项目」
2. `saveLog` 服务端也做一次检查：如果记录存在且 `updated_by` 不是当前用户，仍允许合并，但返回值带上 `mergedWith: { name, updatedAt }`；前端保存成功后 toast 改成「已合并到 <昵称> 的记录」。
3. 不允许出现"后写覆盖前写整行"的行为——必须保持只更新本次填写字段。

## 边界

允许改：`lib/current-cat.ts`（新）、`app/actions/logs.ts`、`app/actions/cat.ts`、`app/(tabs)/{today,data,records,profile}/page.tsx`、`components/QuickLogSheet.tsx`、`components/SideNav.tsx`、`components/CatSwitcher.tsx`（新）、`components/Attendance` 相关卡片组件。
禁止改：`lib/schema.ts`、`drizzle/**`（T12 已定）、`middleware.ts`、`app/api/**`、CI/Docker。
禁止新增依赖。

## 验收（自己跑并贴输出）

```bash
npx tsc --noEmit && npm run build
grep -rn "requireCurrentCat" app lib | head -8
grep -rn "cati_cat" lib app | head -5
```

数据库层验证（用副本，不动 `data/cat.db`）：

```bash
cp data/cat.db /tmp/t13.db
CAT_DB=/tmp/t13.db node scripts/migrate.cjs
node -e "
const D=require('better-sqlite3'); const db=new D('/tmp/t13.db');
const cats=db.prepare('select id,name from cats').all();
console.log('cats', cats.length, 'members', db.prepare('select count(*) c from cat_members').get().c);
console.log('logs with updater', db.prepare('select count(*) c from daily_logs where updated_by is not null').get().c);
"
```

## 禁止

- 不要信任客户端传来的 catId 做写操作（一律 `requireCurrentCat()` 校验 membership）
- 不要做成"切换后所有页面硬刷新"（用 `router.refresh()` 或 `revalidatePath`）
- 不要把多猫做成账户级别的全局设置（per-browser cookie，两台设备可以看不同的猫）
